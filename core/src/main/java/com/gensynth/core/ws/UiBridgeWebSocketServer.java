package com.gensynth.core.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.connectors.spi.ConnectorPlugin;
import com.gensynth.core.connectors.spi.ConnectorPluginDescriptor;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Lightweight WebSocket bridge between simulator-ui and core runtime.
 */
public class UiBridgeWebSocketServer extends WebSocketServer {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Object stateLock = new Object();

    private final ConnectorCatalogService connectorCatalogService;

    private final Map<String, GroupRuntime> groupsById = new LinkedHashMap<>();
    private final Map<String, ConnectorPlugin> connectorByFlowId = new ConcurrentHashMap<>();
    private final Map<String, ScheduledFuture<?>> publisherTasksByFlowId = new ConcurrentHashMap<>();
    private final Set<WebSocket> metricSubscribers = ConcurrentHashMap.newKeySet();

    private final ScheduledExecutorService scheduler;

    private final AtomicLong totalMessages = new AtomicLong(0);
    private final AtomicLong totalErrors = new AtomicLong(0);
    private final AtomicLong messagesLastWindow = new AtomicLong(0);
    private volatile double messagesPerSecond = 0.0;

    private volatile boolean systemRunning = false;
    private final long startedAtMillis = System.currentTimeMillis();

    public UiBridgeWebSocketServer(String host, int port) {
        this(new InetSocketAddress(host, port), new ConnectorCatalogService());
    }

    UiBridgeWebSocketServer(InetSocketAddress address, ConnectorCatalogService connectorCatalogService) {
        super(address);
        this.connectorCatalogService = connectorCatalogService;
        this.scheduler = Executors.newScheduledThreadPool(2);
        initializeDefaultRuntime();
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        sendLog(conn, "info", "WS", "Client connected");
        sendSystemStatus(conn, null);
        sendGroupsUpdate(conn);
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        metricSubscribers.remove(conn);
    }

    @Override
    public void onMessage(WebSocket conn, String message) {
        handleCommand(conn, message);
    }

    @Override
    public void onError(WebSocket conn, Exception ex) {
        totalErrors.incrementAndGet();
        if (conn != null) {
            sendError(conn, null, "WebSocket error: " + ex.getMessage());
        }
    }

    @Override
    public void onStart() {
        scheduler.scheduleAtFixedRate(this::emitMetricsTick, 1, 1, TimeUnit.SECONDS);
        scheduler.scheduleAtFixedRate(this::emitGroupsHeartbeat, 1, 2, TimeUnit.SECONDS);
        setConnectionLostTimeout(30);
    }

