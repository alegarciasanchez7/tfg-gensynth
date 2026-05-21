package com.gensynth.core.ws;

import com.fasterxml.jackson.core.StreamReadConstraints;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.api.IPluginInstaller;
import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.connectors.spi.ConnectorPlugin;
import com.gensynth.core.model.Variable;
import com.gensynth.core.flow.TemplateEngine;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
import com.gensynth.core.persistence.StateRepository;
import com.gensynth.core.ws.handler.*;
import com.gensynth.core.ws.runtime.*;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import java.net.InetSocketAddress;
import java.nio.file.Path;
import java.nio.file.Paths;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

/**
 * Lightweight WebSocket bridge between simulator-ui and core runtime.
 */
public class UiBridgeWebSocketServer extends WebSocketServer {

    private static final Logger logger = LoggerFactory.getLogger(UiBridgeWebSocketServer.class);
    private static final String PROTOCOL_VERSION = "1.0.0";
    private static final Set<String> SUPPORTED_COMMANDS = Set.of(
        "START_SYSTEM",
        "STOP_SYSTEM",
        "START_GROUP",
        "STOP_GROUP",
        "CREATE_GROUP",
        "DELETE_GROUP",
        "UPDATE_GROUP_CONFIG",
        "CREATE_FLOW",
        "DELETE_FLOW",
        "UPDATE_FLOW_CONFIG",
        "CREATE_VARIABLE",
        "DELETE_VARIABLE",
        "UPDATE_VARIABLE",
        "GET_INITIAL_STATE",
        "LOAD_STATE",
        "SAVE_STATE",
        "IMPORT_STATE",
        "GET_CONNECTOR_CATALOG",
        "GET_LATEST_CONNECTOR",
        "SUBSCRIBE_METRICS",
        "UNSUBSCRIBE_METRICS",
        "VALIDATE_PLUGIN",
        "INSTALL_PLUGIN",
        "UNINSTALL_PLUGIN",
        "EXPORT_STATE",
        "PICK_DIRECTORY",
        "CLONE_GROUP",
        "CLONE_FLOW",
        "PAUSE_GROUP",
        "UI_LOG"
    );

    private final ObjectMapper objectMapper = createConfiguredMapper();
    
    public ObjectMapper getObjectMapper() {
        return objectMapper;
    }

    private static ObjectMapper createConfiguredMapper() {
        ObjectMapper mapper = new ObjectMapper();
        // Increase the string length limit to allow uploading large plugin JARs (100MB)
        mapper.getFactory().setStreamReadConstraints(
            StreamReadConstraints.builder().maxStringLength(100_000_000).build()
        );
        return mapper;
    }
    final Object stateLock = new Object();

    final ConnectorCatalogService connectorCatalogService;
    final StateRepository stateRepository;
    final IPluginInstaller pluginInstaller;

    final Map<String, GroupRuntime> groupsById = new LinkedHashMap<>();
    final Map<String, Variable> variablesById = new ConcurrentHashMap<>();
    final Map<String, ConnectorPlugin> connectorByFlowId = new ConcurrentHashMap<>();
    final Map<String, ScheduledFuture<?>> publisherTasksByFlowId = new ConcurrentHashMap<>();
    final Set<WebSocket> metricSubscribers = ConcurrentHashMap.newKeySet();

    final ScheduledExecutorService scheduler;
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    final AtomicLong totalMessages = new AtomicLong(0);
    final AtomicLong totalErrors = new AtomicLong(0);
    final AtomicLong messagesLastWindow = new AtomicLong(0);
    final AtomicLong bytesSentLastWindow = new AtomicLong(0);
    volatile double messagesPerSecond = 0.0;
    volatile double networkUpPerSecond = 0.0;

    volatile boolean systemRunning = false;
    volatile long systemStartedAt = 0;

    final TemplateEngine templateEngine = new TemplateEngine();
    String currentOutputDir = null;
    WebSocket desktopSocket = null;
    final BridgeContext bridgeContext = new BridgeContext(this);
    public final FlowCommandHandler flowCommandHandler = new FlowCommandHandler(bridgeContext);
    public final GroupCommandHandler groupCommandHandler = new GroupCommandHandler(bridgeContext, flowCommandHandler);
    public final VariableCommandHandler variableCommandHandler = new VariableCommandHandler(bridgeContext);
    public final PluginCommandHandler pluginCommandHandler = new PluginCommandHandler(bridgeContext);
    public final StateCommandHandler stateCommandHandler = new StateCommandHandler(bridgeContext);
    public final SystemCommandHandler systemCommandHandler = new SystemCommandHandler(bridgeContext);
    
