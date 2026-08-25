package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.model.GroupDefinition;
import com.gensynth.core.model.Variable;
import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.java_websocket.WebSocket;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Handles state serialization and persistence commands (GET_INITIAL_STATE, LOAD_STATE, SAVE_STATE, IMPORT_STATE, EXPORT_STATE).
 */
public class StateCommandHandler implements CommandHandler {

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
        server.logToBackend("info", "SYSTEM", "State loaded from repository", commandId);
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
        server.logToBackend("info", "SYSTEM", "State saved to repository", commandId);
        server.sendAck(conn, commandId, "state_saved");
    }

    /**
     * Handles the IMPORT_STATE command.
     *
     * @param conn the WebSocket connection
     * @param commandId the command identifier
     * @param payload the JSON payload containing the complete project state
     */
    public void handleImportState(WebSocket conn, String commandId, JsonNode payload) {
        UiBridgeWebSocketServer server = ctx.getServer();
        if (payload == null || !payload.has("groups")) {
            server.sendError(conn, commandId, "INVALID_PAYLOAD", "IMPORT_STATE requires a payload with 'groups' array", Map.of());
            return;
        }

        ObjectMapper objectMapper = ctx.getObjectMapper();
        try {
            List<GroupDefinition> newGroups = new ArrayList<>();
            JsonNode groupsNode = payload.path("groups");
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

            synchronized (ctx.getStateLock()) {
                // Stop everything before clearing
                for (GroupRuntime group : ctx.getGroupsById().values()) {
                    server.flowCommandHandler.stopGroupInternal(group);
                }

                ctx.getGroupsById().clear();
                ctx.getVariablesById().clear();
                ctx.getConnectorByFlowId().clear();
                ctx.getPublisherTasksByFlowId().clear();

                for (GroupDefinition def : newGroups) {
                    ctx.getGroupsById().put(def.getGroupId(), GroupRuntime.fromDefinition(def));
                }
                for (Variable var : newVariables) {
                    ctx.getVariablesById().put(var.getId(), var);
                }

                ctx.setSystemRunning(false);
                persistState();
            }

            server.sendAck(conn, commandId, "state_imported");
            server.logToBackend("info", "SYSTEM", "State imported from UI (" + newGroups.size() + " groups)", commandId);
            server.broadcastGroupsUpdate();
            server.broadcastSystemStatus();
            server.sendVariablesUpdate();

        } catch (Exception e) {
            logger.error("Failed to import state", e);
            server.sendError(conn, commandId, "INTERNAL_ERROR", "Failed to parse imported state: " + e.getMessage(), Map.of());
        }
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
        String filePath = server.requireTextField(conn, commandId, payload, "filePath", "INVALID_PAYLOAD", "EXPORT_STATE");
        if (filePath == null) return;

        try {
            List<GroupDefinition> groupDefinitions = new ArrayList<>();
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                groupDefinitions.add(group.toDefinition());
            }

            ctx.getStateRepository().exportState(
                java.nio.file.Paths.get(filePath),
                groupDefinitions,
                new ArrayList<>(ctx.getVariablesById().values())
            );

            server.sendAck(conn, commandId, "state_exported");
            server.sendLog(conn, "info", "SYSTEM", "State exported to: " + filePath);
        } catch (Exception e) {
            server.sendError(conn, commandId, "EXPORT_FAILED", "Failed to export state: " + e.getMessage(), Map.of("path", filePath));
        }
    }

    /**
     * Persists the current runtime state of groups and variables to the state repository.
     */
    public void persistState() {
        try {
            List<GroupDefinition> groupDefinitions = new ArrayList<>();
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                groupDefinitions.add(group.toDefinition());
            }

            ctx.getStateRepository().saveGroups(groupDefinitions);
            ctx.getStateRepository().saveVariables(new ArrayList<>(ctx.getVariablesById().values()));
        } catch (Exception e) {
            ctx.getTotalErrors().incrementAndGet();
        }
    }

    /**
     * Loads the runtime state of groups and variables from the state repository.
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
            ctx.getPublisherTasksByFlowId().clear();

            try {
                List<GroupDefinition> persistedGroups = ctx.getStateRepository().loadGroups();
                List<Variable> persistedVariables = ctx.getStateRepository().loadVariables();

                if (persistedGroups.isEmpty() && createDefaultIfEmpty) {
                    persistState();
                } else {
                    for (GroupDefinition definition : persistedGroups) {
                        ctx.getGroupsById().put(definition.getGroupId(), GroupRuntime.fromDefinition(definition));
                    }
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
        payload.put("groups", server.toGroupsPayload());

        List<Map<String, Object>> variablesPayload = new ArrayList<>();
        synchronized (ctx.getStateLock()) {
            for (Variable variable : ctx.getVariablesById().values()) {
                variablesPayload.add(VariableCommandHandler.normalizeVariablePayloadForUi(variable.toPayload()));
            }
        }
        payload.put("variables", variablesPayload);
        payload.put("metrics", server.systemCommandHandler.buildMetricsPayload(null));
        payload.put("connectorCatalog", ctx.getConnectorCatalogService().listAvailableConnectors());

        try {
            Path reportPath = Paths.get("plugins", ".rollback_report.json");
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
                java.nio.file.Files.deleteIfExists(Paths.get("plugins", ".rollback_report.json"));
            } catch (Exception ignored) {}
        }

        return payload;
    }
}