    public void shutdown() {
        synchronized (stateLock) {
            for (GroupRuntime group : groupsById.values()) {
                stopGroupInternal(group);
            }
            systemRunning = false;
        }

        scheduler.shutdownNow();
        try {
            stop(1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void initializeDefaultRuntime() {
        GroupRuntime rabbitGroup = new GroupRuntime(
            "g-rabbit",
            "RabbitMQ Local",
            "stopped",
            "Flujo base para validacion E2E con RabbitMQ local",
            1,
            "parallel"
        );

        rabbitGroup.flows.add(new FlowRuntime(
            "f-rabbit",
            "RabbitMQ Publisher",
            "rabbitmq",
            "disconnected",
            0,
            0,
            false,
            null,
            1000,
            1,
            "gensynth.data",
            "localhost",
            5672,
            "{\"eventId\":\"{{uuid}}\",\"timestamp\":\"{{ts}}\",\"source\":\"gen-synth\",\"value\":{{n}}}"
        ));

        groupsById.put(rabbitGroup.id, rabbitGroup);
    }

    private void handleCommand(WebSocket conn, String rawMessage) {
        String commandId = null;
        try {
            JsonNode root = objectMapper.readTree(rawMessage);
            String type = root.path("type").asText("");
            commandId = root.path("id").asText(null);
            JsonNode payload = root.path("payload");

            if (type.isBlank() || commandId == null || commandId.isBlank()) {
                sendError(conn, commandId, "Invalid command envelope");
                return;
            }

            switch (type) {
                case "GET_INITIAL_STATE" -> {
                    sendSystemStatus(conn, commandId);
                    sendGroupsUpdate(conn);
                }
                case "SUBSCRIBE_METRICS" -> {
                    metricSubscribers.add(conn);
                    sendAck(conn, commandId, "subscribed");
                    sendMetrics(conn, commandId);
                }
                case "UNSUBSCRIBE_METRICS" -> {
                    metricSubscribers.remove(conn);
                    sendAck(conn, commandId, "unsubscribed");
                }
                case "GET_CONNECTOR_CATALOG" -> {
                    Map<String, Object> response = new LinkedHashMap<>();
                    response.put("commandId", commandId);
                    response.put("catalog", connectorCatalogService.listAvailableConnectors());
                    sendMessage(conn, "CONNECTION_STATUS", response);
                }
                case "GET_LATEST_CONNECTOR" -> {
                    String pluginId = payload.path("pluginId").asText("");
                    Map<String, Object> response = new LinkedHashMap<>();
                    response.put("commandId", commandId);
                    response.put("connector", connectorCatalogService.findLatestConnector(pluginId).orElse(null));
                    sendMessage(conn, "CONNECTION_STATUS", response);
                }
                case "START_SYSTEM" -> {
                    synchronized (stateLock) {
                        systemRunning = true;
                    }
                    sendAck(conn, commandId, "system_started");
                    broadcastSystemStatus();
                    sendLog(conn, "info", "SYSTEM", "System started");
                }
                case "STOP_SYSTEM" -> {
                    synchronized (stateLock) {
                        for (GroupRuntime group : groupsById.values()) {
                            stopGroupInternal(group);
                        }
                        systemRunning = false;
                    }
                    sendAck(conn, commandId, "system_stopped");
                    broadcastGroupsUpdate();
                    broadcastSystemStatus();
                    sendLog(conn, "info", "SYSTEM", "System stopped");
                }
                case "START_GROUP" -> {
                    String groupId = payload.path("groupId").asText("");
                    GroupRuntime group = groupsById.get(groupId);
                    if (group == null) {
                        sendError(conn, commandId, "Group not found: " + groupId);
                        return;
                    }

                    synchronized (stateLock) {
                        startGroupInternal(group);
                        systemRunning = true;
                    }

                    sendAck(conn, commandId, "group_started");
                    broadcastGroupsUpdate();
                    broadcastSystemStatus();
                    sendLog(conn, "info", group.id, "Group started");
                }
                case "STOP_GROUP" -> {
                    String groupId = payload.path("groupId").asText("");
                    GroupRuntime group = groupsById.get(groupId);
                    if (group == null) {
                        sendError(conn, commandId, "Group not found: " + groupId);
                        return;
                    }

                    synchronized (stateLock) {
                        stopGroupInternal(group);
                        systemRunning = hasAnyRunningGroup();
                    }

                    sendAck(conn, commandId, "group_stopped");
                    broadcastGroupsUpdate();
                    broadcastSystemStatus();
                    sendLog(conn, "info", group.id, "Group stopped");
                }
                default -> {
                    sendAck(conn, commandId, "ignored_unsupported_" + type.toLowerCase());
                    sendLog(conn, "warn", "WS", "Unsupported command received: " + type);
                }
            }
        } catch (Exception ex) {
            totalErrors.incrementAndGet();
            sendError(conn, commandId, "Failed to process command: " + ex.getMessage());
        }
    }

    private void startGroupInternal(GroupRuntime group) {
        if ("running".equals(group.status)) {
            return;
        }

        for (FlowRuntime flow : group.flows) {
            stopPublisherTask(flow.id);

            try {
                ConnectorPluginDescriptor descriptor = connectorCatalogService
                    .findLatestConnector(flow.technology)
                    .orElseThrow(() -> new IllegalStateException("No connector found for " + flow.technology));

                Map<String, Object> connectorConfig = buildFlowConnectorConfig(flow);
                ConnectorPlugin plugin = connectorCatalogService.createAndInitialize(
                    descriptor.getPluginId(),
                    descriptor.getPluginVersion(),
                    connectorConfig
                );

                plugin.start();
                connectorByFlowId.put(flow.id, plugin);

                flow.connectionStatus = "connected";
                flow.hasError = false;
                flow.errorMessage = null;

                ScheduledFuture<?> task = scheduler.scheduleAtFixedRate(
                    () -> publishBurst(flow),
                    0,
                    Math.max(50L, flow.interval),
                    TimeUnit.MILLISECONDS
                );
                publisherTasksByFlowId.put(flow.id, task);
            } catch (Exception ex) {
                flow.connectionStatus = "error";
                flow.hasError = true;
                flow.errorMessage = ex.getMessage();
                totalErrors.incrementAndGet();
            }
        }

        group.status = "running";
    }

    private void stopGroupInternal(GroupRuntime group) {
        for (FlowRuntime flow : group.flows) {
            stopPublisherTask(flow.id);

            ConnectorPlugin connector = connectorByFlowId.remove(flow.id);
            if (connector != null) {
                try {
                    connector.stop();
                } catch (Exception ignored) {
                    totalErrors.incrementAndGet();
                }
            }

            flow.connectionStatus = "disconnected";
            flow.throughput = 0;
            flow.hasError = false;
            flow.errorMessage = null;
        }

        group.status = "stopped";
    }

    private void publishBurst(FlowRuntime flow) {
        ConnectorPlugin connector = connectorByFlowId.get(flow.id);
        if (connector == null) {
            return;
        }

        long startedAt = System.nanoTime();
        int sent = 0;

        try {
            for (int i = 0; i < Math.max(1, flow.burst); i++) {
                String payload = buildPayload(flow, i);
                connector.publish(flow.topic, payload.getBytes(StandardCharsets.UTF_8), Map.of("content-type", "application/json"));
                sent++;
            }

            long elapsedNanos = System.nanoTime() - startedAt;
            flow.latency = (int) Math.max(1L, TimeUnit.NANOSECONDS.toMillis(elapsedNanos));
            flow.throughput = Math.max(1, (int) Math.round((sent * 1000.0) / Math.max(1, flow.interval)));
            flow.connectionStatus = "connected";
            flow.hasError = false;
            flow.errorMessage = null;

            totalMessages.addAndGet(sent);
            messagesLastWindow.addAndGet(sent);

            broadcastFlowUpdate(flow);
        } catch (Exception ex) {
            flow.connectionStatus = "error";
            flow.hasError = true;
            flow.errorMessage = ex.getMessage();
            totalErrors.incrementAndGet();
            sendLogToAll("error", flow.id, "Publish failed: " + ex.getMessage());
            broadcastFlowUpdate(flow);
        }
    }

    private String buildPayload(FlowRuntime flow, int indexInBurst) {
        long sequence = totalMessages.get() + indexInBurst + 1;
        return flow.template
            .replace("{{uuid}}", UUID.randomUUID().toString())
            .replace("{{ts}}", Instant.now().toString())
            .replace("{{n}}", String.valueOf(sequence));
    }

    private Map<String, Object> buildFlowConnectorConfig(FlowRuntime flow) {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("host", flow.host);
        config.put("port", flow.port);
        config.put("username", "guest");
        config.put("password", "guest");
        config.put("virtualHost", "/");
        config.put("exchange", "gensynth.exchange");
        config.put("exchangeType", "topic");
        config.put("exchangeDurable", true);
        config.put("routingKey", flow.topic);
        return config;
    }

    private boolean hasAnyRunningGroup() {
        for (GroupRuntime group : groupsById.values()) {
            if ("running".equals(group.status)) {
                return true;
            }
        }
        return false;
    }

    private void stopPublisherTask(String flowId) {
        ScheduledFuture<?> current = publisherTasksByFlowId.remove(flowId);
        if (current != null) {
            current.cancel(false);
        }
    }

    private void emitMetricsTick() {
        try {
            messagesPerSecond = messagesLastWindow.getAndSet(0);
            if (metricSubscribers.isEmpty()) {
                return;
            }

            for (WebSocket subscriber : metricSubscribers) {
                if (subscriber != null && subscriber.isOpen()) {
                    sendMetrics(subscriber, null);
                }
            }
        } catch (Exception ex) {
            totalErrors.incrementAndGet();
        }
    }

    private void emitGroupsHeartbeat() {
        if (getConnections().isEmpty()) {
            return;
        }
        broadcastGroupsUpdate();
    }

    private void sendMetrics(WebSocket conn, String commandId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        if (commandId != null) {
            payload.put("commandId", commandId);
        }

        Runtime runtime = Runtime.getRuntime();
        long usedMemory = runtime.totalMemory() - runtime.freeMemory();

        payload.put("cpu", 0);
        payload.put("memory", bytesToMb(usedMemory));
        payload.put("heap", bytesToMb(runtime.totalMemory()));
        payload.put("threads", Thread.activeCount());
        payload.put("messagesPerSecond", messagesPerSecond);
        payload.put("totalMessages", totalMessages.get());
        payload.put("activeConnections", getConnections().size());
        payload.put("errorCount", totalErrors.get());

        sendMessage(conn, "METRICS_UPDATE", payload);
    }

    private static long bytesToMb(long bytes) {
        return Math.max(1, bytes / (1024 * 1024));
    }

    private void sendSystemStatus(WebSocket conn, String commandId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        if (commandId != null) {
            payload.put("commandId", commandId);
        }
        payload.put("status", systemRunning ? "running" : "stopped");
        payload.put("uptime", Math.max(0, (System.currentTimeMillis() - startedAtMillis) / 1000));
        payload.put("totalMessages", totalMessages.get());
        payload.put("messagesPerSecond", messagesPerSecond);

        sendMessage(conn, "SYSTEM_STATUS", payload);
    }

    private void sendGroupsUpdate(WebSocket conn) {
        sendMessage(conn, "GROUPS_UPDATE", toGroupsPayload());
    }

    private void broadcastGroupsUpdate() {
        List<Map<String, Object>> payload = toGroupsPayload();
        broadcastMessage("GROUPS_UPDATE", payload);
    }

    private void broadcastFlowUpdate(FlowRuntime flow) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("flowId", flow.id);
        payload.put("throughput", flow.throughput);
        payload.put("latency", flow.latency);
        payload.put("errorRate", flow.hasError ? 1.0 : 0.0);
        payload.put("connectionStatus", flow.connectionStatus);
        if (flow.errorMessage != null) {
            payload.put("lastError", flow.errorMessage);
        }

        broadcastMessage("FLOW_UPDATE", payload);
    }

    private List<Map<String, Object>> toGroupsPayload() {
        synchronized (stateLock) {
            List<Map<String, Object>> groupsPayload = new ArrayList<>();
            for (GroupRuntime group : groupsById.values()) {
                groupsPayload.add(group.toPayload());
            }
            return groupsPayload;
        }
    }

    private void broadcastSystemStatus() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("status", systemRunning ? "running" : "stopped");
        payload.put("uptime", Math.max(0, (System.currentTimeMillis() - startedAtMillis) / 1000));
        payload.put("totalMessages", totalMessages.get());
        payload.put("messagesPerSecond", messagesPerSecond);
        broadcastMessage("SYSTEM_STATUS", payload);
    }

    private void sendAck(WebSocket conn, String commandId, String result) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("commandId", commandId);
        payload.put("result", result);
        sendMessage(conn, "CONNECTION_STATUS", payload);
    }

