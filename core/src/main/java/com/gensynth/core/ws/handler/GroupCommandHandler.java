package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.gensynth.core.model.OutputMode;
import com.gensynth.core.model.Variable;
import com.gensynth.core.util.NamingPattern;
import com.gensynth.core.util.UniqueNames;
import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.java_websocket.WebSocket;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Handles group management actions (create, delete, update, clone, start, stop, pause).
 */
public class GroupCommandHandler implements CommandHandler {
    private static final String INVALID_OUTPUT_MODE = "outputMode must be 'parallel' or 'sequential'";
    private final BridgeContext ctx;
    private final FlowCommandHandler flowHandler;

    public GroupCommandHandler(BridgeContext ctx, FlowCommandHandler flowHandler) {
        this.ctx = ctx;
        this.flowHandler = flowHandler;
    }

    @Override
    public void handle(WebSocket conn, JsonNode payload, String commandId) throws Exception {
        // Will be routed by method references directly.
    }

    public void handleCreateGroup(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String name = server.requireTextField(conn, commandId, payload, "name", "INVALID_PAYLOAD", "CREATE_GROUP");
        if (name == null) {
            return;
        }

        String clientRequestId = payload.path("clientRequestId").asText(null);

        synchronized (ctx.getStateLock()) {
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                if (UniqueNames.sameName(group.name, name)) {
                    server.sendError(conn, commandId, clientRequestId, "INVALID_PAYLOAD", "Group name already exists", Map.of("name", name));
                    return;
                }
            }

            String id = payload.path("groupId").asText("");
            if (id.isBlank()) {
                id = UUID.randomUUID().toString();
            }
            String description = payload.path("description").asText("");
            int threads = Math.max(1, payload.path("threads").asInt(1));
            String outputMode = payload.path("outputMode").asText(OutputMode.PARALLEL.wireValue());
            if (!OutputMode.isValid(outputMode)) {
                server.sendError(conn, commandId, clientRequestId, "INVALID_PAYLOAD", INVALID_OUTPUT_MODE, Map.of("outputMode", outputMode));
                return;
            }

            GroupRuntime newGroup = new GroupRuntime(id, name, "stopped", description, threads, outputMode, true);
            ctx.getGroupsById().put(id, newGroup);
            server.persistState();

            server.sendCreatedResponse(conn, commandId, clientRequestId, newGroup.toPayload(), "group_created");
        }

