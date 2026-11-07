package com.gensynth.core.ws.handler;

import com.gensynth.core.config.AppPaths;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.model.GroupDefinition;
import com.gensynth.core.model.ProjectSettings;
import com.gensynth.core.model.Variable;
import com.gensynth.core.persistence.ProjectFileFormat;
import com.gensynth.core.util.UniqueNames;
import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.java_websocket.WebSocket;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.gensynth.core.ws.BridgeProtocol.SOURCE_SYSTEM;

/**
 * Handles state serialization and persistence commands (GET_INITIAL_STATE, LOAD_STATE, SAVE_STATE, IMPORT_STATE, EXPORT_STATE).
 */
public class StateCommandHandler implements CommandHandler {
    private static final String GROUPS = "groups";
    private static final String SETTINGS = "settings";
    private static final String FILE_PATH = "filePath";

    private static final Logger logger = LoggerFactory.getLogger(StateCommandHandler.class);

    private final BridgeContext ctx;

    /**
     * Constructs a StateCommandHandler with the shared BridgeContext.
     *
     * @param ctx the shared bridge context
     */
    public StateCommandHandler(BridgeContext ctx) {
        this.ctx = ctx;
    }

    @Override
    public void handle(WebSocket conn, JsonNode payload, String commandId) throws Exception {
        // Methods are routed individually by UiBridgeWebSocketServer.
    }

    /**
     * Handles the GET_INITIAL_STATE command.
     *
     * @param conn the WebSocket connection
     * @param commandId the command identifier
     */
    public void handleGetInitialState(WebSocket conn, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        server.sendMessage(conn, "INITIAL_STATE", commandId, buildInitialStatePayload(commandId));
        server.systemCommandHandler.sendFlowsMetrics(conn);
        // A window opened with a project (--open, double click) loads it once its UI is ready
        if (conn != null && conn == server.getDesktopSocket()) {
            String pending = server.takePendingOpenProject();
            if (pending != null) {
                server.requestOpenProject(pending);
            }
        }
    }

