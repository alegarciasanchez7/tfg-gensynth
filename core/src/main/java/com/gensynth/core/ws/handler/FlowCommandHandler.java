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
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import com.gensynth.core.api.ITickListener;
import com.gensynth.core.flow.variables.VariableConfiguration;
import com.gensynth.core.flow.variables.VariableFactory;
import com.gensynth.core.flow.variables.DependencyResolver;
import com.gensynth.core.flow.variables.CyclicDependencyException;

/**
 * Handles logic for CRUD and execution of simulation Flows.
 *
 * Message generation is driven by the global tick clock: on every tick
 * ({@link #onTick(long)}) each enabled flow of every running group publishes its burst.
 */
public class FlowCommandHandler implements CommandHandler, ITickListener {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    /** Minimum time between two "data" preview log entries of the same flow. */
    private static final long PREVIEW_LOG_THROTTLE_MS = 250;
    private final BridgeContext ctx;
    private final Map<String, Long> lastPreviewLogByFlowId = new ConcurrentHashMap<>();

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

            // Generation fields (burst, template, format) apply on the next tick.
            // Connection fields (technology, host, port, connectorConfig) apply when the group is restarted.
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
                if (var.getId() != null && !var.getId().equals(var.getName())) {
                    configs.put(var.getId(), vc);
                }
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

        // Validate flow templates for invalid sub-item access on non-FIXED_SUBSET list strategies
        java.util.regex.Pattern tagPattern = java.util.regex.Pattern.compile("\\{\\{([^}]+)\\}\\}");
        for (FlowRuntime flow : group.flows) {
            String template = flow.template;
            if (template != null && !template.isEmpty()) {
                java.util.regex.Matcher matcher = tagPattern.matcher(template);
                while (matcher.find()) {
                    String fullSpec = matcher.group(1).trim();
                    if ("uuid".equals(fullSpec) || "ts".equals(fullSpec) || "n".equals(fullSpec)) {
                        continue;
                    }
                    String scopePart = null;
                    String namePart = fullSpec;
                    boolean isItemAccess = false;

                    if (fullSpec.contains(".")) {
                        String[] parts = fullSpec.split("\\.");
                        if (parts.length >= 3 && parts[parts.length - 1].toLowerCase().startsWith("item")) {
                            scopePart = parts[0].toLowerCase();
                            namePart = parts[1];
                            isItemAccess = true;
                        } else if (parts.length == 2 && parts[1].toLowerCase().startsWith("item")) {
                            scopePart = null;
                            namePart = parts[0];
                            isItemAccess = true;
                        }
                    }

                    if (isItemAccess) {
                        Variable variable = ctx.getTemplateEngine().findAccessibleVariable(
                            ctx.getVariablesById(), namePart, scopePart, flow.id, group.id
                        );
                        if (variable != null && "list".equalsIgnoreCase(variable.getType())) {
                            Map<String, Object> varConfig = variable.getConfig();
                            Object stratObj = varConfig != null ? varConfig.get("selectionStrategy") : null;
                            if (stratObj != null && !"FIXED_SUBSET".equalsIgnoreCase(stratObj.toString())) {
                                throw new IllegalStateException("Invalid item reference in flow '" + flow.name + "': Variable '" + variable.getName() + "' uses selection strategy '" + stratObj + "' (not 'FIXED_SUBSET') and cannot be referenced with sub-item index (.itemX).");
                            }
                        }
                    }
                }
            }
        }

        ctx.getTemplateEngine().clearVariableCache();

        for (FlowRuntime flow : group.flows) {
            // Release a connector left over from a previous start (e.g. restarting a paused group)
            ConnectorPlugin previous = ctx.getConnectorByFlowId().remove(flow.id);
            if (previous != null) {
                try {
                    previous.stop();
                } catch (Exception ignored) {
                    ctx.getTotalErrors().incrementAndGet();
                }
            }

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
            flow.sentInWindow.set(0);
            flow.hasError = false;
            flow.errorMessage = null;
        }

        group.status = "stopped";
    }

    /**
     * Dispatches one global tick: every enabled flow of every running group publishes its
     * burst. Flows publish in parallel on the shared scheduler pool, and the method waits
     * for all of them so tick N is complete before tick N+1 starts. Paused and stopped
     * groups are skipped.
     *
     * @param tickNumber sequential tick number
     * @return true if at least one flow published on this tick
     */
    @Override
    public boolean onTick(long tickNumber) {
        List<Runnable> work = new ArrayList<>();
        synchronized (ctx.getStateLock()) {
            // Snapshot under the lock; publishing happens outside it
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                if (!"running".equals(group.status)) {
                    continue;
                }
                for (FlowRuntime flow : group.flows) {
                    // Phase 2 hook: per-group/per-flow "every N ticks" filter (tickNumber % N == 0)
                    if (flow.enabled && ctx.getConnectorByFlowId().containsKey(flow.id)) {
                        work.add(() -> publishBurst(group, flow));
                    }
                }
            }
        }

        if (work.isEmpty()) {
            return false;
        }
        if (work.size() == 1) {
            work.get(0).run();
            return true;
        }
        CompletableFuture.allOf(work.stream()
            .map(task -> CompletableFuture.runAsync(task, ctx.getScheduler()))
            .toArray(CompletableFuture[]::new)).join();
        return true;
    }

    /**
     * Publishes one burst of messages for a flow (called once per tick).
     *
     * @param group the group that owns the flow
     * @param flow  the flow to publish
     */
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
                String payload = buildPayload(flow, group.id, i);
                connector.publish(flow.topic, payload.getBytes(StandardCharsets.UTF_8), Map.of("content-type", "application/json"));
                sent++;
                lastPayload = payload;
            }

            long elapsedNanos = System.nanoTime() - startedAt;
            flow.latency = (int) Math.max(1L, TimeUnit.NANOSECONDS.toMillis(elapsedNanos));
            flow.sentInWindow.addAndGet(sent);
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

            if (lastPayload != null && shouldLogPreview(flow.id)) {
                String preview = lastPayload.length() > 250 ? lastPayload.substring(0, 250) + "..." : lastPayload;
                ctx.getServer().sendLogToAll("data", flow.id, "[" + group.name + " - " + flow.name + "] ==> " + preview);
            }

            ctx.getServer().broadcastFlowUpdate(flow);
        } catch (Exception ex) {
            if (ctx.getConnectorByFlowId().get(flow.id) != connector) {
                // The group was stopped while this tick was publishing; not a real error
                return;
            }
            flow.connectionStatus = "error";
            flow.hasError = true;
            flow.errorMessage = ex.getMessage();
            ctx.getTotalErrors().incrementAndGet();
            ctx.getServer().sendLogToAll("error", flow.id, "Publish failed: " + ex.getMessage());
            ctx.getServer().broadcastFlowUpdate(flow);
        }
    }

    /**
     * Throttles the "data" preview log so high tick rates do not flood the UI and the log file.
     */
    private boolean shouldLogPreview(String flowId) {
        long now = System.currentTimeMillis();
        Long last = lastPreviewLogByFlowId.get(flowId);
        if (last != null && now - last < PREVIEW_LOG_THROTTLE_MS) {
            return false;
        }
        lastPreviewLogByFlowId.put(flowId, now);
        return true;
    }

    public String buildPayload(FlowRuntime flow, String groupId, int indexInBurst) {
        long sequence = ctx.getTotalMessages().get() + indexInBurst + 1;
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