    private void sendError(WebSocket conn, String commandId, String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        if (commandId != null) {
            payload.put("commandId", commandId);
        }
        payload.put("message", message);
        sendMessage(conn, "ERROR", payload);
    }

    private void sendLog(WebSocket conn, String level, String source, String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", UUID.randomUUID().toString());
        payload.put("timestamp", Instant.now().toString());
        payload.put("level", level);
        payload.put("source", source);
        payload.put("message", message);
        sendMessage(conn, "LOG_ENTRY", payload);
    }

    private void sendLogToAll(String level, String source, String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", UUID.randomUUID().toString());
        payload.put("timestamp", Instant.now().toString());
        payload.put("level", level);
        payload.put("source", source);
        payload.put("message", message);
        broadcastMessage("LOG_ENTRY", payload);
    }

    private void broadcastMessage(String type, Object payload) {
        for (WebSocket connection : getConnections()) {
            if (connection != null && connection.isOpen()) {
                sendMessage(connection, type, payload);
            }
        }
    }

    private void sendMessage(WebSocket conn, String type, Object payload) {
        if (conn == null || !conn.isOpen()) {
            return;
        }

        try {
            Map<String, Object> envelope = new LinkedHashMap<>();
            envelope.put("type", type);
            envelope.put("timestamp", System.currentTimeMillis());
            envelope.put("payload", payload);
            conn.send(objectMapper.writeValueAsString(envelope));
        } catch (Exception ex) {
            totalErrors.incrementAndGet();
        }
    }