    /**
     * Handles the REQUEST_OPEN_PROJECT command, sent by the command line ({@code edit}) or by a
     * second launch of the application (double click on a project file): the desktop window
     * opens the project, or a new one, through the same steps as Load or New.
     *
     * @param conn      the connection that asked
     * @param commandId the command identifier
     * @param payload   {@code { "filePath": "<absolute path>" }}; without it, a new project
     */
    public void handleRequestOpenProject(WebSocket conn, String commandId, JsonNode payload) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String filePath = payload == null ? null : payload.path(FILE_PATH).asText(null);
        if (filePath != null && filePath.isBlank()) {
            filePath = null;
        }
        if (filePath != null) {
            try {
                // Checked here so the one asking learns at once that the file cannot be opened
                ProjectFileFormat.read(Path.of(filePath), ctx.getObjectMapper());
            } catch (IllegalArgumentException e) {
                server.sendError(conn, commandId, "INVALID_PROJECT_FILE", e.getMessage(), Map.of(FILE_PATH, filePath));
                return;
            } catch (java.io.IOException e) {
                server.sendError(conn, commandId, "LOAD_FAILED", "Cannot read " + filePath + ": " + e.getMessage(),
                    Map.of(FILE_PATH, filePath));
                return;
            }
        }
        if (!server.hasWindow()) {
            server.sendError(conn, commandId, "NO_DESKTOP_WINDOW",
                "GenSynth is running without its window (browser mode): open the project from the browser", Map.of());
            return;
        }
        server.requestOpenProject(filePath);
        server.sendAck(conn, commandId, "open_project_requested");
    }

    /**
     * Handles the LOAD_STATE command.
     *
     * @param conn the WebSocket connection
     * @param commandId the command identifier
     */
    public void handleLoadState(WebSocket conn, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        loadRuntimeState(true);
        server.logToBackend("info", SOURCE_SYSTEM, "State loaded from repository", commandId);
        handleGetInitialState(conn, commandId);
    }

    /**
     * Handles the SAVE_STATE command.
     *
     * @param conn the WebSocket connection
     * @param commandId the command identifier
     */
    public void handleSaveState(WebSocket conn, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        persistState();
        server.logToBackend("info", SOURCE_SYSTEM, "State saved to repository", commandId);
        server.sendAck(conn, commandId, "state_saved");
    }

    /**
     * Handles the IMPORT_STATE command.
     *
     * @param conn the WebSocket connection
     * @param commandId the command identifier
     * @param payload the JSON payload containing the complete project state, optionally its
     *                {@code settings} (defaults when missing) and the {@code sourceFilePath}
     *                it was read from (echoed back in the ack)
     */
    public void handleImportState(WebSocket conn, String commandId, JsonNode payload) {
        UiBridgeWebSocketServer server = ctx.getServer();
        if (payload == null || !payload.has(GROUPS)) {
            server.sendError(conn, commandId, "INVALID_PAYLOAD", "IMPORT_STATE requires a payload with 'groups' array", Map.of());
            return;
        }

        try {
            int importedGroups = importProject(payload, true);

            // Echo the source file path (set by the desktop LOAD_STATE dialog) so the UI can track the open file
            String sourceFilePath = payload.path("sourceFilePath").asText(null);
            if (sourceFilePath != null && !sourceFilePath.isBlank()) {
                server.sendAck(conn, commandId, "state_imported", Map.of(FILE_PATH, sourceFilePath));
            } else {
                server.sendAck(conn, commandId, "state_imported");
            }
            server.logToBackend("info", SOURCE_SYSTEM, "State imported from UI (" + importedGroups + " groups)", commandId);
            server.broadcastGroupsUpdate();
            server.broadcastSystemStatus();
            server.sendVariablesUpdate();
            server.settingsCommandHandler.broadcastSettingsUpdate();
            server.broadcastFlowsMetrics();

        } catch (Exception e) {
            logger.error("Failed to import state", e);
            server.sendError(conn, commandId, "INTERNAL_ERROR", "Failed to parse imported state: " + e.getMessage(), Map.of());
        }
    }

    /**
     * Replaces the runtime state with a complete project: stops every running group, then loads
     * the groups, variables and settings of the payload. Used by IMPORT_STATE and by the
     * headless command line, which does not persist the imported project.
     *
     * @param payload the project state ({@code groups}, {@code variables} and optional {@code settings})
     * @param persist true to save the imported state to the state repository (autosave)
     * @return the number of imported groups
     * @throws IllegalArgumentException if the payload has no {@code groups} or cannot be parsed
     */
    public int importProject(JsonNode payload, boolean persist) {
        if (payload == null || !payload.has(GROUPS)) {
            throw new IllegalArgumentException("The project requires a 'groups' array");
        }
        UiBridgeWebSocketServer server = ctx.getServer();
        ObjectMapper objectMapper = ctx.getObjectMapper();

        List<GroupDefinition> newGroups = new ArrayList<>();
        JsonNode groupsNode = payload.path(GROUPS);
        if (groupsNode.isArray()) {
            for (JsonNode groupNode : groupsNode) {
                @SuppressWarnings("unchecked")
                Map<String, Object> groupMap = objectMapper.convertValue(groupNode, Map.class);
                newGroups.add(GroupDefinition.fromPayload(groupMap));
            }
        }

        List<Variable> newVariables = new ArrayList<>();
        JsonNode variablesNode = payload.path("variables");
        if (variablesNode.isArray()) {
            for (JsonNode varNode : variablesNode) {
                @SuppressWarnings("unchecked")
                Map<String, Object> varMap = objectMapper.convertValue(varNode, Map.class);
                Variable variable = Variable.fromPayload(varMap);
                if (variable.getScope().equals("LOCAL")) {
                    logger.info("Importing LOCAL variable '{}' for flow '{}'", variable.getName(), variable.getFlowId());
                }
                newVariables.add(variable);
            }
        }

        ProjectSettings settings = ProjectSettings.fromPayload(
            payload.has(SETTINGS) ? objectMapper.convertValue(payload.get(SETTINGS), Map.class) : null
        );

        synchronized (ctx.getStateLock()) {
            // Stop everything before clearing
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                server.flowCommandHandler.stopGroupInternal(group);
            }

            ctx.getGroupsById().clear();
            ctx.getVariablesById().clear();
            ctx.getConnectorByFlowId().clear();

            for (GroupDefinition def : newGroups) {
                ctx.getGroupsById().put(def.getGroupId(), GroupRuntime.fromDefinition(def));
            }
            for (Variable var : newVariables) {
                ctx.getVariablesById().put(var.getId(), var);
            }
            logDuplicateNames(ctx.getGroupsById().values());

            ctx.setSystemRunning(false);
            ctx.applyProjectSettings(settings);
            if (persist) {
                persistState();
            }
        }
        return newGroups.size();
    }

    /**
     * Handles the EXPORT_STATE command.
     *
     * @param conn the WebSocket connection
     * @param commandId the command identifier
     * @param payload the JSON payload containing the filePath
     */
    public void handleExportState(WebSocket conn, String commandId, JsonNode payload) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String filePath = server.requireTextField(conn, commandId, payload, FILE_PATH, "INVALID_PAYLOAD", "EXPORT_STATE");
        if (filePath == null) return;

        try {
            List<GroupDefinition> groupDefinitions = new ArrayList<>();
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                groupDefinitions.add(group.toDefinition());
            }

            ctx.getStateRepository().exportState(
                java.nio.file.Paths.get(filePath),
                groupDefinitions,
                new ArrayList<>(ctx.getVariablesById().values()),
                ctx.getProjectSettings()
            );

            server.sendAck(conn, commandId, "state_exported", Map.of(FILE_PATH, filePath));
            server.sendLog(conn, "info", SOURCE_SYSTEM, "State exported to: " + filePath);
        } catch (Exception e) {
            server.sendError(conn, commandId, "EXPORT_FAILED", "Could not save the project. " + e.getMessage(), Map.of("path", filePath));
        }
    }

    /**
     * Persists the current runtime state of groups, variables and project settings to the state repository.
     */
    public void persistState() {
        try {
            List<GroupDefinition> groupDefinitions = new ArrayList<>();
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                groupDefinitions.add(group.toDefinition());
            }

            ctx.getStateRepository().saveGroups(groupDefinitions);
            ctx.getStateRepository().saveVariables(new ArrayList<>(ctx.getVariablesById().values()));
            ctx.getStateRepository().saveSettings(ctx.getProjectSettings());
        } catch (Exception e) {
            ctx.getTotalErrors().incrementAndGet();
        }
    }

    /**
     * Loads the runtime state of groups, variables and project settings from the state repository.
     *
     * @param createDefaultIfEmpty if true and the repository is empty, saves an empty state to initialize
     */
    public void loadRuntimeState(boolean createDefaultIfEmpty) {
        UiBridgeWebSocketServer server = ctx.getServer();
        synchronized (ctx.getStateLock()) {
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                server.flowCommandHandler.stopGroupInternal(group);
            }

            ctx.getGroupsById().clear();
            ctx.getVariablesById().clear();
            ctx.getConnectorByFlowId().clear();

            try {
                List<GroupDefinition> persistedGroups = ctx.getStateRepository().loadGroups();
                List<Variable> persistedVariables = ctx.getStateRepository().loadVariables();
                ctx.applyProjectSettings(ctx.getStateRepository().loadSettings());

                if (persistedGroups.isEmpty() && createDefaultIfEmpty) {
                    persistState();
                } else {
                    for (GroupDefinition definition : persistedGroups) {
                        ctx.getGroupsById().put(definition.getGroupId(), GroupRuntime.fromDefinition(definition));
                    }
                    logDuplicateNames(ctx.getGroupsById().values());
                }

                for (Variable variable : persistedVariables) {
                    ctx.getVariablesById().put(variable.getId(), variable);
                }

                ctx.setSystemRunning(false);
            } catch (Exception e) {
                ctx.setSystemRunning(false);
            }
        }
    }

    /**
     * Describes the repeated names of a loaded project: groups with the same name and flows with
     * the same name in one group (same name = equal after trimming, ignoring case). New names are
     * checked by the commands, but older projects may contain them; they are still loaded as they
     * are, since renaming would change their outputs.
     *
     * @param groups the loaded groups
     * @return one warning per repeated name, empty when every name is unique
     */
    public static List<String> duplicateNameWarnings(Collection<GroupRuntime> groups) {
        List<String> warnings = new ArrayList<>();
        List<String> groupNames = new ArrayList<>();
        for (GroupRuntime group : groups) {
            groupNames.add(group.name);
            for (String name : UniqueNames.duplicates(group.flowNames(null))) {
                warnings.add("Group '" + group.name + "' has several flows named '" + name
                    + "': with file output they write to the same file. Rename them.");
            }
        }
        for (String name : UniqueNames.duplicates(groupNames)) {
            warnings.add("Several groups are named '" + name
                + "': with file output their flows can write to the same files. Rename them.");
        }
        return warnings;
    }

    private static void logDuplicateNames(Collection<GroupRuntime> groups) {
        for (String warning : duplicateNameWarnings(groups)) {
            logger.warn("[SYSTEM] {}", warning);
        }
    }

    /**
     * Builds a complete payload representing the initial state of the simulator.
     *
     * @param commandId the command identifier
     * @return the initial state payload map
     */
    public Map<String, Object> buildInitialStatePayload(String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        Map<String, Object> payload = new LinkedHashMap<>();
        if (commandId != null) {
            payload.put("commandId", commandId);
        }

        payload.put("systemStatus", server.systemCommandHandler.buildSystemStatusPayload(null));
        payload.put(GROUPS, server.toGroupsPayload());

        List<Map<String, Object>> variablesPayload = new ArrayList<>();
        synchronized (ctx.getStateLock()) {
            for (Variable variable : ctx.getVariablesById().values()) {
                variablesPayload.add(VariableCommandHandler.normalizeVariablePayloadForUi(variable.toPayload()));
            }
        }
        payload.put("variables", variablesPayload);
        payload.put(SETTINGS, ctx.getProjectSettings().toPayload());
        payload.put("outputFolder", ctx.outputFolderPayload());
        payload.put("metrics", server.systemCommandHandler.buildMetricsPayload(null));
        payload.put("connectorCatalog", ctx.getConnectorCatalogService().listAvailableConnectors());

        try {
            Path reportPath = AppPaths.current().rollbackReport();
            if (java.nio.file.Files.exists(reportPath)) {
                String content = java.nio.file.Files.readString(reportPath, java.nio.charset.StandardCharsets.UTF_8);
                // Strip UTF-8 BOM if present
                if (content.startsWith("\uFEFF")) {
                    content = content.substring(1);
                }
                payload.put("rollbackReport", ctx.getObjectMapper().readTree(content));
                java.nio.file.Files.delete(reportPath);
                logger.info("[PLUGINS] Rollback report embedded in INITIAL_STATE and cleared.");
            }
        } catch (Exception e) {
            logger.error("Failed to include rollback report in initial state", e);
            try {
                java.nio.file.Files.deleteIfExists(AppPaths.current().rollbackReport());
            } catch (Exception ignored) {}
        }

        return payload;
    }
}
