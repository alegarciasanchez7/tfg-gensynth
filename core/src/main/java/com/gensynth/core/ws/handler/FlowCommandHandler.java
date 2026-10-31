package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.gensynth.plugin.api.ConnectorConfigException;
import com.gensynth.plugin.api.ConnectorContext;
import com.gensynth.plugin.api.ConnectorSession;
import com.gensynth.core.model.FlowDefinition;
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
import com.gensynth.core.model.SequentialOrder;
import com.gensynth.core.ws.dispatch.FlowMessagePublisher;
import com.gensynth.core.ws.dispatch.ParallelGroupDispatcher;
import com.gensynth.core.ws.dispatch.SequentialGroupDispatcher;
import com.gensynth.core.flow.TemplateEngine;
import com.gensynth.core.util.NamingPattern;
import com.gensynth.core.util.UniqueNames;
import com.gensynth.core.flow.variables.VariableConfiguration;
import com.gensynth.core.flow.variables.VariableFactory;
import com.gensynth.core.flow.variables.VariableType;
import com.gensynth.core.flow.variables.DependencyResolver;
import com.gensynth.core.flow.variables.CyclicDependencyException;
import com.gensynth.core.flow.variables.InvalidVariableConfigException;

import static com.gensynth.core.ws.BridgeProtocol.FLOW_ID;
import static com.gensynth.core.ws.BridgeProtocol.GROUP_ID;
import static com.gensynth.core.ws.BridgeProtocol.GROUP_NOT_FOUND;
import static com.gensynth.core.ws.BridgeProtocol.INVALID_PAYLOAD;
import static com.gensynth.core.ws.BridgeProtocol.NOT_FOUND;
import static com.gensynth.core.ws.BridgeProtocol.RUNNING;
import static com.gensynth.core.ws.BridgeProtocol.SOURCE_FLOWS;

/**
 * Handles logic for CRUD and execution of simulation Flows.
 *
 * Message generation is driven by the global tick clock: on every tick ({@link #onTick(long)})
 * each enabled flow of every running group that is due (one message every {@code everyTicks}
 * ticks) is handed to its group's {@link IGroupDispatcher}, which sends it following the
 * group's output mode.
 */
public class FlowCommandHandler implements CommandHandler, ITickListener {

    private static final String CREATE_FLOW = "CREATE_FLOW";
    private static final String TECHNOLOGY = "technology";
    private static final String TOPIC = "topic";
    private static final String INTERVAL = "interval";
    private static final String BURST = "burst";
    private static final String EVERY_TICKS = "everyTicks";
    private static final String TEMPLATE = "template";
    private static final String FORMAT = "format";
    private static final String CONNECTOR_CONFIG = "connectorConfig";
    private static final String DISCONNECTED = "disconnected";
    private static final String FLOW_NOT_FOUND = "Flow not found: ";
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private final BridgeContext ctx;
    private final IFlowMessageHandler messageHandler;

    /** The flows of one group due on a tick, with the group tick they were due on. */
    private record GroupWork(IGroupDispatcher dispatcher, List<FlowRuntime> dueFlows, long groupTick) {
    }

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
        String groupId = server.requireTextField(conn, commandId, payload, GROUP_ID, INVALID_PAYLOAD, CREATE_FLOW);
        String name = server.requireTextField(conn, commandId, payload, "name", INVALID_PAYLOAD, CREATE_FLOW);
        String technology = server.requireTextField(conn, commandId, payload, TECHNOLOGY, INVALID_PAYLOAD, CREATE_FLOW);
        if (groupId == null || name == null || technology == null) {
            return;
        }
        // Legacy connection fields: the destination is now part of the connector configuration
        String host = payload.path("host").asText("");

        String clientRequestId = payload.path("clientRequestId").asText(null);
        // Bulk creation (Repeater) asks the Core to rename a taken name instead of failing
        boolean autoRename = payload.path("autoRename").asBoolean(false);

        if (ctx.getConnectorCatalogService().findLatestConnector(technology).isEmpty()) {
            server.sendError(conn, commandId, clientRequestId, INVALID_PAYLOAD, "Connector not found for technology: " + technology, Map.of(TECHNOLOGY, technology));
            return;
        }

