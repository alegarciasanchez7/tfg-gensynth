package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.gensynth.plugin.api.ConnectorConfigException;
import com.gensynth.plugin.api.ConnectorContext;
import com.gensynth.plugin.api.ConnectorSession;
import com.gensynth.core.model.Variable;
import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.java_websocket.WebSocket;

import java.util.*;
import com.gensynth.core.api.IFlowMessageHandler;
import com.gensynth.core.api.IGroupDispatcher;
import com.gensynth.core.api.ITickListener;
import com.gensynth.core.model.OutputMode;
import com.gensynth.core.ws.dispatch.FlowMessagePublisher;
import com.gensynth.core.ws.dispatch.ParallelGroupDispatcher;
import com.gensynth.core.ws.dispatch.SequentialGroupDispatcher;
import com.gensynth.core.flow.variables.VariableConfiguration;
import com.gensynth.core.flow.variables.VariableFactory;
import com.gensynth.core.flow.variables.DependencyResolver;
import com.gensynth.core.flow.variables.CyclicDependencyException;

/**
 * Handles logic for CRUD and execution of simulation Flows.
 *
 * Message generation is driven by the global tick clock: on every tick ({@link #onTick(long)})
 * each enabled flow of every running group that is due (one message every {@code everyTicks}
 * ticks) is handed to its group's {@link IGroupDispatcher}, which sends it following the
 * group's output mode.
 */
public class FlowCommandHandler implements CommandHandler, ITickListener {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private final BridgeContext ctx;
    private final IFlowMessageHandler messageHandler;

