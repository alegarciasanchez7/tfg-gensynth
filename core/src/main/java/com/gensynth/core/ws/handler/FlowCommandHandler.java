package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.gensynth.core.connectors.spi.ConnectorPlugin;
import com.gensynth.core.connectors.spi.ConnectorPluginDescriptor;
import com.gensynth.core.model.Variable;
import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.java_websocket.WebSocket;

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import com.gensynth.core.flow.variables.VariableConfiguration;
import com.gensynth.core.flow.variables.VariableFactory;
import com.gensynth.core.flow.variables.DependencyResolver;
import com.gensynth.core.flow.variables.CyclicDependencyException;

/**
 * Handles logic for CRUD and execution of simulation Flows.
 */
public class FlowCommandHandler implements CommandHandler {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private final BridgeContext ctx;

    public FlowCommandHandler(BridgeContext ctx) {
        this.ctx = ctx;
    }

    @Override
    public void handle(WebSocket conn, JsonNode payload, String commandId) throws Exception {
        // Routed directly by method references in UiBridgeWebSocketServer.
    }

    public void handleCreateFlow(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "CREATE_FLOW");
        String name = server.requireTextField(conn, commandId, payload, "name", "INVALID_PAYLOAD", "CREATE_FLOW");
        String technology = server.requireTextField(conn, commandId, payload, "technology", "INVALID_PAYLOAD", "CREATE_FLOW");
        String host = server.requireTextField(conn, commandId, payload, "host", "INVALID_PAYLOAD", "CREATE_FLOW");
        if (groupId == null || name == null || technology == null || host == null) {
            return;
        }

        String clientRequestId = payload.path("clientRequestId").asText(null);

        if (ctx.getConnectorCatalogService().findLatestConnector(technology).isEmpty()) {
            server.sendError(conn, commandId, clientRequestId, "INVALID_PAYLOAD", "Connector not found for technology: " + technology, Map.of("technology", technology));
            return;
        }

        synchronized (ctx.getStateLock()) {
            GroupRuntime group = ctx.getGroupsById().get(groupId);
            if (group == null) {
                server.sendError(conn, commandId, clientRequestId, "NOT_FOUND", "Group not found: " + groupId, Map.of("groupId", groupId));
                return;
            }

            String flowId = payload.path("flowId").asText("");
            if (flowId.isBlank()) {
                flowId = UUID.randomUUID().toString();
            }

            if (findFlowById(group, flowId) != null) {
                server.sendError(conn, commandId, clientRequestId, "INVALID_PAYLOAD", "Flow already exists: " + flowId, Map.of("flowId", flowId));
                return;
            }

            String topic = payload.path("topic").asText("gensynth.data");
            int port = payload.path("port").asInt(5672);
            int interval = Math.max(50, payload.path("interval").asInt(1000));
            int burst = Math.max(1, payload.path("burst").asInt(1));
            String template = payload.path("template").asText("{\"eventId\":\"{{uuid}}\",\"timestamp\":\"{{ts}}\",\"source\":\"gen-synth\",\"value\":{{n}}}");
            String format = payload.path("format").asText(technology.equalsIgnoreCase("file") ? "plain" : "json");
            Map<String, Object> connectorConfig = parseConnectorConfig(payload.path("connectorConfig"));

            group.flows.add(new FlowRuntime(
                flowId,
                name,
                technology,
                "disconnected",
                0,
                0,
                false,
                null,
                interval,
                burst,
                topic,
                host,
                port,
                template,
                format,
                true,
                connectorConfig
            ));

            server.persistState();

            FlowRuntime flow = findFlowById(group, flowId);
            if (flow != null) {
                server.sendCreatedResponse(conn, commandId, clientRequestId, flow.toPayload(), "flow_created");
            }
        }