        synchronized (ctx.getStateLock()) {
            GroupRuntime group = ctx.getGroupsById().get(groupId);
            if (group == null) {
                server.sendError(conn, commandId, clientRequestId, NOT_FOUND, GROUP_NOT_FOUND + groupId, Map.of(GROUP_ID, groupId));
                return;
            }

            // Flows of a group write to outputs named after the flow, so names must be unique
            name = name.trim();
            List<String> takenNames = group.flowNames(null);
            if (UniqueNames.isTaken(takenNames, name)) {
                if (!autoRename) {
                    sendDuplicateFlowName(conn, commandId, clientRequestId, name, groupId);
                    return;
                }
                name = UniqueNames.makeUnique(name, takenNames);
            }

            String flowId = payload.path(FLOW_ID).asText("");
            if (flowId.isBlank()) {
                flowId = UUID.randomUUID().toString();
            }

            if (findFlowById(group, flowId) != null) {
                server.sendError(conn, commandId, clientRequestId, INVALID_PAYLOAD, "Flow already exists: " + flowId, Map.of(FLOW_ID, flowId));
                return;
            }

            String topic = payload.path(TOPIC).asText("gensynth.data");
            int port = payload.path("port").asInt(5672);
            int interval = Math.max(50, payload.path(INTERVAL).asInt(1000));
            int burst = Math.max(1, payload.path(BURST).asInt(1));
            int everyTicks = Math.max(1, payload.path(EVERY_TICKS).asInt(1));
            String template = payload.path(TEMPLATE).asText("{\"eventId\":\"{{uuid}}\",\"timestamp\":\"{{ts}}\",\"source\":\"gen-synth\",\"value\":{{n}}}");
            String format = payload.path(FORMAT).asText(technology.equalsIgnoreCase("file") ? "plain" : "json");
            Map<String, Object> connectorConfig = parseConnectorConfig(payload.path(CONNECTOR_CONFIG));

            group.flows.add(new FlowRuntime(
                flowId,
                name,
                technology,
                DISCONNECTED,
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
                flow.everyTicks.set(everyTicks);
                applyEventLoss(flow, payload);
            }
            server.persistState();

            if (flow != null) {
                server.sendCreatedResponse(conn, commandId, clientRequestId, flow.toPayload(), "flow_created");
            }
        }

        server.logToBackend("info", SOURCE_FLOWS, "Created flow '" + name + "'", commandId);
        server.broadcastGroupsUpdate();
    }

    public void handleDeleteFlow(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, GROUP_ID, INVALID_PAYLOAD, "DELETE_FLOW");
        String flowId = server.requireTextField(conn, commandId, payload, FLOW_ID, INVALID_PAYLOAD, "DELETE_FLOW");
        if (groupId == null || flowId == null) {
            return;
        }

        synchronized (ctx.getStateLock()) {
            GroupRuntime group = ctx.getGroupsById().get(groupId);
            if (group == null) {
                server.sendError(conn, commandId, NOT_FOUND, GROUP_NOT_FOUND + groupId, Map.of(GROUP_ID, groupId));
                return;
            }

            FlowRuntime flow = findFlowById(group, flowId);
            if (flow == null) {
                server.sendError(conn, commandId, NOT_FOUND, FLOW_NOT_FOUND + flowId, Map.of(FLOW_ID, flowId));
                return;
            }

            closeSession(flowId);

            server.logToBackend("info", SOURCE_FLOWS, "Deleted flow '" + flow.name + "'", commandId);
            group.flows.remove(flow);
            server.persistState();
        }