    public FlowCommandHandler(BridgeContext ctx) {
        this.ctx = ctx;
        this.messageHandler = new FlowMessagePublisher(ctx);
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
        if (groupId == null || name == null || technology == null) {
            return;
        }
        // Legacy connection fields: the destination is now part of the connector configuration
        String host = payload.path("host").asText("");

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
            int everyTicks = Math.max(1, payload.path("everyTicks").asInt(1));
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

            FlowRuntime flow = findFlowById(group, flowId);
            if (flow != null) {
                flow.everyTicks = everyTicks;
            }
            server.persistState();

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

            closeSession(flowId);

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

            // Generation fields (everyTicks, template, format) apply on the next tick.
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
            if (payload.hasNonNull("everyTicks")) {
                flow.everyTicks = Math.max(1, payload.path("everyTicks").asInt(flow.everyTicks));
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
                clone.everyTicks = original.everyTicks;
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

    /**
     * Starts (or resumes) a group: validates its variables and templates, starts one
     * connector per flow and creates the dispatcher of its output mode. Counters are reset
     * when the group starts from stopped, and kept when it resumes from paused.
     *
     * @param group the group to start
     * @throws IllegalStateException on cyclic or broken variable references
     */
    public void startGroupInternal(GroupRuntime group) {
        if ("running".equals(group.status)) {
            return;
        }
        boolean resuming = "paused".equals(group.status);

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
        shutdownDispatcher(group);

        for (FlowRuntime flow : group.flows) {
            if (!resuming) {
                flow.resetCounters();
            }
            flow.meter.reset();
            flow.throughput = 0;

            // Release a session left over from a previous start (e.g. restarting a paused group)
            closeSession(flow.id);

            try {
                ConnectorContext context = new ConnectorContext(flow.name, group.name, ctx.getCurrentOutputDir());
                ConnectorSession session = ctx.getConnectorCatalogService()
                    .openSession(flow.technology, flow.connectorConfig, context);
                ctx.getConnectorByFlowId().put(flow.id, session);

                flow.connectionStatus = "connected";
                flow.hasError = false;
                flow.errorMessage = null;
            } catch (ConnectorConfigException ex) {
                markConnectorError(flow, "Invalid connector configuration: " + ex.getMessage());
            } catch (Exception | LinkageError ex) {
                markConnectorError(flow, ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage());
            }
        }

        group.dispatcher = createDispatcher(group);
        group.startTick = 0;
        group.status = "running";
    }

    /**
     * Creates the dispatcher of the group's output mode for the flows whose connector started.
     *
     * @param group the group being started
     * @return a parallel or sequential dispatcher
     */
    public IGroupDispatcher createDispatcher(GroupRuntime group) {
        if (OutputMode.fromValue(group.outputMode) == OutputMode.SEQUENTIAL) {
            return new SequentialGroupDispatcher(group, messageHandler, SequentialGroupDispatcher.DEFAULT_QUEUE_CAPACITY);
        }
        List<FlowRuntime> sendingFlows = new ArrayList<>();
        for (FlowRuntime flow : group.flows) {
            if (ctx.getConnectorByFlowId().containsKey(flow.id)) {
                sendingFlows.add(flow);
            }
        }
        return new ParallelGroupDispatcher(group, sendingFlows, messageHandler);
    }

    private void shutdownDispatcher(GroupRuntime group) {
        if (group.dispatcher != null) {
            group.dispatcher.shutdown();
            group.dispatcher = null;
        }
    }

    /**
     * Pauses a group: no more messages are generated and pending ones are dropped (they stay
     * generated but not sent). Connectors and counters are kept; START_GROUP resumes it.
     *
     * @param group the group to pause
     */
    public void pauseGroupInternal(GroupRuntime group) {
        shutdownDispatcher(group);
        for (FlowRuntime flow : group.flows) {
            flow.throughput = 0;
        }
        group.status = "paused";
    }

    /**
     * Stops a group: shuts down its dispatcher and connectors. Counters are kept so the
     * final numbers stay visible until the group starts again.
     *
     * @param group the group to stop
     */
    public void stopGroupInternal(GroupRuntime group) {
        shutdownDispatcher(group);
        ctx.getTemplateEngine().clearVariableCache();
        for (FlowRuntime flow : group.flows) {
            closeSession(flow.id);

            flow.connectionStatus = "disconnected";
            flow.throughput = 0;
            flow.hasError = false;
            flow.errorMessage = null;
        }

        group.status = "stopped";
    }

    /**
     * Dispatches one global tick: for every running group, the enabled flows that are due on
     * this tick (one message every {@code everyTicks} ticks, counted from the group's first
     * tick) are handed to the group's dispatcher. Dispatchers never block on network I/O, so
     * a slow group does not delay the others. Paused and stopped groups are skipped.
     *
     * @param tickNumber sequential tick number
     * @return true if at least one message was generated or handed to a sender
     */
    @Override
    public boolean onTick(long tickNumber) {
        Map<IGroupDispatcher, List<FlowRuntime>> work = new LinkedHashMap<>();
        synchronized (ctx.getStateLock()) {
            // Snapshot under the lock; generating and publishing happen outside it
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                if (!"running".equals(group.status) || group.dispatcher == null) {
                    continue;
                }
                if (group.startTick == 0) {
                    group.startTick = tickNumber;
                }
                List<FlowRuntime> due = new ArrayList<>();
                for (FlowRuntime flow : group.flows) {
                    if (flow.enabled
                        && ctx.getConnectorByFlowId().containsKey(flow.id)
                        && flow.isDueOn(tickNumber, group.startTick)) {
                        due.add(flow);
                    }
                }
                if (!due.isEmpty()) {
                    work.put(group.dispatcher, due);
                }
            }
        }

        boolean dispatched = false;
        for (Map.Entry<IGroupDispatcher, List<FlowRuntime>> entry : work.entrySet()) {
            dispatched |= entry.getKey().dispatch(entry.getValue());
        }
        return dispatched;
    }

    private void markConnectorError(FlowRuntime flow, String message) {
        flow.connectionStatus = "error";
        flow.hasError = true;
        flow.errorMessage = message;
        ctx.getTotalErrors().incrementAndGet();
        ctx.getServer().sendLogToAll("error", flow.id, "[" + flow.name + "] " + message);
    }

    /**
     * Closes the connector session of a flow, if open.
     *
     * @param flowId the flow
     */
    public void closeSession(String flowId) {
        ConnectorSession session = ctx.getConnectorByFlowId().remove(flowId);
        if (session == null) {
            return;
        }
        try {
            session.close();
        } catch (Exception ex) {
            ctx.getTotalErrors().incrementAndGet();
            ctx.getServer().logToBackend("warn", "CONNECTORS", "Failed to close connector of flow " + flowId + ": " + ex.getMessage(), null);
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