    public WebSocket getDesktopSocket() {
        return desktopSocket;
    }

    public UiBridgeWebSocketServer(String host, int port) {
        this(host, port, Paths.get("plugins"));
    }

    /**
     * Constructor with external plugins directory support.
     *
     * @param host             WebSocket host
     * @param port             WebSocket port
     * @param pluginsDirectory path to the directory containing external plugin JARs
     */
    public UiBridgeWebSocketServer(String host, int port, Path pluginsDirectory) {
        this(new InetSocketAddress(host, port),
             new ConnectorCatalogService(pluginsDirectory),
             new JsonStateRepositoryImpl(),
             new PluginInstallerImpl(pluginsDirectory));
    }

    UiBridgeWebSocketServer(InetSocketAddress address, ConnectorCatalogService connectorCatalogService) {
        this(address, connectorCatalogService, new JsonStateRepositoryImpl(), new PluginInstallerImpl(Paths.get("plugins")));
    }

    UiBridgeWebSocketServer(
        InetSocketAddress address,
        ConnectorCatalogService connectorCatalogService,
        StateRepository stateRepository,
        IPluginInstaller pluginInstaller
    ) {
        super(address);
        this.connectorCatalogService = connectorCatalogService;
        this.stateRepository = stateRepository;
        this.pluginInstaller = pluginInstaller;
        if (this.pluginInstaller instanceof PluginInstallerImpl) {
            ((PluginInstallerImpl) this.pluginInstaller).setPluginManager(this.connectorCatalogService.getPluginManager());
        }
        this.scheduler = Executors.newScheduledThreadPool(Math.max(4, Runtime.getRuntime().availableProcessors() * 2));
        initializeRuntime();
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        systemCommandHandler.sendSystemStatus(conn, null);
        systemCommandHandler.sendGroupsUpdate(conn);
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
            sendError(conn, null, "INTERNAL_ERROR", "WebSocket error: " + ex.getMessage(), Map.of(
                "exception", ex.getClass().getSimpleName()
            ));
        }
    }

    @Override
    public void onStart() {
        scheduler.scheduleAtFixedRate(systemCommandHandler::emitMetricsTick, 1, 1, TimeUnit.SECONDS);
        scheduler.scheduleAtFixedRate(systemCommandHandler::emitGroupsHeartbeat, 1, 2, TimeUnit.SECONDS);
        setConnectionLostTimeout(30);
    }

    public void shutdown() {
        synchronized (stateLock) {
            for (GroupRuntime group : groupsById.values()) {
                flowCommandHandler.stopGroupInternal(group);
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

    private void initializeRuntime() {
        // Start empty as requested by user
        synchronized (stateLock) {
            groupsById.clear();
            variablesById.clear();
            connectorByFlowId.clear();
            publisherTasksByFlowId.clear();
            systemRunning = false;
        }
    }

    public void persistState() {
        stateCommandHandler.persistState();
    }

    /**
     * Entry point for desktop-mode commands (JCEF bridge).
     * This bypasses the WebSocket network layer but reuses the same business logic.
     */
    public void handleDesktopCommand(String rawMessage, org.cef.callback.CefQueryCallback callback, org.cef.browser.CefBrowser browser) {
        // Reuse or create the persistent desktop socket
        if (this.desktopSocket == null) {
            this.desktopSocket = new DesktopBridgeSocket(this, callback, objectMapper, browser);
        } else {
            // Update the callback for the current query, but keep the socket reference
            ((DesktopBridgeSocket)this.desktopSocket).setCallback(callback);
        }
        handleCommand(this.desktopSocket, rawMessage);
    }

    private void handleCommand(WebSocket conn, String rawMessage) {
        String commandId = null;
        long startTime = System.currentTimeMillis();
        try {
            JsonNode root = objectMapper.readTree(rawMessage);
            String type = root.path("type").asText("");
            
            // Normalize commandId: prefer 'commandId', fallback to 'id' (backward compatibility)
            commandId = root.has("commandId") ? root.path("commandId").asText(null) : root.path("id").asText(null);
            
            String protocolVersion = root.path("protocolVersion").asText("");
            JsonNode payload = root.path("payload");
            String clientRequestId = payload != null ? payload.path("clientRequestId").asText(null) : null;

            if (type.isBlank() || commandId == null || commandId.isBlank()) {
                sendError(conn, commandId, clientRequestId, "INVALID_ENVELOPE", "Invalid command envelope", Map.of(
                    "reason", "Missing type or id/commandId"
                ));
                return;
            }

            MDC.put("commandId", commandId);
            sendTrace(conn, commandId, "START", type, null, null);

            if (!PROTOCOL_VERSION.equals(protocolVersion)) {
                sendError(conn, commandId, clientRequestId, "PROTOCOL_VERSION_MISMATCH", "Unsupported protocol version: " + protocolVersion, Map.of(
                    "expected", PROTOCOL_VERSION,
                    "received", protocolVersion
                ));
                sendTrace(conn, commandId, "END", type, System.currentTimeMillis() - startTime, "error");
                return;
            }

            if (!SUPPORTED_COMMANDS.contains(type)) {
                sendError(conn, commandId, clientRequestId, "UNSUPPORTED_COMMAND", "Unsupported command: " + type, Map.of(
                    "command", type
                ));
                sendTrace(conn, commandId, "END", type, System.currentTimeMillis() - startTime, "error");
                return;
            }

            switch (type) {
                case "GET_INITIAL_STATE" -> stateCommandHandler.handleGetInitialState(conn, commandId);
                case "LOAD_STATE" -> stateCommandHandler.handleLoadState(conn, commandId);
                case "SAVE_STATE" -> stateCommandHandler.handleSaveState(conn, commandId);
                case "SUBSCRIBE_METRICS" -> systemCommandHandler.handleSubscribeMetrics(conn, commandId);
                case "UNSUBSCRIBE_METRICS" -> systemCommandHandler.handleUnsubscribeMetrics(conn, commandId);
                case "GET_CONNECTOR_CATALOG" -> systemCommandHandler.handleGetConnectorCatalog(conn, commandId);
                case "GET_LATEST_CONNECTOR" -> systemCommandHandler.handleGetLatestConnector(conn, payload, commandId);
                case "START_SYSTEM" -> systemCommandHandler.handleStartSystem(conn, commandId);
                case "STOP_SYSTEM" -> systemCommandHandler.handleStopSystem(conn, commandId);
                case "PAUSE_GROUP" -> groupCommandHandler.handlePauseGroup(conn, payload, commandId);
                case "CLONE_GROUP" -> groupCommandHandler.handleCloneGroup(conn, payload, commandId);
                case "CLONE_FLOW" -> flowCommandHandler.handleCloneFlow(conn, payload, commandId);
                case "START_GROUP" -> groupCommandHandler.handleStartGroup(conn, payload, commandId);
                case "STOP_GROUP" -> groupCommandHandler.handleStopGroup(conn, payload, commandId);
                case "UI_LOG" -> systemCommandHandler.handleUiLog(conn, payload, commandId);
                case "CREATE_GROUP" -> groupCommandHandler.handleCreateGroup(conn, payload, commandId);
                case "DELETE_GROUP" -> groupCommandHandler.handleDeleteGroup(conn, payload, commandId);
                case "UPDATE_GROUP_CONFIG" -> groupCommandHandler.handleUpdateGroupConfig(conn, payload, commandId);
                case "CREATE_FLOW" -> flowCommandHandler.handleCreateFlow(conn, payload, commandId);
                case "DELETE_FLOW" -> flowCommandHandler.handleDeleteFlow(conn, payload, commandId);
                case "UPDATE_FLOW_CONFIG" -> flowCommandHandler.handleUpdateFlowConfig(conn, payload, commandId);
                case "CREATE_VARIABLE" -> variableCommandHandler.handleCreateVariable(conn, payload, commandId);
                case "DELETE_VARIABLE" -> variableCommandHandler.handleDeleteVariable(conn, payload, commandId);
                case "UPDATE_VARIABLE" -> variableCommandHandler.handleUpdateVariable(conn, payload, commandId);
                case "VALIDATE_PLUGIN" -> pluginCommandHandler.handleValidatePlugin(conn, payload, commandId);
                case "INSTALL_PLUGIN" -> pluginCommandHandler.handleInstallPlugin(conn, payload, commandId);
                case "UNINSTALL_PLUGIN" -> pluginCommandHandler.handleUninstallPlugin(conn, payload, commandId);
                case "EXPORT_STATE" -> stateCommandHandler.handleExportState(conn, commandId, payload);
                case "IMPORT_STATE" -> stateCommandHandler.handleImportState(conn, commandId, payload);
                default -> sendError(conn, commandId, "UNSUPPORTED_COMMAND", "Unsupported command: " + type, Map.of(
                    "command", type
                ));
            }
            sendTrace(conn, commandId, "END", type, System.currentTimeMillis() - startTime, "ok");
        } catch (Exception ex) {
            totalErrors.incrementAndGet();
            logger.error("Failed to process command {}: {}", commandId, ex.getMessage(), ex);
            sendError(conn, commandId, "INTERNAL_ERROR", "Failed to process command: " + ex.getMessage(), Map.of(
                "exception", ex.getClass().getSimpleName()
            ));
            if (commandId != null) {
                sendTrace(conn, commandId, "END", "UNKNOWN", System.currentTimeMillis() - startTime, "error");
            }
        } finally {
            MDC.remove("commandId");
        }
    }

    public String requireTextField(WebSocket conn, String commandId, JsonNode payload, String fieldName, String code, String commandName) {
        if (payload == null || !payload.isObject()) {
            sendError(conn, commandId, code, commandName + " requires a JSON object payload", Map.of(
                "field", fieldName
            ));
            return null;
        }

        String value = payload.path(fieldName).asText("");
        if (value.isBlank()) {
            sendError(conn, commandId, code, commandName + " requires " + fieldName, Map.of(
                "field", fieldName
            ));
            return null;
        }

        return value;
    }





    // ============ Plugin Management Handlers ============



    /**
     * Replaces the current runtime state with a complete state provided by the UI.
     * This is typically used after loading a project file from the UI in desktop mode.
     *
     * @param conn The WebSocket connection
     * @param commandId The ID of the command
     * @param payload The payload containing groups and variables
     */
    public void sendVariablesUpdate() {
        List<Map<String, Object>> payload = new ArrayList<>();
        synchronized (stateLock) {
            for (Variable variable : variablesById.values()) {
                payload.add(VariableCommandHandler.normalizeVariablePayloadForUi(variable.toPayload()));
            }
        }
        broadcastMessage("VARIABLE_UPDATE", payload);
    }

    /**
     * Sends a standardized creation response to the client.
     *
     * @param conn The WebSocket connection
     * @param commandId The ID of the command being responded to
     * @param clientRequestId The client-side request ID for optimistic UI reconciliation
     * @param payload The entity payload (Group or Flow data)
     * @param resultType A string identifying the result type (e.g., "group_created")
     */
    public void sendCreatedResponse(WebSocket conn, String commandId, String clientRequestId, Map<String, Object> payload, String resultType) {
        Map<String, Object> responsePayload = new LinkedHashMap<>(payload);
        responsePayload.put("status", "ok");
        responsePayload.put("result", resultType);
        if (clientRequestId != null) {
            responsePayload.put("clientRequestId", clientRequestId);
        }
        sendMessage(conn, "CONNECTION_STATUS", commandId, responsePayload);
    }

    public void broadcastGroupsUpdate() {
        systemCommandHandler.broadcastGroupsUpdate();
    }

    private final Map<String, Long> lastFlowUpdateByFlowId = new ConcurrentHashMap<>();

    public void broadcastFlowUpdate(FlowRuntime flow) {
        long now = System.currentTimeMillis();
        Long lastUpdate = lastFlowUpdateByFlowId.get(flow.id);
        
        // Throttle updates to 2 times per second (500ms) to avoid flooding the UI
        if (lastUpdate != null && (now - lastUpdate) < 500) {
            return;
        }
        
        lastFlowUpdateByFlowId.put(flow.id, now);
        
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

    public List<Map<String, Object>> toGroupsPayload() {
        synchronized (stateLock) {
            List<Map<String, Object>> groupsPayload = new ArrayList<>();
            for (GroupRuntime group : groupsById.values()) {
                groupsPayload.add(group.toPayload());
            }
            return groupsPayload;
        }
    }

    public void broadcastSystemStatus() {
        systemCommandHandler.broadcastSystemStatus();
    }

    public void sendAck(WebSocket conn, String commandId, String result) {
        sendAck(conn, commandId, null, result);
    }

    public void sendAck(WebSocket conn, String commandId, String clientRequestId, String result) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("commandId", commandId);
        if (clientRequestId != null) {
            payload.put("clientRequestId", clientRequestId);
        }
        payload.put("status", "ok");
        payload.put("result", result);
        sendMessage(conn, "CONNECTION_STATUS", commandId, payload);
    }



    public void sendError(WebSocket conn, String commandId, String code, String message, Map<String, Object> details) {
        sendError(conn, commandId, null, code, message, details);
    }

    public void sendError(WebSocket conn, String commandId, String clientRequestId, String code, String message, Map<String, Object> details) {
        Map<String, Object> payload = new LinkedHashMap<>();
        if (commandId != null) {
            payload.put("commandId", commandId);
        }
        if (clientRequestId != null) {
            payload.put("clientRequestId", clientRequestId);
        }
        payload.put("status", "error");
        payload.put("code", code);
        payload.put("message", message);
        if (details != null && !details.isEmpty()) {
            payload.put("details", details);
        }
        sendMessage(conn, "ERROR", commandId, payload);
    }



    public void logToBackend(String level, String source, String message, String commandId) {
        if (commandId != null) {
            MDC.put("commandId", commandId);
        }
        String formattedMessage = String.format("[%s] %s", source, message);
        switch (level.toLowerCase()) {
            case "error" -> logger.error(formattedMessage);
            case "warn" -> logger.warn(formattedMessage);
            case "debug" -> logger.debug(formattedMessage);
            default -> logger.info(formattedMessage);
        }
        if (commandId != null) {
            MDC.remove("commandId");
        }
    }

    public void sendLog(WebSocket conn, String level, String source, String message) {
        sendLog(conn, level, source, message, MDC.get("commandId"));
    }

    public void sendLog(WebSocket conn, String level, String source, String message, String commandId) {
        logToBackend(level, source, message, commandId);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", UUID.randomUUID().toString());
        payload.put("timestamp", Instant.now().toString());
        payload.put("level", level);
        payload.put("source", source);
        payload.put("message", message);
        if (commandId != null) {
            payload.put("commandId", commandId);
        }
        sendMessage(conn, "LOG_ENTRY", commandId, payload);
    }

    public void sendLogToAll(String level, String source, String message) {
        sendLogToAll(level, source, message, MDC.get("commandId"));
    }

    public void sendLogToAll(String level, String source, String message, String commandId) {
        logToBackend(level, source, message, commandId);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", UUID.randomUUID().toString());
        payload.put("timestamp", Instant.now().toString());
        payload.put("level", level);
        payload.put("source", source);
        payload.put("message", message);
        if (commandId != null) {
            payload.put("commandId", commandId);
        }
        broadcastMessage("LOG_ENTRY", commandId, payload);
    }

    private void sendTrace(WebSocket conn, String commandId, String type, String operation, Long durationMs, String status) {
        String msg = String.format("[%s] %s%s", type, operation, durationMs != null ? " (" + durationMs + "ms)" : "");
        logToBackend(status != null && status.equals("error") ? "error" : "debug", "TRACE", msg, commandId);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("commandId", commandId);
        payload.put("type", type);
        payload.put("operation", operation);
        payload.put("timestamp", System.currentTimeMillis());
        if (durationMs != null) {
            payload.put("durationMs", durationMs);
        }
        if (status != null) {
            payload.put("status", status);
        }
        sendMessage(conn, "TRACE_EVENT", commandId, payload);
    }


    public void broadcastMessage(String type, Object payload) {
        broadcastMessage(type, null, payload);
    }

    public void broadcastMessage(String type, String commandId, Object payload) {
        for (WebSocket connection : getConnections()) {
            if (connection != null && connection.isOpen()) {
                sendMessage(connection, type, commandId, payload);
            }
        }
        if (desktopSocket != null) {
            sendMessage(desktopSocket, type, commandId, payload);
        }
    }

    public void sendMessage(WebSocket conn, String type, Object payload) {
        sendMessage(conn, type, null, payload);
    }

    public void sendMessage(WebSocket conn, String type, String commandId, Object payload) {
        if (conn == null || !conn.isOpen()) {
            return;
        }

        try {
            Map<String, Object> envelope = new LinkedHashMap<>();
            envelope.put("type", type);
            envelope.put("timestamp", System.currentTimeMillis());
            envelope.put("protocolVersion", PROTOCOL_VERSION);
            if (commandId != null) {
                envelope.put("commandId", commandId);
            }
            envelope.put("payload", payload);
            conn.send(objectMapper.writeValueAsString(envelope));
        } catch (Exception ex) {
            totalErrors.incrementAndGet();
            logger.error("Failed to send message: {}", ex.getMessage());
        }
    }
}