        server.sendAck(conn, commandId, "flow_deleted");
        server.broadcastGroupsUpdate();
    }

    public void handleUpdateFlowConfig(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, GROUP_ID, INVALID_PAYLOAD, "UPDATE_FLOW_CONFIG");
        String flowId = server.requireTextField(conn, commandId, payload, FLOW_ID, INVALID_PAYLOAD, "UPDATE_FLOW_CONFIG");
        if (groupId == null || flowId == null) {
            return;
        }

        String updatedFlowName;
        synchronized (ctx.getStateLock()) {
            GroupRuntime group = ctx.getGroupsById().get(groupId);
            if (group == null) {
                server.sendError(conn, commandId, NOT_FOUND, GROUP_NOT_FOUND + groupId, Map.of(GROUP_ID, groupId));
                return;
            }

            FlowRuntime flow = findFlowById(group, flowId);
            if (flow == null) {
                server.sendError(conn, commandId, NOT_FOUND, FLOW_NOT_FOUND + flowId, Map.of(FLOW_ID, flowId));
                return;
            }

            // Generation fields (everyTicks, event loss, template, format) apply on the next tick.
            // Connection fields (technology, host, port, connectorConfig) apply when the group is restarted.
            if (payload.hasNonNull("name")) {
                String newName = payload.path("name").asText(flow.name).trim();
                if (newName.isEmpty()) {
                    server.sendError(conn, commandId, INVALID_PAYLOAD, "Flow name cannot be empty", Map.of(FLOW_ID, flowId));
                    return;
                }
                if (UniqueNames.isTaken(group.flowNames(flowId), newName)) {
                    sendDuplicateFlowName(conn, commandId, null, newName, groupId);
                    return;
                }
                flow.name = newName;
            }
            if (payload.hasNonNull(TECHNOLOGY)) {
                String technology = payload.path(TECHNOLOGY).asText(flow.technology);
                if (ctx.getConnectorCatalogService().findLatestConnector(technology).isEmpty()) {
                    server.sendError(conn, commandId, INVALID_PAYLOAD, "Connector not found for technology: " + technology, Map.of(TECHNOLOGY, technology));
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
            if (payload.hasNonNull(TOPIC)) {
                flow.topic = payload.path(TOPIC).asText(flow.topic);
            }
            if (payload.hasNonNull(INTERVAL)) {
                flow.interval = Math.max(50, payload.path(INTERVAL).asInt(flow.interval));
            }
            if (payload.hasNonNull(BURST)) {
                flow.burst = Math.max(1, payload.path(BURST).asInt(flow.burst));
            }
            if (payload.hasNonNull(EVERY_TICKS)) {
                flow.everyTicks.set(Math.max(1, payload.path(EVERY_TICKS).asInt(flow.everyTicks.get())));
            }
            applyEventLoss(flow, payload);
            if (payload.hasNonNull(TEMPLATE)) {
                flow.template = payload.path(TEMPLATE).asText(flow.template);
            }
            if (payload.hasNonNull(FORMAT)) {
                flow.format = payload.path(FORMAT).asText(flow.format);
            }
            if (payload.hasNonNull(CONNECTOR_CONFIG) && payload.get(CONNECTOR_CONFIG).isObject()) {
                flow.connectorConfig = parseConnectorConfig(payload.get(CONNECTOR_CONFIG));
            }

            if (payload.hasNonNull("enabled")) {
                boolean enabled = payload.path("enabled").asBoolean();
                flow.enabled = enabled;

                // If we unblock a flow, the group should also appear as unblocked
                if (enabled) {
                    group.enabled = true;
                    openSessionsOfUnlockedFlows(group, List.of(flow));
                }
            }

            server.persistState();
            updatedFlowName = flow.name;
        }

        server.sendAck(conn, commandId, "flow_updated");
        server.logToBackend("info", SOURCE_FLOWS, "Updated config for flow '" + updatedFlowName + "'", commandId);
        server.broadcastGroupsUpdate();
    }

    public void handleCloneFlow(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String groupId = server.requireTextField(conn, commandId, payload, GROUP_ID, INVALID_PAYLOAD, "CLONE_FLOW");
        String flowId = server.requireTextField(conn, commandId, payload, FLOW_ID, INVALID_PAYLOAD, "CLONE_FLOW");
        int count = payload.path("count").asInt(1);
        String namingPattern = payload.path("namingPattern").asText("${name} (Clone ${index})");
        if (groupId == null || flowId == null) return;

        synchronized (ctx.getStateLock()) {
            GroupRuntime group = ctx.getGroupsById().get(groupId);
            if (group == null) {
                server.sendError(conn, commandId, NOT_FOUND, GROUP_NOT_FOUND + groupId, Map.of(GROUP_ID, groupId));
                return;
            }

            FlowRuntime original = findFlowById(group, flowId);
            if (original == null) {
                server.sendError(conn, commandId, NOT_FOUND, FLOW_NOT_FOUND + flowId, Map.of(FLOW_ID, flowId));
                return;
            }

            for (int i = 1; i <= count; i++) {
                String newFlowId = UUID.randomUUID().toString();
                // A taken name gets the first free " (k)" suffix instead of failing the clone
                String newName = UniqueNames.makeUnique(
                    NamingPattern.apply(namingPattern, original.name, i), group.flowNames(null));

                FlowRuntime clone = new FlowRuntime(
                    newFlowId,
                    newName,
                    original.technology,
                    DISCONNECTED,
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
                clone.copySendSettingsFrom(original);
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
        server.logToBackend("info", SOURCE_FLOWS, "Cloned flow '" + flowId + "' " + count + " times", commandId);
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
        if (RUNNING.equals(group.status)) {
            return;
        }
        boolean resuming = "paused".equals(group.status);

        validateGroupForStart(group);

        ctx.getTemplateEngine().clearVariableCache();
        shutdownDispatcher(group);

        // Release the sessions left over from a previous start (e.g. restarting a paused group)
        // before opening any, so a flow never collides with a target its group still holds
        for (FlowRuntime flow : group.flows) {
            closeSession(flow.id);
        }

        for (FlowRuntime flow : group.flows) {
            if (!resuming) {
                flow.resetCounters();
            }
            flow.meter.reset();
            flow.throughput = 0;

            // A locked flow (or every flow of a locked group) opens no connector, so it creates
            // no output file and never holds a target an enabled flow needs
            if (flow.enabled) {
                openFlowSession(group, flow);
            } else {
                flow.connectionStatus = DISCONNECTED;
                flow.hasError = false;
                flow.errorMessage = null;
            }
        }

        group.dispatcher = createDispatcher(group);
        group.startTick = 0;
        group.status = RUNNING;
    }

    /**
     * Checks that a group can start: every variable it can use has a valid configuration,
     * there are no circular or broken references, and item references ({@code .itemX}) only
     * point to Fixed Subset lists. Nothing is opened or changed.
     *
     * @param group the group to check
     * @throws IllegalStateException naming the first problem found
     */
    public void validateGroupForStart(GroupRuntime group) {
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
                VariableConfiguration vc;
                try {
                    vc = VariableFactory.createFromMap(var.getId(), var.getType(), var.getConfig());
                } catch (InvalidVariableConfigException e) {
                    // Name the variable as the user sees it, not by its internal id
                    throw new IllegalStateException("Invalid configuration for variable '" + var.getName() + "': "
                        + String.join("; ", e.getErrors()), e);
                }
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
                    if ("uuid".equals(fullSpec) || "ts".equals(fullSpec) || "n".equals(fullSpec)
                        || TemplateEngine.FLOW_NAME_PLACEHOLDER.equals(fullSpec)) {
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
                        if (variable != null && VariableType.LIST.matches(variable.getType())) {
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
    }

    /**
     * Sends the error of a group that cannot start (see {@link #validateGroupForStart}):
     * CYCLIC_DEPENDENCY_ERROR with the cycle, BROKEN_REFERENCE_ERROR, or INTERNAL_ERROR with
     * the reason (e.g. an invalid variable configuration).
     *
     * @param server    the bridge server
     * @param conn      the connection that sent the start command
     * @param commandId the command identifier
     * @param ex        the validation failure
     */
    public static void sendStartError(UiBridgeWebSocketServer server, WebSocket conn, String commandId, IllegalStateException ex) {
        String errType = "INTERNAL_ERROR";
        Map<String, Object> details = new HashMap<>();
        if (ex.getCause() instanceof CyclicDependencyException cycle) {
            errType = "CYCLIC_DEPENDENCY_ERROR";
            details.put("cycle", cycle.getCycle());
        } else if (ex.getMessage() != null && ex.getMessage().contains("Broken reference")) {
            errType = "BROKEN_REFERENCE_ERROR";
        }
        server.sendError(conn, commandId, errType, ex.getMessage(), details);
    }

    /**
     * Opens the connector of the given flows when they were unlocked while their group runs:
     * locked flows get no connector at start, so without this they would not send until the
     * group restarts. Flows that already have a connector are left as they are.
     *
     * @param group the flows' group
     * @param flows the flows just unlocked
     */
    public void openSessionsOfUnlockedFlows(GroupRuntime group, Collection<FlowRuntime> flows) {
        if (!RUNNING.equals(group.status) || group.dispatcher == null) {
            return;
        }
        boolean opened = false;
        for (FlowRuntime flow : flows) {
            if (flow.enabled && !ctx.getConnectorByFlowId().containsKey(flow.id)) {
                opened |= openFlowSession(group, flow);
            }
        }
        if (opened) {
            // The parallel dispatcher only has workers for the flows that had a connector
            shutdownDispatcher(group);
            group.dispatcher = createDispatcher(group);
        }
    }

    private boolean openFlowSession(GroupRuntime group, FlowRuntime flow) {
        try {
            ConnectorContext context = new ConnectorContext(flow.name, group.name, ctx.getCurrentOutputDir());
            // The session outlives this method: connectorByFlowId owns it and closeSession() closes it
            @SuppressWarnings("java:S2095")
            ConnectorSession session = ctx.getConnectorCatalogService()
                .openSession(flow.technology, flow.connectorConfig, context);
            ctx.getConnectorByFlowId().put(flow.id, session);

            flow.connectionStatus = "connected";
            flow.hasError = false;
            flow.errorMessage = null;
            return true;
        } catch (ConnectorConfigException ex) {
            markConnectorError(flow, "Invalid connector configuration: " + ex.getMessage());
        } catch (Exception | LinkageError ex) {
            markConnectorError(flow, ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage());
        }
        return false;
    }

    /**
     * Creates the dispatcher of the group's output mode for the flows whose connector started.
     *
     * @param group the group being started
     * @return a parallel or sequential dispatcher
     */
    public IGroupDispatcher createDispatcher(GroupRuntime group) {
        List<FlowRuntime> sendingFlows = new ArrayList<>();
        for (FlowRuntime flow : group.flows) {
            if (ctx.getConnectorByFlowId().containsKey(flow.id)) {
                sendingFlows.add(flow);
            }
        }
        if (OutputMode.fromValue(group.outputMode) == OutputMode.SEQUENTIAL) {
            return new SequentialGroupDispatcher(group, sendingFlows, messageHandler,
                SequentialGroupDispatcher.DEFAULT_QUEUE_CAPACITY, SequentialOrder.fromValue(group.sequentialOrder), new Random());
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

            flow.connectionStatus = DISCONNECTED;
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
        List<GroupWork> work = new ArrayList<>();
        synchronized (ctx.getStateLock()) {
            // Snapshot under the lock; generating and publishing happen outside it
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                if (!RUNNING.equals(group.status) || group.dispatcher == null) {
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
                    // Ticks since the group started: same reference as everyTicks, used by the outage rule
                    work.add(new GroupWork(group.dispatcher, due, tickNumber - group.startTick));
                }
            }
        }

        boolean dispatched = false;
        for (GroupWork groupWork : work) {
            dispatched |= groupWork.dispatcher().dispatch(groupWork.dueFlows(), groupWork.groupTick());
        }
        return dispatched;
    }

    /**
     * Applies the optional event loss fields of a CREATE_FLOW or UPDATE_FLOW_CONFIG payload.
     * Missing fields keep the current value; out-of-range values are clamped
     * ({@code lossPercent} to [0, 100], the outage fields to at least 0).
     *
     * @param flow    the flow to update
     * @param payload the command payload
     */
    private static void applyEventLoss(FlowRuntime flow, JsonNode payload) {
        if (payload.path("lossPercent").isNumber()) {
            flow.lossPercent = FlowDefinition.clampPercent(payload.path("lossPercent").asDouble());
        }
        if (payload.path("outageEveryTicks").isNumber()) {
            flow.outageEveryTicks.set(Math.max(0, payload.path("outageEveryTicks").asInt()));
        }
        if (payload.path("outageDurationTicks").isNumber()) {
            flow.outageDurationTicks.set(Math.max(0, payload.path("outageDurationTicks").asInt()));
        }
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

    /**
     * Error message sent when a flow name is already used in its group.
     *
     * @param name the rejected name
     * @return the user-facing message
     */
    public static String duplicateFlowNameMessage(String name) {
        return "A flow named \"" + name + "\" already exists in this group";
    }

    private void sendDuplicateFlowName(WebSocket conn, String commandId, String clientRequestId, String name, String groupId) {
        ctx.getServer().sendError(conn, commandId, clientRequestId, INVALID_PAYLOAD, duplicateFlowNameMessage(name),
            Map.of("name", name, GROUP_ID, groupId, "reason", "DUPLICATE_FLOW_NAME"));
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
            if (RUNNING.equals(group.status)) {
                return true;
            }
        }
        return false;
    }
}
