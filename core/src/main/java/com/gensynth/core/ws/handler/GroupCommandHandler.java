package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.gensynth.core.model.OutputMode;
import com.gensynth.core.model.SequentialOrder;
import com.gensynth.core.model.Variable;
import com.gensynth.core.util.NamingPattern;
import com.gensynth.core.util.UniqueNames;
import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.java_websocket.WebSocket;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static com.gensynth.core.ws.BridgeProtocol.GROUP_ID;
import static com.gensynth.core.ws.BridgeProtocol.GROUP_NOT_FOUND;
import static com.gensynth.core.ws.BridgeProtocol.INVALID_PAYLOAD;
import static com.gensynth.core.ws.BridgeProtocol.NOT_FOUND;
import static com.gensynth.core.ws.BridgeProtocol.SOURCE_GROUPS;

/**
 * Handles group management actions (create, delete, update, clone, start, stop, pause).
 */
public class GroupCommandHandler implements CommandHandler {

    private static final String DESCRIPTION = "description";
    private static final String THREADS = "threads";
    private static final String OUTPUT_MODE = "outputMode";
    private static final String SEQUENTIAL_ORDER = "sequentialOrder";
    private static final String INVALID_OUTPUT_MODE = "outputMode must be 'parallel' or 'sequential'";
    private static final String INVALID_SEQUENTIAL_ORDER = "sequentialOrder must be 'flow', 'random' or 'generated'";
    private static final String INVALID_FLOW_IDS = "flowIds must be a list of flow ids";
    private final BridgeContext ctx;
    private final FlowCommandHandler flowHandler;

    public GroupCommandHandler(BridgeContext ctx, FlowCommandHandler flowHandler) {
        this.ctx = ctx;
        this.flowHandler = flowHandler;
    }

    @Override
    public void handle(WebSocket conn, JsonNode payload, String commandId) throws IOException {
        // Will be routed by method references directly.
    }

    public void handleCreateGroup(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String name = server.requireTextField(conn, commandId, payload, "name", INVALID_PAYLOAD, "CREATE_GROUP");
        if (name == null) {
            return;
        }

        String clientRequestId = payload.path("clientRequestId").asText(null);

        synchronized (ctx.getStateLock()) {
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                if (UniqueNames.sameName(group.name, name)) {
                    server.sendError(conn, commandId, clientRequestId, INVALID_PAYLOAD, "Group name already exists", Map.of("name", name));
                    return;
                }
            }

            String id = payload.path(GROUP_ID).asText("");
            if (id.isBlank()) {
                id = UUID.randomUUID().toString();
            }
            String description = payload.path(DESCRIPTION).asText("");
            int threads = Math.max(1, payload.path(THREADS).asInt(1));
            String outputMode = payload.path(OUTPUT_MODE).asText(OutputMode.PARALLEL.wireValue());
            if (!OutputMode.isValid(outputMode)) {
                server.sendError(conn, commandId, clientRequestId, INVALID_PAYLOAD, INVALID_OUTPUT_MODE, Map.of(OUTPUT_MODE, outputMode));
                return;
            }
            String sequentialOrder = payload.path(SEQUENTIAL_ORDER).asText(SequentialOrder.FLOW.wireValue());
            if (!SequentialOrder.isValid(sequentialOrder)) {
                server.sendError(conn, commandId, clientRequestId, INVALID_PAYLOAD, INVALID_SEQUENTIAL_ORDER, Map.of(SEQUENTIAL_ORDER, sequentialOrder));
                return;
            }

            GroupRuntime newGroup = new GroupRuntime(id, name, "stopped", description, threads, outputMode, true);
            newGroup.sequentialOrder = SequentialOrder.fromValue(sequentialOrder).wireValue();
            ctx.getGroupsById().put(id, newGroup);
            server.persistState();

            server.sendCreatedResponse(conn, commandId, clientRequestId, newGroup.toPayload(), "group_created");
        }

