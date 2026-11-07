package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.java_websocket.WebSocket;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.gensynth.core.connectors.runtime.ConnectorDescriptor;
import com.gensynth.core.flow.variables.CyclicDependencyException;
import com.gensynth.core.flow.variables.InvalidVariableConfigException;
import com.gensynth.core.model.StartProblem;
import com.gensynth.core.model.TickSettings;
import com.gensynth.core.monitoring.ResourceUsage;
import com.gensynth.plugin.api.ConnectorConfig;
import com.gensynth.plugin.api.ConnectorConfigException;
import com.gensynth.core.ws.runtime.ThroughputMeter;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

import static com.gensynth.core.ws.BridgeProtocol.COMMAND_ID;
import static com.gensynth.core.ws.BridgeProtocol.RUNNING;
import static com.gensynth.core.ws.BridgeProtocol.STATUS;

/**
 * Handles system operation commands (START_SYSTEM, STOP_SYSTEM, SUBSCRIBE_METRICS, UNSUBSCRIBE_METRICS,
 * GET_CONNECTOR_CATALOG, GET_LATEST_CONNECTOR, UI_LOG) and schedules metrics emission.
 */
public class SystemCommandHandler implements CommandHandler {

    private static final Logger logger = LoggerFactory.getLogger(SystemCommandHandler.class);

    private final BridgeContext ctx;

    /**
     * Constructs a SystemCommandHandler with the shared BridgeContext.
     *
     * @param ctx the shared bridge context
     */
    public SystemCommandHandler(BridgeContext ctx) {
        this.ctx = ctx;
    }

    @Override
    public void handle(WebSocket conn, JsonNode payload, String commandId) throws Exception {
        // Methods are routed individually by UiBridgeWebSocketServer.
    }

    /**
     * Handles the START_SYSTEM command.
     *
     * @param conn the WebSocket connection
     * @param commandId the command identifier
     */
    public void handleStartSystem(WebSocket conn, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        try {
            startSystemInternal(ctx::startOutputSession);
        } catch (IllegalStateException ex) {
            FlowCommandHandler.sendStartError(server, conn, commandId, ex);
            return;
        }
        server.sendAck(conn, commandId, "system_started");
        broadcastSystemStatus();
        broadcastGroupsUpdate();
        broadcastFlowsMetrics();
        server.sendLog(conn, "info", "SYSTEM", "System started");
    }

    /**
     * Handles the STOP_SYSTEM command.
     *
     * @param conn the WebSocket connection
     * @param commandId the command identifier
     */
    public void handleStopSystem(WebSocket conn, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        stopSystemInternal();
        server.sendAck(conn, commandId, "system_stopped");
        broadcastGroupsUpdate();
        broadcastSystemStatus();
        broadcastFlowsMetrics();
        server.sendLog(conn, "info", "SYSTEM", "System stopped");
    }

