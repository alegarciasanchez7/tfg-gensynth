package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.gensynth.core.model.Variable;
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
                if (group.name.equalsIgnoreCase(name)) {
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
            String outputMode = payload.path("outputMode").asText("parallel");

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
                    if (!existing.id.equals(groupId) && existing.name.equalsIgnoreCase(newName)) {
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
                String outputMode = payload.path("outputMode").asText(group.outputMode).trim();
                group.outputMode = outputMode.isBlank() ? group.outputMode : outputMode;
            }

            if (payload.hasNonNull("enabled")) {
                boolean enabled = payload.path("enabled").asBoolean();
                group.enabled = enabled;
                for (FlowRuntime flow : group.flows) {
                    flow.enabled = enabled;
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
                String timestamp = new java.text.SimpleDateFormat("yyyy_MM_dd_HH_mm_ss").format(new java.util.Date());
                ctx.setCurrentOutputDir("OUTPUT_FILES_" + timestamp);
            }
            if (!ctx.isSystemRunning()) {
                ctx.setSystemStartedAt(System.currentTimeMillis());
            }
            flowHandler.startGroupInternal(group);
            ctx.setSystemRunning(true);
        }

        server.sendAck(conn, commandId, "group_started");
        server.broadcastGroupsUpdate();
        server.broadcastSystemStatus();
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
            group.status = "paused";
        }
        server.sendAck(conn, commandId, "group_paused");
        server.broadcastGroupsUpdate();
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
                String newName = namingPattern
                    .replace("${name}", original.name)
                    .replace("${index}", String.valueOf(i));

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
                        originalFlow.name,
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
