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

import java.io.IOException;
import java.util.*;
import com.gensynth.core.api.IFlowMessageHandler;
import com.gensynth.core.api.IGroupDispatcher;
import com.gensynth.core.api.ITickListener;
import com.gensynth.core.model.OutputMode;
import com.gensynth.core.model.SequentialOrder;
import com.gensynth.core.ws.dispatch.FlowMessagePublisher;
import com.gensynth.core.ws.dispatch.ParallelGroupDispatcher;
import com.gensynth.core.ws.dispatch.SequentialGroupDispatcher;
import com.gensynth.core.flow.FlowFormats;
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

    /** A {{tag}} of a flow template; group 1 is the expression inside the braces. */
    private static final java.util.regex.Pattern TEMPLATE_TAG = java.util.regex.Pattern.compile("\\{\\{([^}]+)\\}\\}");
    private static final String CREATE_FLOW = "CREATE_FLOW";
    private static final String TECHNOLOGY = "technology";
    private static final String TOPIC = "topic";
    private static final String INTERVAL = "interval";
    private static final String BURST = "burst";
    private static final String EVERY_TICKS = "everyTicks";
    private static final String TEMPLATE = "template";
    private static final String FORMAT = "format";
    /** Plugin id of File Output. */
    private static final String FILE_TECHNOLOGY = "file";
    private static final String CONNECTOR_CONFIG = "connectorConfig";
    private static final String DISCONNECTED = "disconnected";
    private static final String FLOW_NOT_FOUND = "Flow not found: ";
    private static final String GROUP_SCOPE = "GROUP";
    private static final String GLOBAL_SCOPE = "GLOBAL";
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private final BridgeContext ctx;
    private final IFlowMessageHandler messageHandler;

    /** The flows of one group due on a tick, with the global tick and the group tick they were due on. */
    private record GroupWork(IGroupDispatcher dispatcher, List<FlowRuntime> dueFlows, long tickNumber, long groupTick) {
    }

    public FlowCommandHandler(BridgeContext ctx) {
        this.ctx = ctx;
        this.messageHandler = new FlowMessagePublisher(ctx);
    }

    @Override
    public void handle(WebSocket conn, JsonNode payload, String commandId) throws IOException {
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
            String format = payload.path(FORMAT).asText(FlowFormats.JSON);
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
            if (!applyName(conn, commandId, payload, group, flow) || !applyTechnology(conn, commandId, payload, flow)) {
                return;
            }
            applySendFields(flow, payload);
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

    /**
     * Renames the flow when the payload has a name.
     *
     * @return false when the name is empty or taken (the error is sent and nothing else changes)
     */
    private boolean applyName(WebSocket conn, String commandId, JsonNode payload, GroupRuntime group, FlowRuntime flow) {
        if (!payload.hasNonNull("name")) {
            return true;
        }
        String newName = payload.path("name").asText(flow.name).trim();
        if (newName.isEmpty()) {
            ctx.getServer().sendError(conn, commandId, INVALID_PAYLOAD, "Flow name cannot be empty", Map.of(FLOW_ID, flow.id));
            return false;
        }
        if (UniqueNames.isTaken(group.flowNames(flow.id), newName)) {
            sendDuplicateFlowName(conn, commandId, null, newName, group.id);
            return false;
        }
        flow.name = newName;
        return true;
    }

    /**
     * Changes the flow's connector when the payload has a technology.
     *
     * @return false when there is no connector for it (the error is sent and nothing else changes)
     */
    private boolean applyTechnology(WebSocket conn, String commandId, JsonNode payload, FlowRuntime flow) {
        if (!payload.hasNonNull(TECHNOLOGY)) {
            return true;
        }
        String technology = payload.path(TECHNOLOGY).asText(flow.technology);
        if (ctx.getConnectorCatalogService().findLatestConnector(technology).isEmpty()) {
            ctx.getServer().sendError(conn, commandId, INVALID_PAYLOAD, "Connector not found for technology: " + technology, Map.of(TECHNOLOGY, technology));
            return false;
        }
        flow.technology = technology;
        return true;
    }

    /** Copies the connection target and the generation settings present in the payload. */
    private static void applySendFields(FlowRuntime flow, JsonNode payload) {
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
                for (Variable variable : ctx.getVariablesById().values()) {
                    if (original.id.equals(variable.getFlowId())) {
                        flowVars.add(variable);
                    }
                }
                for (Variable variable : flowVars) {
                    String newVarId = UUID.randomUUID().toString();
                    Variable varClone = new Variable(
                        newVarId,
                        variable.getName(),
                        variable.getScope(),
                        variable.getType(),
                        variable.getDefaultValue(),
                        variable.getConfig(),
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
     * there are no circular or broken references, GROUP and GLOBAL variables only read variables
     * of their own scope or a wider one, and item references ({@code .itemX}) only point to Fixed
     * Subset lists. Nothing is opened or changed.
     *
     * @param group the group to check
     * @throws IllegalStateException naming the first problem found
     */
    public void validateGroupForStart(GroupRuntime group) {
        // Validate all variables in the group and perform cycle detection fail-fast
        DependencyResolver resolver = new DependencyResolver();
        try {
            resolver.resolve(reachableConfigurations(group));
        } catch (CyclicDependencyException e) {
            throw new IllegalStateException("Circular dependency detected", e);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("Broken reference detected: " + e.getMessage(), e);
        }
        checkSharedDependencies(group);

        // Validate flow templates for invalid sub-item access on non-FIXED_SUBSET list strategies
        for (FlowRuntime flow : group.flows) {
            String template = flow.template;
            if (template != null && !template.isEmpty()) {
                java.util.regex.Matcher matcher = TEMPLATE_TAG.matcher(template);
                while (matcher.find()) {
                    checkItemReference(matcher.group(1).trim(), flow, group);
                }
            }
        }
    }

    /**
     * Checks that every GROUP and GLOBAL variable the group can use reads only variables it can
     * reach from its own scope: a GROUP variable the GROUP variables of its group and the GLOBAL
     * ones, a GLOBAL variable only GLOBAL ones. Their value is the same for every flow on a tick,
     * so it cannot come from the LOCAL variables of one flow.
     *
     * @throws IllegalStateException naming the variable and the dependency it cannot read
     */
    private void checkSharedDependencies(GroupRuntime group) {
        Map<String, Variable> variables = ctx.getVariablesById();
        for (Variable variable : variables.values()) {
            if (!TemplateEngine.isShared(variable) || !isReachableFrom(group, variable)) {
                continue;
            }
            boolean groupScope = GROUP_SCOPE.equalsIgnoreCase(variable.getScope());
            String ownerGroupId = groupScope ? variable.getGroupId() : null;
            for (String dependency : TemplateEngine.dependenciesOf(variable)) {
                if (dependency.equals(variable.getName()) || dependency.equals(variable.getId())) {
                    continue;
                }
                if (ctx.getTemplateEngine().findAccessibleVariable(variables, dependency, null, null, ownerGroupId) == null) {
                    throw new IllegalStateException(sharedDependencyMessage(variable, dependency, groupScope));
                }
            }
        }
    }

    /**
     * Error raised when a GROUP or GLOBAL variable reads a variable outside its reach.
     *
     * @param variable   the GROUP or GLOBAL variable
     * @param dependency the name of the variable it reads
     * @param groupScope whether the variable is a GROUP one
     * @return the user-facing message
     */
    public static String sharedDependencyMessage(Variable variable, String dependency, boolean groupScope) {
        String scope = groupScope ? GROUP_SCOPE : GLOBAL_SCOPE;
        String reachable = groupScope ? "a GROUP variable of its group or a GLOBAL variable" : "a GLOBAL variable";
        String flows = groupScope ? "of their group" : "of every group";
        String unreadable = groupScope ? "LOCAL variables" : "LOCAL or GROUP variables";
        return scope + " variable '" + variable.getName() + "' depends on '" + dependency + "', which is not "
            + reachable + ". " + scope + " variables give the same value to every flow " + flows
            + " on each tick, so they cannot read " + unreadable + ".";
    }

    /**
     * @return the parsed configuration of every variable the group can use, by name and also by
     *         id when it differs (references may use either)
     */
    private Map<String, VariableConfiguration> reachableConfigurations(GroupRuntime group) {
        Map<String, VariableConfiguration> configs = new HashMap<>();
        for (Variable variable : ctx.getVariablesById().values()) {
            if (!isReachableFrom(group, variable)) {
                continue;
            }
            VariableConfiguration vc = parseConfiguration(variable);
            configs.put(variable.getName(), vc);
            if (variable.getId() != null && !variable.getId().equals(variable.getName())) {
                configs.put(variable.getId(), vc);
            }
        }
        return configs;
    }

    /** Whether a flow of the group can use the variable: a global one, one of the group or one of its flows. */
    private static boolean isReachableFrom(GroupRuntime group, Variable variable) {
        if (GLOBAL_SCOPE.equalsIgnoreCase(variable.getScope())) {
            return true;
        }
        if (GROUP_SCOPE.equalsIgnoreCase(variable.getScope()) && group.id.equals(variable.getGroupId())) {
            return true;
        }
        if (!"LOCAL".equalsIgnoreCase(variable.getScope())) {
            return false;
        }
        for (FlowRuntime flow : group.flows) {
            if (flow.id.equals(variable.getFlowId())) {
                return true;
            }
        }
        return false;
    }

    /**
     * @return the variable's generator configuration
     * @throws IllegalStateException naming the variable when its configuration is invalid
     */
    private static VariableConfiguration parseConfiguration(Variable variable) {
        try {
            return VariableFactory.createFromMap(variable.getId(), variable.getType(), variable.getConfig());
        } catch (InvalidVariableConfigException e) {
            // Name the variable as the user sees it, not by its internal id
            throw new IllegalStateException("Invalid configuration for variable '" + variable.getName() + "': "
                + String.join("; ", e.getErrors()), e);
        }
    }

    /**
     * Checks one placeholder of a flow template: an item reference ({@code .itemX}) is only valid
     * on a list with the Fixed Subset strategy.
     *
     * @throws IllegalStateException when the placeholder reads an item of another kind of list
     */
    private void checkItemReference(String fullSpec, FlowRuntime flow, GroupRuntime group) {
        if ("uuid".equals(fullSpec) || "ts".equals(fullSpec) || "n".equals(fullSpec)
            || TemplateEngine.FLOW_NAME_PLACEHOLDER.equals(fullSpec) || !fullSpec.contains(".")) {
            return;
        }
        String scopePart;
        String namePart;
        String[] parts = fullSpec.split("\\.");
        if (parts.length >= 3 && parts[parts.length - 1].toLowerCase().startsWith("item")) {
            scopePart = parts[0].toLowerCase();
            namePart = parts[1];
        } else if (parts.length == 2 && parts[1].toLowerCase().startsWith("item")) {
            scopePart = null;
            namePart = parts[0];
        } else {
            return;
        }

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

    /**
     * Connector settings a flow's session opens with: File Output writes the file in the flow's
     * message format (.json, .xml, .csv or .txt), not in a setting of its own.
     */
    static Map<String, Object> sessionConfig(FlowRuntime flow) {
        if (!FILE_TECHNOLOGY.equalsIgnoreCase(flow.technology)) {
            return flow.connectorConfig;
        }
        Map<String, Object> config = new LinkedHashMap<>(flow.connectorConfig);
        config.put(FORMAT, FlowFormats.fileFormat(flow.format, flow.template));
        return config;
    }

    private boolean openFlowSession(GroupRuntime group, FlowRuntime flow) {
        try {
            ConnectorContext context = new ConnectorContext(flow.name, group.name, ctx.getCurrentOutputDir());
            // The session outlives this method: connectorByFlowId owns it and closeSession() closes it
            @SuppressWarnings("java:S2095")
            ConnectorSession session = ctx.getConnectorCatalogService()
                .openSession(flow.technology, sessionConfig(flow), context);
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
                    work.add(new GroupWork(group.dispatcher, due, tickNumber, tickNumber - group.startTick));
                }
            }
        }

        boolean dispatched = false;
        for (GroupWork groupWork : work) {
            dispatched |= groupWork.dispatcher().dispatch(groupWork.dueFlows(), groupWork.tickNumber(), groupWork.groupTick());
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