    /**
     * Starts the tick clock and every group that is not running. Shared by START_SYSTEM and the
     * headless command line.
     * <p>
     * All or nothing: every group is checked before any starts, so a group that cannot start
     * never leaves the ones before it running (and writing files).
     *
     * @param outputSession opens the session output folder and returns its path; called only
     *                      once every group is valid (the connectors that write files create it)
     * @throws IllegalStateException if a group cannot start (cyclic or broken variable
     *                               references, invalid configuration); nothing is started then
     */
    public void startSystemInternal(Supplier<String> outputSession) {
        UiBridgeWebSocketServer server = ctx.getServer();
        synchronized (ctx.getStateLock()) {
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                if (!RUNNING.equals(group.status)) {
                    server.flowCommandHandler.validateGroupForStart(group);
                }
            }

            ctx.setSystemRunning(true);
            ctx.setSystemStartedAt(System.currentTimeMillis());
            ctx.setCurrentOutputDir(outputSession.get());

            for (GroupRuntime group : ctx.getGroupsById().values()) {
                if (!RUNNING.equals(group.status)) {
                    server.flowCommandHandler.startGroupInternal(group);
                }
            }
        }
    }

    /**
     * Finds what would stop the loaded project from starting, or would leave a flow without
     * sending, without starting anything or opening any connection: the checks of
     * {@link FlowCommandHandler#validateGroupForStart} on every group, plus whether the connector
     * of every enabled flow is installed and its settings are valid. Used by the command line
     * to explain a failed start and to describe a project before running it.
     * <p>
     * The variable checks stop at the first problem of each group. A problem repeated in
     * several groups (a global variable) is reported once, with no group.
     *
     * @return the problems found, empty when the project can start
     */
    public List<StartProblem> checkProject() {
        UiBridgeWebSocketServer server = ctx.getServer();
        List<StartProblem> problems = new ArrayList<>();
        synchronized (ctx.getStateLock()) {
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                try {
                    server.flowCommandHandler.validateGroupForStart(group);
                } catch (RuntimeException e) {
                    addOnce(problems, toProblem(group.name, e));
                }
                for (FlowRuntime flow : group.flows) {
                    if (flow.enabled) {
                        checkConnector(group, flow).ifPresent(problems::add);
                    }
                }
            }
        }
        return problems;
    }

    private Optional<StartProblem> checkConnector(GroupRuntime group, FlowRuntime flow) {
        Optional<ConnectorDescriptor> descriptor = ctx.getConnectorCatalogService().findLatestConnector(flow.technology);
        if (descriptor.isEmpty()) {
            return Optional.of(new StartProblem(StartProblem.Kind.CONNECTOR_NOT_INSTALLED, group.name, flow.name,
                "Connector '" + flow.technology + "' is not installed", null));
        }
        try {
            ConnectorConfig.resolve(descriptor.get().fieldDefinitions(), flow.connectorConfig);
            return Optional.empty();
        } catch (ConnectorConfigException e) {
            return Optional.of(new StartProblem(StartProblem.Kind.INVALID_CONNECTOR_CONFIG, group.name, flow.name,
                "Invalid " + descriptor.get().getDisplayName() + " settings: " + String.join("; ", e.getErrors()), null));
        }
    }

    /**
     * Turns a failure of {@link FlowCommandHandler#validateGroupForStart} into a problem.
     */
    private static StartProblem toProblem(String group, RuntimeException e) {
        Throwable cause = e.getCause();
        if (cause instanceof CyclicDependencyException cycle) {
            return new StartProblem(StartProblem.Kind.CYCLE, group, null,
                "Variables refer to each other in a cycle: " + String.join(" -> ", cycle.getCycle())
                    + " (through formulas, templates or conditional rules)", cycle.getCycle());
        }
        if (cause instanceof InvalidVariableConfigException) {
            return new StartProblem(StartProblem.Kind.INVALID_VARIABLE, group, null, e.getMessage(), null);
        }
        if (e instanceof IllegalStateException && cause instanceof IllegalArgumentException reference) {
            return new StartProblem(StartProblem.Kind.BROKEN_REFERENCE, group, null, reference.getMessage(), null);
        }
        String message = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        StartProblem.Kind kind = message.startsWith("Invalid item reference")
            ? StartProblem.Kind.INVALID_ITEM_REFERENCE : StartProblem.Kind.OTHER;
        return new StartProblem(kind, group, null, message, null);
    }

    /** Adds the problem, or, when another group already has it, reports it once without group. */
    private static void addOnce(List<StartProblem> problems, StartProblem problem) {
        for (int i = 0; i < problems.size(); i++) {
            StartProblem seen = problems.get(i);
            if (seen.kind() == problem.kind() && seen.message().equals(problem.message())) {
                problems.set(i, new StartProblem(seen.kind(), null, null, seen.message(), seen.cycle()));
                return;
            }
        }
        problems.add(problem);
    }

    /**
     * Stops every group (closing their connectors) and the tick clock. Shared by STOP_SYSTEM
     * and the headless command line.
     */
    public void stopSystemInternal() {
        UiBridgeWebSocketServer server = ctx.getServer();
        synchronized (ctx.getStateLock()) {
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                server.flowCommandHandler.stopGroupInternal(group);
            }
            ctx.setSystemRunning(false);
        }
    }

    /**
     * Handles the SUBSCRIBE_METRICS command.
     *
     * @param conn the WebSocket connection
     * @param commandId the command identifier
     */
    public void handleSubscribeMetrics(WebSocket conn, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        ctx.getMetricSubscribers().add(conn);
        server.sendAck(conn, commandId, "subscribed");
        sendMetrics(conn, commandId);
    }

    /**
     * Handles the UNSUBSCRIBE_METRICS command.
     *
     * @param conn the WebSocket connection
     * @param commandId the command identifier
     */
    public void handleUnsubscribeMetrics(WebSocket conn, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        ctx.getMetricSubscribers().remove(conn);
        server.sendAck(conn, commandId, "unsubscribed");
    }

    /**
     * Handles the GET_CONNECTOR_CATALOG command.
     *
     * @param conn the WebSocket connection
     * @param commandId the command identifier
     */
    public void handleGetConnectorCatalog(WebSocket conn, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put(COMMAND_ID, commandId);
        response.put(STATUS, "ok");
        response.put("catalog", ctx.getConnectorCatalogService().listAvailableConnectors());
        server.sendMessage(conn, "CONNECTION_STATUS", commandId, response);
    }

    /**
     * Handles the GET_LATEST_CONNECTOR command.
     *
     * @param conn the WebSocket connection
     * @param payload the JSON payload containing the pluginId
     * @param commandId the command identifier
     */
    public void handleGetLatestConnector(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String pluginId = server.requireTextField(conn, commandId, payload, "pluginId", "INVALID_PAYLOAD", "GET_LATEST_CONNECTOR");
        if (pluginId == null) {
            return;
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put(COMMAND_ID, commandId);
        response.put(STATUS, "ok");
        response.put("connector", ctx.getConnectorCatalogService().findLatestConnector(pluginId).orElse(null));
        server.sendMessage(conn, "CONNECTION_STATUS", commandId, response);
    }

    /**
     * Handles the UI_LOG command.
     *
     * @param conn the WebSocket connection
     * @param payload the JSON payload containing the log level, source, and message
     * @param commandId the command identifier
     */
    public void handleUiLog(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String level = payload.path("level").asText("info");
        String source = payload.path("source").asText("UI");
        String message = payload.path("message").asText("");
        server.logToBackend(level, source, message, commandId);
        server.sendAck(conn, commandId, "log_received");
    }

    /**
     * Periodic task to calculate metrics and broadcast them to subscribed connections.
     */
    public void emitMetricsTick() {
        try {
            ctx.setMessagesPerSecond(ctx.getMessagesLastWindow().getAndSet(0));
            ctx.setNetworkUpPerSecond(ctx.getBytesSentLastWindow().getAndSet(0));
            ctx.setTicksPerSecond(ctx.getTickClock().sampleTicksPerSecond());
            updateFlowRates();
            if (ctx.isSystemRunning()) {
                broadcastFlowsMetrics();
            }
            if (ctx.getMetricSubscribers().isEmpty()) {
                return;
            }

            for (WebSocket subscriber : ctx.getMetricSubscribers()) {
                if (subscriber != null && subscriber.isOpen()) {
                    sendMetrics(subscriber, null);
                }
            }
        } catch (Exception ex) {
            logger.error("Error emitting metrics tick", ex);
            ctx.getTotalErrors().incrementAndGet();
        }
    }

    /**
     * Closes the one-second bucket of every flow meter and updates the measured send rate.
     * Flows of groups that are not running report 0.
     */
    private void updateFlowRates() {
        TickSettings tick = ctx.getTickClock().getSettings();
        long now = System.nanoTime();
        synchronized (ctx.getStateLock()) {
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                boolean running = RUNNING.equals(group.status);
                for (FlowRuntime flow : group.flows) {
                    flow.meter.rotate();
                    flow.throughput = running
                        ? flow.meter.rate(
                            ThroughputMeter.windowFor(tick, flow.everyTicks.get()),
                            ThroughputMeter.periodSeconds(tick, flow.everyTicks.get()),
                            now)
                        : 0.0;
                }
            }
        }
    }

    /**
     * Builds the FLOWS_METRICS payload: live counters and send rate of every flow.
     * {@code dropped} counts the messages generated but discarded on purpose by the flow's
     * event loss, so {@code generated - sent - failed - dropped} are still pending.
     *
     * @return payload {@code { flows: [{ flowId, groupId, throughput, generated, sent, failed, dropped, latency, errorRate, connectionStatus, lastError? }] }}
     */
    public Map<String, Object> buildFlowsMetricsPayload() {
        List<Map<String, Object>> flows = new ArrayList<>();
        synchronized (ctx.getStateLock()) {
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                for (FlowRuntime flow : group.flows) {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("flowId", flow.id);
                    entry.put("groupId", group.id);
                    entry.put("throughput", flow.throughput);
                    entry.put("generated", flow.generated.get());
                    entry.put("sent", flow.sent.get());
                    entry.put("failed", flow.failed.get());
                    entry.put("dropped", flow.dropped.get());
                    entry.put("latency", flow.latency);
                    entry.put("errorRate", flow.hasError ? 1.0 : 0.0);
                    entry.put("connectionStatus", flow.connectionStatus);
                    if (flow.errorMessage != null) {
                        entry.put("lastError", flow.errorMessage);
                    }
                    flows.add(entry);
                }
            }
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("flows", flows);
        return payload;
    }

    /**
     * Broadcasts FLOWS_METRICS to every connection.
     */
    public void broadcastFlowsMetrics() {
        ctx.getServer().broadcastMessage("FLOWS_METRICS", buildFlowsMetricsPayload());
    }

    /**
     * Sends FLOWS_METRICS to one connection.
     *
     * @param conn the WebSocket connection
     */
    public void sendFlowsMetrics(WebSocket conn) {
        ctx.getServer().sendMessage(conn, "FLOWS_METRICS", buildFlowsMetricsPayload());
    }

    /**
     * Periodic task to broadcast group status updates to active connections.
     */
    public void emitGroupsHeartbeat() {
        UiBridgeWebSocketServer server = ctx.getServer();
        if (server.getConnections().isEmpty()) {
            return;
        }
        broadcastGroupsUpdate();
    }

    /**
     * Sends system metrics to a specific WebSocket client.
     *
     * @param conn the WebSocket connection
     * @param commandId the command identifier (can be null)
     */
    public void sendMetrics(WebSocket conn, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        Map<String, Object> payload = buildMetricsPayload(commandId);
        server.sendMessage(conn, "METRICS_UPDATE", commandId, payload);
    }

    /**
     * Sends the current system status to a specific WebSocket client.
     *
     * @param conn the WebSocket connection
     * @param commandId the command identifier (can be null)
     */
    public void sendSystemStatus(WebSocket conn, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        server.sendMessage(conn, "SYSTEM_STATUS", commandId, buildSystemStatusPayload(commandId));
    }

    /**
     * Sends group configuration updates to a specific WebSocket client.
     *
     * @param conn the WebSocket connection
     */
    public void sendGroupsUpdate(WebSocket conn) {
        UiBridgeWebSocketServer server = ctx.getServer();
        server.sendMessage(conn, "GROUPS_UPDATE", server.toGroupsPayload());
    }

    /**
     * Broadcasts group configuration updates to all WebSocket clients.
     */
    public void broadcastGroupsUpdate() {
        UiBridgeWebSocketServer server = ctx.getServer();
        server.broadcastMessage("GROUPS_UPDATE", server.toGroupsPayload());
    }

    /**
     * Broadcasts the system status to all WebSocket clients.
     */
    public void broadcastSystemStatus() {
        UiBridgeWebSocketServer server = ctx.getServer();
        server.broadcastMessage("SYSTEM_STATUS", buildSystemStatusPayload(null));
    }

    /**
     * Builds a payload map representing the current system status.
     *
     * @param commandId the command identifier (can be null)
     * @return the system status payload map
     */
    public Map<String, Object> buildSystemStatusPayload(String commandId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        if (commandId != null) {
            payload.put(COMMAND_ID, commandId);
        }
        payload.put(STATUS, ctx.isSystemRunning() ? RUNNING : "stopped");
        long uptime = ctx.isSystemRunning() ? Math.max(0, (System.currentTimeMillis() - ctx.getSystemStartedAt()) / 1000) : 0;
        payload.put("uptime", uptime);
        payload.put("totalMessages", ctx.getTotalMessages().get());
        payload.put("messagesPerSecond", ctx.getMessagesPerSecond());
        return payload;
    }

    /**
     * Builds a payload map representing the current system performance metrics.
     * {@code memory} is the heap in use (MB), {@code heap} the heap the JVM has reserved now
     * and {@code maxHeap} the most it may reserve (the JVM limit, by default a quarter of the
     * computer's RAM).
     *
     * @param commandId the command identifier (can be null)
     * @return the metrics payload map
     */
    public Map<String, Object> buildMetricsPayload(String commandId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        if (commandId != null) {
            payload.put(COMMAND_ID, commandId);
        }

        ResourceUsage usage = ResourceUsage.sample();
        payload.put("cpu", usage.cpuPercent());
        payload.put("memory", usage.usedMemoryMb());
        payload.put("heap", usage.heapMb());
        payload.put("maxHeap", usage.maxHeapMb());
        payload.put("threads", usage.threads());
        payload.put("messagesPerSecond", ctx.getMessagesPerSecond());
        payload.put("totalMessages", ctx.getTotalMessages().get());
        payload.put("networkUp", ctx.getNetworkUpPerSecond());
        payload.put("networkDown", 0.0);
        payload.put("ticksPerSecond", ctx.getTicksPerSecond());
        payload.put("totalTicks", ctx.getTickClock().getTickCount());
        long uptime = ctx.isSystemRunning() ? Math.max(0, (System.currentTimeMillis() - ctx.getSystemStartedAt()) / 1000) : 0;
        payload.put("uptime", uptime);
        payload.put("activeConnections", ctx.getServer().getConnections().size());
        payload.put("errorCount", ctx.getTotalErrors().get());
        return payload;
    }

}