    private static final class GroupRuntime {
        private final String id;
        private final String name;
        private String status;
        private final String description;
        private final int threads;
        private final String outputMode;
        private final List<FlowRuntime> flows = new ArrayList<>();

        private GroupRuntime(String id, String name, String status, String description, int threads, String outputMode) {
            this.id = id;
            this.name = name;
            this.status = status;
            this.description = description;
            this.threads = threads;
            this.outputMode = outputMode;
        }

        private Map<String, Object> toPayload() {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("id", id);
            payload.put("name", name);
            payload.put("status", status);
            payload.put("throughput", flows.stream().mapToInt(flow -> flow.throughput).sum());
            payload.put("description", description);
            payload.put("threads", threads);
            payload.put("outputMode", outputMode);

            List<Map<String, Object>> flowPayload = new ArrayList<>();
            for (FlowRuntime flow : flows) {
                flowPayload.add(flow.toPayload());
            }
            payload.put("flows", flowPayload);
            return payload;
        }
    }

    private static final class FlowRuntime {
        private final String id;
        private final String name;
        private final String technology;
        private String connectionStatus;
        private int throughput;
        private int latency;
        private boolean hasError;
        private String errorMessage;
        private final int interval;
        private final int burst;
        private final String topic;
        private final String host;
        private final int port;
        private final String template;

        private FlowRuntime(
            String id,
            String name,
            String technology,
            String connectionStatus,
            int throughput,
            int latency,
            boolean hasError,
            String errorMessage,
            int interval,
            int burst,
            String topic,
            String host,
            int port,
            String template
        ) {
            this.id = id;
            this.name = name;
            this.technology = technology;
            this.connectionStatus = connectionStatus;
            this.throughput = throughput;
            this.latency = latency;
            this.hasError = hasError;
            this.errorMessage = errorMessage;
            this.interval = interval;
            this.burst = burst;
            this.topic = topic;
            this.host = host;
            this.port = port;
            this.template = template;
        }

        private Map<String, Object> toPayload() {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("id", id);
            payload.put("name", name);
            payload.put("technology", technology);
            payload.put("connectionStatus", connectionStatus);
            payload.put("throughput", throughput);
            payload.put("latency", latency);
            payload.put("hasError", hasError);
            if (errorMessage != null) {
                payload.put("errorMessage", errorMessage);
            }
            payload.put("interval", interval);
            payload.put("burst", burst);
            payload.put("topic", topic);
            payload.put("host", host);
            payload.put("port", port);
            payload.put("template", template);
            return payload;
        }
    }
}