        server.logToBackend("info", "GROUPS", "Created group '" + name + "'", commandId);
        server.broadcastGroupsUpdate();
    }

    public void handleDeleteGroup(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "DELETE_GROUP");
        if (groupId == null) {
            return;
        }

        String groupName;
        synchronized (ctx.getStateLock()) {
            GroupRuntime group = ctx.getGroupsById().remove(groupId);
            if (group == null) {
                server.sendError(conn, commandId, "NOT_FOUND", "Group not found: " + groupId, Map.of("groupId", groupId));
                return;
            }
            groupName = group.name;

            flowHandler.stopGroupInternal(group);
            server.persistState();
            ctx.setSystemRunning(flowHandler.hasAnyRunningGroup());
        }

        server.sendAck(conn, commandId, "group_deleted");
        server.logToBackend("info", "GROUPS", "Deleted group '" + groupName + "'", commandId);

        server.broadcastGroupsUpdate();
        server.broadcastSystemStatus();
    }

    public void handleUpdateGroupConfig(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "UPDATE_GROUP_CONFIG");
        if (groupId == null) {
            return;
        }

        synchronized (ctx.getStateLock()) {
            GroupRuntime group = ctx.getGroupsById().get(groupId);
            if (group == null) {
                server.sendError(conn, commandId, "NOT_FOUND", "Group not found: " + groupId, Map.of("groupId", groupId));
                return;
            }

            if (payload.hasNonNull("name")) {
                String newName = payload.path("name").asText(group.name).trim();
                if (newName.isBlank()) {
                    server.sendError(conn, commandId, "INVALID_PAYLOAD", "Group name cannot be empty", Map.of("groupId", groupId));
                    return;
                }

                for (GroupRuntime existing : ctx.getGroupsById().values()) {
                    if (!existing.id.equals(groupId) && UniqueNames.sameName(existing.name, newName)) {
                        server.sendError(conn, commandId, "INVALID_PAYLOAD", "Group name already exists", Map.of("name", newName));
                        return;
                    }
                }
                group.name = newName;
            }

            if (payload.hasNonNull("description")) {
                group.description = payload.path("description").asText(group.description);
            }

            if (payload.hasNonNull("threads")) {
                group.threads = Math.max(1, payload.path("threads").asInt(group.threads));
            }

            if (payload.hasNonNull("outputMode")) {
                String outputMode = payload.path("outputMode").asText("");
                if (!OutputMode.isValid(outputMode)) {
                    server.sendError(conn, commandId, "INVALID_PAYLOAD", INVALID_OUTPUT_MODE, Map.of("outputMode", outputMode));
                    return;
                }
                // Applied the next time the group starts
                group.outputMode = OutputMode.fromValue(outputMode).wireValue();
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

            server.persistState();
        }

        server.sendAck(conn, commandId, "group_updated");
        GroupRuntime group = ctx.getGroupsById().get(groupId);
        server.logToBackend("info", "GROUPS", "Updated config for group '" + (group != null ? group.name : groupId) + "'", commandId);
        server.broadcastGroupsUpdate();
    }

    public void handleStartGroup(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "START_GROUP");
        if (groupId == null) {
            return;
        }

        GroupRuntime group = ctx.getGroupsById().get(groupId);
        if (group == null) {
            server.sendError(conn, commandId, "NOT_FOUND", "Group not found: " + groupId, Map.of("groupId", groupId));
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
        String groupId = server.requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "STOP_GROUP");
        if (groupId == null) {
            return;
        }

        GroupRuntime group = ctx.getGroupsById().get(groupId);
        if (group == null) {
            server.sendError(conn, commandId, "NOT_FOUND", "Group not found: " + groupId, Map.of("groupId", groupId));
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
        String groupId = server.requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "PAUSE_GROUP");
        if (groupId == null) {
            return;
        }
        GroupRuntime group = ctx.getGroupsById().get(groupId);
        if (group == null) {
            server.sendError(conn, commandId, "NOT_FOUND", "Group not found: " + groupId, Map.of("groupId", groupId));
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
        String groupId = server.requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "CLONE_GROUP");
        int count = payload.path("count").asInt(1);
        String namingPattern = payload.path("namingPattern").asText("${name} (Clone ${index})");
        if (groupId == null) return;

        synchronized (ctx.getStateLock()) {
            GroupRuntime original = ctx.getGroupsById().get(groupId);
            if (original == null) {
                server.sendError(conn, commandId, "NOT_FOUND", "Group not found: " + groupId, Map.of("groupId", groupId));
                return;
            }

            for (int i = 1; i <= count; i++) {
                String newGroupId = UUID.randomUUID().toString();
                // Outputs are named after the group and its flows: a taken name gets the first free " (k)" suffix
                List<String> groupNames = new ArrayList<>();
                for (GroupRuntime existing : ctx.getGroupsById().values()) {
                    groupNames.add(existing.name);
                }
                String newName = UniqueNames.makeUnique(NamingPattern.apply(namingPattern, original.name, i), groupNames);

                GroupRuntime clone = new GroupRuntime(
                    newGroupId,
                    newName,
                    "stopped",
                    original.description,
                    original.threads,
                    original.outputMode,
                    original.enabled
                );

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
                    List<Variable> flowVars = new ArrayList<>();
                    for (Variable var : ctx.getVariablesById().values()) {
                        if (originalFlow.id.equals(var.getFlowId())) {
                            flowVars.add(var);
                        }
                    }
                    for (Variable var : flowVars) {
                        String newVarId = UUID.randomUUID().toString();
                        Variable varClone = new Variable(
                            newVarId,
                            var.getName(),
                            var.getScope(),
                            var.getType(),
                            var.getDefaultValue(),
                            var.getConfig(),
                            newFlowId,
                            newGroupId
                        );
                        ctx.getVariablesById().put(newVarId, varClone);
                    }
                }

                // Clone group-scoped variables
                List<Variable> groupVars = new ArrayList<>();
                for (Variable var : ctx.getVariablesById().values()) {
                    if (groupId.equals(var.getGroupId()) && "GROUP".equals(var.getScope())) {
                        groupVars.add(var);
                    }
                }
                for (Variable var : groupVars) {
                    String newVarId = UUID.randomUUID().toString();
                    Variable varClone = new Variable(
                        newVarId,
                        var.getName(),
                        var.getScope(),
                        var.getType(),
                        var.getDefaultValue(),
                        var.getConfig(),
                        null,
                        newGroupId
                    );
                    ctx.getVariablesById().put(newVarId, varClone);
                }

                ctx.getGroupsById().put(newGroupId, clone);
            }
            server.persistState();
        }

        server.sendAck(conn, commandId, "group_cloned");
        server.logToBackend("info", "GROUPS", "Cloned group '" + groupId + "' " + count + " times", commandId);
        server.broadcastGroupsUpdate();
        server.sendVariablesUpdate();
    }
}