        server.logToBackend("info", "FLOWS", "Created flow '" + name + "'", commandId);
        server.broadcastGroupsUpdate();
    }

    public void handleDeleteFlow(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "DELETE_FLOW");
        String flowId = server.requireTextField(conn, commandId, payload, "flowId", "INVALID_PAYLOAD", "DELETE_FLOW");
        if (groupId == null || flowId == null) {
            return;
        }

        synchronized (ctx.getStateLock()) {
            GroupRuntime group = ctx.getGroupsById().get(groupId);
            if (group == null) {
                server.sendError(conn, commandId, "NOT_FOUND", "Group not found: " + groupId, Map.of("groupId", groupId));
                return;
            }

            FlowRuntime flow = findFlowById(group, flowId);
            if (flow == null) {
                server.sendError(conn, commandId, "NOT_FOUND", "Flow not found: " + flowId, Map.of("flowId", flowId));
                return;
            }

            stopPublisherTask(flowId);
            ConnectorPlugin connector = ctx.getConnectorByFlowId().remove(flowId);
            if (connector != null) {
                try {
                    connector.stop();
                } catch (Exception ignored) {
                    ctx.getTotalErrors().incrementAndGet();
                }
            }

            server.logToBackend("info", "FLOWS", "Deleted flow '" + flow.name + "'", commandId);
            group.flows.remove(flow);
            server.persistState();
        }

        server.sendAck(conn, commandId, "flow_deleted");
        server.broadcastGroupsUpdate();
    }

    public void handleUpdateFlowConfig(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "UPDATE_FLOW_CONFIG");
        String flowId = server.requireTextField(conn, commandId, payload, "flowId", "INVALID_PAYLOAD", "UPDATE_FLOW_CONFIG");
        if (groupId == null || flowId == null) {
            return;
        }

        String updatedFlowName;
        synchronized (ctx.getStateLock()) {
            GroupRuntime group = ctx.getGroupsById().get(groupId);
            if (group == null) {
                server.sendError(conn, commandId, "NOT_FOUND", "Group not found: " + groupId, Map.of("groupId", groupId));
                return;
            }

            FlowRuntime flow = findFlowById(group, flowId);
            if (flow == null) {
                server.sendError(conn, commandId, "NOT_FOUND", "Flow not found: " + flowId, Map.of("flowId", flowId));
                return;
            }

            boolean wasRunning = "connected".equals(flow.connectionStatus);
            if (payload.hasNonNull("name")) {
                flow.name = payload.path("name").asText(flow.name);
            }
            if (payload.hasNonNull("technology")) {
                String technology = payload.path("technology").asText(flow.technology);
                if (ctx.getConnectorCatalogService().findLatestConnector(technology).isEmpty()) {
                    server.sendError(conn, commandId, "INVALID_PAYLOAD", "Connector not found for technology: " + technology, Map.of("technology", technology));
                    return;
                }
                flow.technology = technology;
            }
            if (payload.hasNonNull("host")) {
                flow.host = payload.path("host").asText(flow.host);
            }
            if (payload.hasNonNull("port")) {
                flow.port = payload.path("port").asInt(flow.port);
            }
            if (payload.hasNonNull("topic")) {
                flow.topic = payload.path("topic").asText(flow.topic);
            }
            if (payload.hasNonNull("interval")) {
                flow.interval = Math.max(50, payload.path("interval").asInt(flow.interval));
            }
            if (payload.hasNonNull("burst")) {
                flow.burst = Math.max(1, payload.path("burst").asInt(flow.burst));
            }
            if (payload.hasNonNull("template")) {
                flow.template = payload.path("template").asText(flow.template);
            }
            if (payload.hasNonNull("format")) {
                flow.format = payload.path("format").asText(flow.format);
            }
            if (payload.hasNonNull("connectorConfig") && payload.get("connectorConfig").isObject()) {
                flow.connectorConfig = parseConnectorConfig(payload.get("connectorConfig"));
            }

            if (payload.hasNonNull("enabled")) {
                boolean enabled = payload.path("enabled").asBoolean();
                flow.enabled = enabled;

                // If we unblock a flow, the group should also appear as unblocked
                if (enabled) {
                    group.enabled = true;
                }
            }

            if (wasRunning) {
                stopPublisherTask(flow.id);
            }

            server.persistState();
            updatedFlowName = flow.name;
        }

        server.sendAck(conn, commandId, "flow_updated");
        server.logToBackend("info", "FLOWS", "Updated config for flow '" + updatedFlowName + "'", commandId);
        server.broadcastGroupsUpdate();
    }

    public void handleCloneFlow(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "CLONE_FLOW");
        String flowId = server.requireTextField(conn, commandId, payload, "flowId", "INVALID_PAYLOAD", "CLONE_FLOW");
        int count = payload.path("count").asInt(1);
        String namingPattern = payload.path("namingPattern").asText("${name} (Clone ${index})");
        if (groupId == null || flowId == null) return;

        synchronized (ctx.getStateLock()) {
            GroupRuntime group = ctx.getGroupsById().get(groupId);
            if (group == null) {
                server.sendError(conn, commandId, "NOT_FOUND", "Group not found: " + groupId, Map.of("groupId", groupId));
                return;
            }

            FlowRuntime original = findFlowById(group, flowId);
            if (original == null) {
                server.sendError(conn, commandId, "NOT_FOUND", "Flow not found: " + flowId, Map.of("flowId", flowId));
                return;
            }

            for (int i = 1; i <= count; i++) {
                String newFlowId = UUID.randomUUID().toString();
                String newName = namingPattern
                    .replace("${name}", original.name)
                    .replace("${index}", String.valueOf(i));

                FlowRuntime clone = new FlowRuntime(
                    newFlowId,
                    newName,
                    original.technology,
                    "disconnected",
                    0,
                    0,
                    false,
                    null,
                    original.interval,
                    original.burst,
                    original.topic,
                    original.host,
                    original.port,
                    original.template,
                    original.format,
                    original.enabled,
                    original.connectorConfig
                );
                group.flows.add(clone);

                // Clone variables for this flow
                List<Variable> flowVars = new ArrayList<>();
                for (Variable var : ctx.getVariablesById().values()) {
                    if (original.id.equals(var.getFlowId())) {
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
                        groupId
                    );
                    ctx.getVariablesById().put(newVarId, varClone);
                }
            }
            server.persistState();
        }

        server.sendAck(conn, commandId, "flow_cloned");
        server.logToBackend("info", "FLOWS", "Cloned flow '" + flowId + "' " + count + " times", commandId);
        server.broadcastGroupsUpdate();
        server.sendVariablesUpdate();
    }

    public void startGroupInternal(GroupRuntime group) {
        if ("running".equals(group.status)) {
            return;
        }

        // Validate all variables in the group and perform cycle detection fail-fast
        Map<String, VariableConfiguration> configs = new HashMap<>();
        for (Variable var : ctx.getVariablesById().values()) {
            boolean isGlobal = "GLOBAL".equalsIgnoreCase(var.getScope());
            boolean isGroupScope = "GROUP".equalsIgnoreCase(var.getScope()) && group.id.equals(var.getGroupId());
            boolean isLocalScope = false;
            for (FlowRuntime flow : group.flows) {
                if ("LOCAL".equalsIgnoreCase(var.getScope()) && flow.id.equals(var.getFlowId())) {
                    isLocalScope = true;
                    break;
                }
            }
            if (isGlobal || isGroupScope || isLocalScope) {
                VariableConfiguration vc = VariableFactory.createFromMap(var.getId(), var.getType(), var.getConfig());
                configs.put(var.getName(), vc);
            }
        }

        DependencyResolver resolver = new DependencyResolver();
        try {
            resolver.resolve(configs);
        } catch (CyclicDependencyException e) {
            throw new IllegalStateException("Circular dependency detected", e);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("Broken reference detected: " + e.getMessage(), e);
        }

        ctx.getTemplateEngine().clearVariableCache();

        for (FlowRuntime flow : group.flows) {
            stopPublisherTask(flow.id);

            try {
                ConnectorPluginDescriptor descriptor = ctx.getConnectorCatalogService()
                    .findLatestConnector(flow.technology)
                    .orElseThrow(() -> new IllegalStateException("No connector found for " + flow.technology));

                Map<String, Object> connectorConfig = buildFlowConnectorConfig(group, flow);
                ConnectorPlugin plugin = ctx.getConnectorCatalogService().createAndInitialize(
                    descriptor.getPluginId(),
                    descriptor.getPluginVersion(),
                    connectorConfig
                );

                plugin.start();
                ctx.getConnectorByFlowId().put(flow.id, plugin);

                flow.connectionStatus = "connected";
                flow.hasError = false;
                flow.errorMessage = null;

                ScheduledFuture<?> task = ctx.getScheduler().scheduleAtFixedRate(
                    () -> publishBurst(group, flow),
                    0,
                    Math.max(50L, flow.interval),
                    TimeUnit.MILLISECONDS
                );
                ctx.getPublisherTasksByFlowId().put(flow.id, task);
            } catch (Exception ex) {
                flow.connectionStatus = "error";
                flow.hasError = true;
                flow.errorMessage = ex.getMessage();
                ctx.getTotalErrors().incrementAndGet();
            }
        }

        group.status = "running";
    }

    public void stopGroupInternal(GroupRuntime group) {
        ctx.getTemplateEngine().clearVariableCache();
        for (FlowRuntime flow : group.flows) {
            stopPublisherTask(flow.id);

            ConnectorPlugin connector = ctx.getConnectorByFlowId().remove(flow.id);
            if (connector != null) {
                try {
                    connector.stop();
                } catch (Exception ignored) {
                    ctx.getTotalErrors().incrementAndGet();
                }
            }

            flow.connectionStatus = "disconnected";
            flow.throughput = 0;
            flow.hasError = false;
            flow.errorMessage = null;
        }

        group.status = "stopped";
    }

    public void publishBurst(GroupRuntime group, FlowRuntime flow) {
        ConnectorPlugin connector = ctx.getConnectorByFlowId().get(flow.id);
        if (connector == null || !flow.enabled) {
            return;
        }

        long startedAt = System.nanoTime();
        int sent = 0;
        String lastPayload = null;

        try {
            for (int i = 0; i < Math.max(1, flow.burst); i++) {
                String payload = buildPayload(flow, i);
                connector.publish(flow.topic, payload.getBytes(StandardCharsets.UTF_8), Map.of("content-type", "application/json"));
                sent++;
                lastPayload = payload;
            }

            long elapsedNanos = System.nanoTime() - startedAt;
            flow.latency = (int) Math.max(1L, TimeUnit.NANOSECONDS.toMillis(elapsedNanos));
            flow.throughput = Math.max(1, (int) Math.round((sent * 1000.0) / Math.max(1, flow.interval)));
            flow.connectionStatus = "connected";
            flow.hasError = false;
            flow.errorMessage = null;

            ctx.getTotalMessages().addAndGet(sent);
            ctx.getMessagesLastWindow().addAndGet(sent);

            int burstBytes = 0;
            if (lastPayload != null) {
                burstBytes = lastPayload.getBytes(StandardCharsets.UTF_8).length * sent;
            }
            ctx.getBytesSentLastWindow().addAndGet(burstBytes);

            if (lastPayload != null) {
                String preview = lastPayload.length() > 250 ? lastPayload.substring(0, 250) + "..." : lastPayload;
                ctx.getServer().sendLogToAll("data", flow.id, "[" + group.name + " - " + flow.name + "] ==> " + preview);
            }

            ctx.getServer().broadcastFlowUpdate(flow);
        } catch (Exception ex) {
            flow.connectionStatus = "error";
            flow.hasError = true;
            flow.errorMessage = ex.getMessage();
            ctx.getTotalErrors().incrementAndGet();
            ctx.getServer().sendLogToAll("error", flow.id, "Publish failed: " + ex.getMessage());
            ctx.getServer().broadcastFlowUpdate(flow);
        }
    }

    public String buildPayload(FlowRuntime flow, int indexInBurst) {
        long sequence = ctx.getTotalMessages().get() + indexInBurst + 1;
        String groupId = null;
        for (GroupRuntime g : ctx.getGroupsById().values()) {
            if (g.flows.contains(flow)) {
                groupId = g.id;
                break;
            }
        }
        return ctx.getTemplateEngine().evaluate(flow.template, sequence, ctx.getVariablesById(), flow.id, groupId);
    }

    public Map<String, Object> buildFlowConnectorConfig(GroupRuntime group, FlowRuntime flow) {
        Map<String, Object> config = new LinkedHashMap<>();
        if (flow.connectorConfig != null && !flow.connectorConfig.isEmpty()) {
            config.putAll(flow.connectorConfig);
        }

        if ("file".equalsIgnoreCase(flow.technology)) {
            config.putIfAbsent("outputDir", ctx.getCurrentOutputDir() == null ? "OUTPUT_FILES" : ctx.getCurrentOutputDir());
            config.putIfAbsent("groupName", group.name);
            config.putIfAbsent("format", "json");
            config.putIfAbsent("fileName", sanitizeFileName(flow.name));
            return config;
        }

        config.putIfAbsent("host", flow.host);
        config.putIfAbsent("port", flow.port);
        config.putIfAbsent("username", "guest");
        config.putIfAbsent("password", "guest");
        config.putIfAbsent("virtualHost", "/");
        config.putIfAbsent("exchange", "gensynth.exchange");
        config.putIfAbsent("exchangeType", "topic");
        config.putIfAbsent("exchangeDurable", true);
        config.putIfAbsent("routingKey", flow.topic);
        return config;
    }

    public void stopPublisherTask(String flowId) {
        ScheduledFuture<?> current = ctx.getPublisherTasksByFlowId().remove(flowId);
        if (current != null) {
            current.cancel(false);
        }
    }

    public FlowRuntime findFlowById(GroupRuntime group, String flowId) {
        for (FlowRuntime flow : group.flows) {
            if (flow.id.equals(flowId)) {
                return flow;
            }
        }
        return null;
    }

    private String sanitizeFileName(String value) {
        if (value == null || value.isBlank()) {
            return "flow";
        }
        return value.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    private Map<String, Object> parseConnectorConfig(JsonNode connectorConfigNode) {
        if (connectorConfigNode == null || connectorConfigNode.isMissingNode() || connectorConfigNode.isNull() || !connectorConfigNode.isObject()) {
            return Map.of();
        }
        return ctx.getObjectMapper().convertValue(connectorConfigNode, MAP_TYPE);
    }

    public boolean hasAnyRunningGroup() {
        for (GroupRuntime group : ctx.getGroupsById().values()) {
            if ("running".equals(group.status)) {
                return true;
            }
        }
        return false;
    }
}
