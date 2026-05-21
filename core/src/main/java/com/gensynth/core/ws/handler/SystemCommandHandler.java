package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.java_websocket.WebSocket;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.LinkedHashMap;
import java.util.Map;

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
        synchronized (ctx.getStateLock()) {
            ctx.setSystemRunning(true);
            ctx.setSystemStartedAt(System.currentTimeMillis());
            String timestamp = new java.text.SimpleDateFormat("yyyy_MM_dd_HH_mm_ss").format(new java.util.Date());
            ctx.setCurrentOutputDir("OUTPUT_FILES_" + timestamp);

            for (GroupRuntime group : ctx.getGroupsById().values()) {
                if (!"running".equals(group.status)) {
                    server.flowCommandHandler.startGroupInternal(group);
                }
            }
        }
        server.sendAck(conn, commandId, "system_started");
        broadcastSystemStatus();
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
        synchronized (ctx.getStateLock()) {
            for (GroupRuntime group : ctx.getGroupsById().values()) {
                server.flowCommandHandler.stopGroupInternal(group);
            }
            ctx.setSystemRunning(false);
        }
        server.sendAck(conn, commandId, "system_stopped");
        broadcastGroupsUpdate();
        broadcastSystemStatus();
        server.sendLog(conn, "info", "SYSTEM", "System stopped");
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
        response.put("commandId", commandId);
        response.put("status", "ok");
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
        response.put("commandId", commandId);
        response.put("status", "ok");
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
            if (ctx.getMetricSubscribers().isEmpty()) {
                return;
            }

            for (WebSocket subscriber : ctx.getMetricSubscribers()) {
                if (subscriber != null && subscriber.isOpen()) {
                    sendMetrics(subscriber, null);
                }
            }
        } catch (Exception ex) {
            ctx.getTotalErrors().incrementAndGet();
        }
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
            payload.put("commandId", commandId);
        }
        payload.put("status", ctx.isSystemRunning() ? "running" : "stopped");
        long uptime = ctx.isSystemRunning() ? Math.max(0, (System.currentTimeMillis() - ctx.getSystemStartedAt()) / 1000) : 0;
        payload.put("uptime", uptime);
        payload.put("totalMessages", ctx.getTotalMessages().get());
        payload.put("messagesPerSecond", ctx.getMessagesPerSecond());
        return payload;
    }

    /**
     * Builds a payload map representing the current system performance metrics.
     *
     * @param commandId the command identifier (can be null)
     * @return the metrics payload map
     */
    public Map<String, Object> buildMetricsPayload(String commandId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        if (commandId != null) {
            payload.put("commandId", commandId);
        }

        Runtime runtime = Runtime.getRuntime();
        long usedMemory = runtime.totalMemory() - runtime.freeMemory();

        double cpuLoad = 0.0;
        try {
            java.lang.management.OperatingSystemMXBean osBean = java.lang.management.ManagementFactory.getOperatingSystemMXBean();
            if (osBean instanceof com.sun.management.OperatingSystemMXBean) {
                com.sun.management.OperatingSystemMXBean sunOsBean = (com.sun.management.OperatingSystemMXBean) osBean;
                cpuLoad = sunOsBean.getProcessCpuLoad();
                if (cpuLoad < 0.0) {
                    cpuLoad = 0.0;
                }
            }
        } catch (Exception ignored) {
            // Fallback to 0 if not available
        }

        payload.put("cpu", cpuLoad * 100.0);
        payload.put("memory", bytesToMb(usedMemory));
        payload.put("heap", bytesToMb(runtime.totalMemory()));
        payload.put("threads", Thread.activeCount());
        payload.put("messagesPerSecond", ctx.getMessagesPerSecond());
        payload.put("totalMessages", ctx.getTotalMessages().get());
        payload.put("networkUp", ctx.getNetworkUpPerSecond());
        payload.put("networkDown", 0.0);
        long uptime = ctx.isSystemRunning() ? Math.max(0, (System.currentTimeMillis() - ctx.getSystemStartedAt()) / 1000) : 0;
        payload.put("uptime", uptime);
        payload.put("activeConnections", ctx.getServer().getConnections().size());
        payload.put("errorCount", ctx.getTotalErrors().get());
        return payload;
    }

    private int bytesToMb(long bytes) {
        return (int) Math.max(1L, bytes / (1024 * 1024));
    }
}