        server.logToBackend("info", SOURCE_GROUPS, "Created group '" + name + "'", commandId);
        server.broadcastGroupsUpdate();
    }

    public void handleDeleteGroup(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, GROUP_ID, INVALID_PAYLOAD, "DELETE_GROUP");
        if (groupId == null) {
            return;
        }

        String groupName;
        synchronized (ctx.getStateLock()) {
            GroupRuntime group = ctx.getGroupsById().remove(groupId);
            if (group == null) {
                server.sendError(conn, commandId, NOT_FOUND, GROUP_NOT_FOUND + groupId, Map.of(GROUP_ID, groupId));
                return;
            }
            groupName = group.name;

            flowHandler.stopGroupInternal(group);
            server.persistState();
            ctx.setSystemRunning(flowHandler.hasAnyRunningGroup());
        }

        server.sendAck(conn, commandId, "group_deleted");
        server.logToBackend("info", SOURCE_GROUPS, "Deleted group '" + groupName + "'", commandId);

        server.broadcastGroupsUpdate();
        server.broadcastSystemStatus();
    }

    public void handleUpdateGroupConfig(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, GROUP_ID, INVALID_PAYLOAD, "UPDATE_GROUP_CONFIG");
        if (groupId == null) {
            return;
        }

        synchronized (ctx.getStateLock()) {
            GroupRuntime group = ctx.getGroupsById().get(groupId);
            if (group == null) {
                server.sendError(conn, commandId, NOT_FOUND, GROUP_NOT_FOUND + groupId, Map.of(GROUP_ID, groupId));
                return;
            }

            // Validate every field before changing anything, so a rejected update leaves the group as it was
            Optional<GroupUpdate> update = readGroupUpdate(conn, commandId, payload, group);
            if (update.isEmpty()) {
                return;
            }
            applyGroupUpdate(group, update.get(), payload);

            server.persistState();
        }

        server.sendAck(conn, commandId, "group_updated");
        GroupRuntime group = ctx.getGroupsById().get(groupId);
        server.logToBackend("info", SOURCE_GROUPS, "Updated config for group '" + (group != null ? group.name : groupId) + "'", commandId);
        server.broadcastGroupsUpdate();
    }

    /**
     * Fields of UPDATE_GROUP_CONFIG that are checked before the group changes; null when absent.
     */
    private record GroupUpdate(String name, String outputMode, String sequentialOrder, List<String> flowIds) {
    }

    /**
     * Reads and checks the fields of UPDATE_GROUP_CONFIG that can be rejected.
     *
     * @return the fields, or empty when one is invalid (the error has been sent)
     */
    private Optional<GroupUpdate> readGroupUpdate(WebSocket conn, String commandId, JsonNode payload, GroupRuntime group) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String newName = null;
        if (payload.hasNonNull("name")) {
            newName = payload.path("name").asText(group.name).trim();
            if (!isValidGroupName(conn, commandId, group.id, newName)) {
                return Optional.empty();
            }
        }

        String outputMode = null;
        if (payload.hasNonNull(OUTPUT_MODE)) {
            outputMode = payload.path(OUTPUT_MODE).asText("");
            if (!OutputMode.isValid(outputMode)) {
                server.sendError(conn, commandId, INVALID_PAYLOAD, INVALID_OUTPUT_MODE, Map.of(OUTPUT_MODE, outputMode));
                return Optional.empty();
            }
        }

        String sequentialOrder = null;
        if (payload.hasNonNull(SEQUENTIAL_ORDER)) {
            sequentialOrder = payload.path(SEQUENTIAL_ORDER).asText("");
            if (!SequentialOrder.isValid(sequentialOrder)) {
                server.sendError(conn, commandId, INVALID_PAYLOAD, INVALID_SEQUENTIAL_ORDER, Map.of(SEQUENTIAL_ORDER, sequentialOrder));
                return Optional.empty();
            }
        }

        List<String> flowIds = null;
        if (payload.hasNonNull("flowIds")) {
            Optional<List<String>> ids = readFlowIds(payload.path("flowIds"));
            if (ids.isEmpty()) {
                server.sendError(conn, commandId, INVALID_PAYLOAD, INVALID_FLOW_IDS, Map.of(GROUP_ID, group.id));
                return Optional.empty();
            }
            flowIds = ids.get();
        }
        return Optional.of(new GroupUpdate(newName, outputMode, sequentialOrder, flowIds));
    }

    /**
     * @return whether the group can be renamed to the name: not blank and not used by another
     *         group (otherwise the error has been sent)
     */
    private boolean isValidGroupName(WebSocket conn, String commandId, String groupId, String newName) {
        UiBridgeWebSocketServer server = ctx.getServer();
        if (newName.isBlank()) {
            server.sendError(conn, commandId, INVALID_PAYLOAD, "Group name cannot be empty", Map.of(GROUP_ID, groupId));
            return false;
        }
        for (GroupRuntime existing : ctx.getGroupsById().values()) {
            if (!existing.id.equals(groupId) && UniqueNames.sameName(existing.name, newName)) {
                server.sendError(conn, commandId, INVALID_PAYLOAD, "Group name already exists", Map.of("name", newName));
                return false;
            }
        }
        return true;
    }

    /** Applies a checked UPDATE_GROUP_CONFIG to the group. */
    private void applyGroupUpdate(GroupRuntime group, GroupUpdate update, JsonNode payload) {
        if (update.name() != null) {
            group.name = update.name();
        }

        if (payload.hasNonNull(DESCRIPTION)) {
            group.description = payload.path(DESCRIPTION).asText(group.description);
        }

        if (payload.hasNonNull(THREADS)) {
            group.threads = Math.max(1, payload.path(THREADS).asInt(group.threads));
        }

        // Output mode and sequential order are applied the next time the group starts
        if (update.outputMode() != null) {
            group.outputMode = OutputMode.fromValue(update.outputMode()).wireValue();
        }
        if (update.sequentialOrder() != null) {
            group.sequentialOrder = SequentialOrder.fromValue(update.sequentialOrder()).wireValue();
        }

        // The flow order applies at once: every tick reads the flow list under the state lock
        if (update.flowIds() != null) {
            group.reorderFlows(update.flowIds());
        }

        if (payload.hasNonNull("enabled")) {
            boolean enabled = payload.path("enabled").asBoolean();
            group.enabled = enabled;
            for (FlowRuntime flow : group.flows) {
                flow.enabled = enabled;
            }
            if (enabled) {
                flowHandler.openSessionsOfUnlockedFlows(group, group.flows);
            }
        }
    }

    /**
     * Reads the {@code flowIds} array of UPDATE_GROUP_CONFIG.
     *
     * @param node the {@code flowIds} value
     * @return the ids, or empty if the value is not an array of strings
     */
    private static Optional<List<String>> readFlowIds(JsonNode node) {
        if (!node.isArray()) {
            return Optional.empty();
        }
        List<String> ids = new ArrayList<>();
        for (JsonNode item : node) {
            if (!item.isTextual()) {
                return Optional.empty();
            }
            ids.add(item.asText());
        }
        return Optional.of(ids);
    }

    public void handleStartGroup(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, GROUP_ID, INVALID_PAYLOAD, "START_GROUP");
        if (groupId == null) {
            return;
        }

        GroupRuntime group = ctx.getGroupsById().get(groupId);
        if (group == null) {
            server.sendError(conn, commandId, NOT_FOUND, GROUP_NOT_FOUND + groupId, Map.of(GROUP_ID, groupId));
            return;
        }

        synchronized (ctx.getStateLock()) {
            if (ctx.getCurrentOutputDir() == null) {
                ctx.startOutputSession();
            }
            if (!ctx.isSystemRunning()) {
                ctx.setSystemStartedAt(System.currentTimeMillis());
            }
            try {
                flowHandler.startGroupInternal(group);
                ctx.setSystemRunning(true);
            } catch (IllegalStateException ex) {
                FlowCommandHandler.sendStartError(server, conn, commandId, ex);
                return;
            }
        }

        server.sendAck(conn, commandId, "group_started");
        server.broadcastGroupsUpdate();
        server.broadcastSystemStatus();
        server.broadcastFlowsMetrics();
        server.sendLog(conn, "info", group.id, "Group started");
    }

    public void handleStopGroup(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, GROUP_ID, INVALID_PAYLOAD, "STOP_GROUP");
        if (groupId == null) {
            return;
        }

        GroupRuntime group = ctx.getGroupsById().get(groupId);
        if (group == null) {
            server.sendError(conn, commandId, NOT_FOUND, GROUP_NOT_FOUND + groupId, Map.of(GROUP_ID, groupId));
            return;
        }

        synchronized (ctx.getStateLock()) {
            flowHandler.stopGroupInternal(group);
            ctx.setSystemRunning(flowHandler.hasAnyRunningGroup());
        }

        server.sendAck(conn, commandId, "group_stopped");
        server.broadcastGroupsUpdate();
        server.broadcastSystemStatus();
        server.broadcastFlowsMetrics();
        server.sendLog(conn, "info", group.id, "Group stopped");
    }

    public void handlePauseGroup(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, GROUP_ID, INVALID_PAYLOAD, "PAUSE_GROUP");
        if (groupId == null) {
            return;
        }
        GroupRuntime group = ctx.getGroupsById().get(groupId);
        if (group == null) {
            server.sendError(conn, commandId, NOT_FOUND, GROUP_NOT_FOUND + groupId, Map.of(GROUP_ID, groupId));
            return;
        }
        synchronized (ctx.getStateLock()) {
            flowHandler.pauseGroupInternal(group);
        }
        server.sendAck(conn, commandId, "group_paused");
        server.broadcastGroupsUpdate();
        server.broadcastFlowsMetrics();
        server.sendLog(conn, "info", group.id, "Group paused");
    }

    public void handleCloneGroup(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, GROUP_ID, INVALID_PAYLOAD, "CLONE_GROUP");
        int count = payload.path("count").asInt(1);
        String namingPattern = payload.path("namingPattern").asText("${name} (Clone ${index})");
        if (groupId == null) return;

        synchronized (ctx.getStateLock()) {
            GroupRuntime original = ctx.getGroupsById().get(groupId);
            if (original == null) {
                server.sendError(conn, commandId, NOT_FOUND, GROUP_NOT_FOUND + groupId, Map.of(GROUP_ID, groupId));
                return;
            }

            for (int i = 1; i <= count; i++) {
                cloneGroup(original, NamingPattern.apply(namingPattern, original.name, i));
            }
            server.persistState();
        }

        server.sendAck(conn, commandId, "group_cloned");
        server.logToBackend("info", SOURCE_GROUPS, "Cloned group '" + groupId + "' " + count + " times", commandId);
        server.broadcastGroupsUpdate();
        server.sendVariablesUpdate();
    }

    /**
     * Adds a copy of the group with its flows and its flow and group variables.
     *
     * @param original the group to copy
     * @param name     name for the copy; a taken name gets the first free " (k)" suffix
     */
    private void cloneGroup(GroupRuntime original, String name) {
        String newGroupId = UUID.randomUUID().toString();
        // Outputs are named after the group and its flows: a taken name gets the first free " (k)" suffix
        List<String> groupNames = new ArrayList<>();
        for (GroupRuntime existing : ctx.getGroupsById().values()) {
            groupNames.add(existing.name);
        }
        String newName = UniqueNames.makeUnique(name, groupNames);

        GroupRuntime clone = new GroupRuntime(
            newGroupId,
            newName,
            "stopped",
            original.description,
            original.threads,
            original.outputMode,
            original.enabled
        );
        clone.sequentialOrder = original.sequentialOrder;

        // Clone flows
        for (FlowRuntime originalFlow : original.flows) {
            String newFlowId = UUID.randomUUID().toString();

            FlowRuntime flowClone = new FlowRuntime(
                newFlowId,
                // Unique already, unless an old project repeated a name in the original group
                UniqueNames.makeUnique(originalFlow.name, clone.flowNames(null)),
                originalFlow.technology,
                "disconnected",
                0,
                0,
                false,
                null,
                originalFlow.interval,
                originalFlow.burst,
                originalFlow.topic,
                originalFlow.host,
                originalFlow.port,
                originalFlow.template,
                originalFlow.format,
                originalFlow.enabled,
                originalFlow.connectorConfig
            );
            flowClone.copySendSettingsFrom(originalFlow);
            clone.flows.add(flowClone);

            // Clone variables for this flow
            cloneVariables(variable -> originalFlow.id.equals(variable.getFlowId()), newFlowId, newGroupId);
        }

        // Clone group-scoped variables
        cloneVariables(variable -> original.id.equals(variable.getGroupId()) && "GROUP".equals(variable.getScope()),
            null, newGroupId);

        ctx.getGroupsById().put(newGroupId, clone);
    }

    /**
     * Copies the variables that match the filter into the given flow and group.
     *
     * @param filter     the variables to copy
     * @param newFlowId  flow of the copies (null for group variables)
     * @param newGroupId group of the copies
     */
    private void cloneVariables(java.util.function.Predicate<Variable> filter, String newFlowId, String newGroupId) {
        List<Variable> matching = new ArrayList<>();
        for (Variable variable : ctx.getVariablesById().values()) {
            if (filter.test(variable)) {
                matching.add(variable);
            }
        }
        for (Variable variable : matching) {
            String newVarId = UUID.randomUUID().toString();
            Variable varClone = new Variable(
                newVarId,
                variable.getName(),
                variable.getScope(),
                variable.getType(),
                variable.getDefaultValue(),
                variable.getConfig(),
                newFlowId,
                newGroupId
            );
            ctx.getVariablesById().put(newVarId, varClone);
        }
    }
}
