package com.gensynth.core.ws;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.connectors.spi.ConnectorPlugin;
import com.gensynth.core.connectors.spi.ConnectorPluginDescriptor;
import com.gensynth.core.model.FlowDefinition;
import com.gensynth.core.model.GroupDefinition;
import com.gensynth.core.model.Variable;
import com.gensynth.core.flow.TemplateEngine;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
import com.gensynth.core.persistence.StateRepository;
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
        "GET_CONNECTOR_CATALOG",
        "GET_LATEST_CONNECTOR",
        "SUBSCRIBE_METRICS",
        "UNSUBSCRIBE_METRICS"
    );

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Object stateLock = new Object();

    private final ConnectorCatalogService connectorCatalogService;
    private final StateRepository stateRepository;

    private final Map<String, GroupRuntime> groupsById = new LinkedHashMap<>();
    private final Map<String, Variable> variablesById = new ConcurrentHashMap<>();
    private final Map<String, ConnectorPlugin> connectorByFlowId = new ConcurrentHashMap<>();
    private final Map<String, ScheduledFuture<?>> publisherTasksByFlowId = new ConcurrentHashMap<>();
    private final Set<WebSocket> metricSubscribers = ConcurrentHashMap.newKeySet();

    private final ScheduledExecutorService scheduler;
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final AtomicLong totalMessages = new AtomicLong(0);
    private final AtomicLong totalErrors = new AtomicLong(0);
    private final AtomicLong messagesLastWindow = new AtomicLong(0);
    private final AtomicLong bytesSentLastWindow = new AtomicLong(0);
    private volatile double messagesPerSecond = 0.0;
    private volatile double networkUpPerSecond = 0.0;

    private volatile boolean systemRunning = false;
    private volatile long systemStartedAt = 0;

    private final TemplateEngine templateEngine = new TemplateEngine();
    private String currentOutputDir = null;

    public UiBridgeWebSocketServer(String host, int port) {
        this(new InetSocketAddress(host, port), new ConnectorCatalogService(), new JsonStateRepositoryImpl());
    }

    UiBridgeWebSocketServer(InetSocketAddress address, ConnectorCatalogService connectorCatalogService) {
        this(address, connectorCatalogService, new JsonStateRepositoryImpl());
    }

    UiBridgeWebSocketServer(
        InetSocketAddress address,
        ConnectorCatalogService connectorCatalogService,
        StateRepository stateRepository
    ) {
        super(address);
        this.connectorCatalogService = connectorCatalogService;
        this.stateRepository = stateRepository;
        this.scheduler = Executors.newScheduledThreadPool(Math.max(4, Runtime.getRuntime().availableProcessors() * 2));
        initializeRuntime();
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
            sendError(conn, null, "INTERNAL_ERROR", "WebSocket error: " + ex.getMessage(), Map.of(
                "exception", ex.getClass().getSimpleName()
            ));
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
            persistState();
        }

        scheduler.shutdownNow();
        try {
            stop(1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void initializeRuntime() {
        loadRuntimeState(true);
    }

    private void createDefaultRuntime() {
        GroupRuntime rabbitGroup = new GroupRuntime(
            "g-rabbit",
            "RabbitMQ Local",
            "stopped",
            "Flujo base para validacion E2E con RabbitMQ local",
            1,
            "parallel",
            true
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
            "{\"eventId\":\"{{uuid}}\",\"timestamp\":\"{{ts}}\",\"source\":\"gen-synth\",\"value\":{{n}}}",
            "json",
            true,
            Map.of()
        ));

        groupsById.put(rabbitGroup.id, rabbitGroup);
    }

    private void persistState() {
        try {
            List<GroupDefinition> groupDefinitions = new ArrayList<>();
            for (GroupRuntime group : groupsById.values()) {
                groupDefinitions.add(group.toDefinition());
            }

            stateRepository.saveGroups(groupDefinitions);
            stateRepository.saveVariables(new ArrayList<>(variablesById.values()));
        } catch (StateRepository.StateRepositoryException e) {
            totalErrors.incrementAndGet();
        }
    }

    private void loadRuntimeState(boolean createDefaultIfEmpty) {
        synchronized (stateLock) {
            for (GroupRuntime group : groupsById.values()) {
                stopGroupInternal(group);
            }

            groupsById.clear();
            variablesById.clear();
            connectorByFlowId.clear();
            publisherTasksByFlowId.clear();

            try {
                List<GroupDefinition> persistedGroups = stateRepository.loadGroups();
                List<Variable> persistedVariables = stateRepository.loadVariables();

                if (persistedGroups.isEmpty() && createDefaultIfEmpty) {
                    createDefaultRuntime();
                    persistState();
                } else {
                    for (GroupDefinition definition : persistedGroups) {
                        groupsById.put(definition.getGroupId(), GroupRuntime.fromDefinition(definition));
                    }
                }

                for (Variable variable : persistedVariables) {
                    variablesById.put(variable.getId(), variable);
                }

                systemRunning = false;
            } catch (StateRepository.StateRepositoryException e) {
                createDefaultRuntime();
                systemRunning = false;
            }
        }
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
                case "GET_INITIAL_STATE" -> {
                    sendInitialState(conn, commandId);
                }
                case "LOAD_STATE" -> {
                    loadRuntimeState(true);
                    logToBackend("info", "SYSTEM", "State loaded from repository", commandId);
                    sendInitialState(conn, commandId);
                }
                case "SAVE_STATE" -> {
                    persistState();
                    logToBackend("info", "SYSTEM", "State saved to repository", commandId);
                    sendAck(conn, commandId, "state_saved");
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
                    response.put("status", "ok");
                    response.put("catalog", connectorCatalogService.listAvailableConnectors());
                    sendMessage(conn, "CONNECTION_STATUS", commandId, response);
                }
                case "GET_LATEST_CONNECTOR" -> {
                    String pluginId = requireTextField(conn, commandId, payload, "pluginId", "INVALID_PAYLOAD", "GET_LATEST_CONNECTOR");
                    if (pluginId == null) {
                        return;
                    }

                    Map<String, Object> response = new LinkedHashMap<>();
                    response.put("commandId", commandId);
                    response.put("status", "ok");
                    response.put("connector", connectorCatalogService.findLatestConnector(pluginId).orElse(null));
                    sendMessage(conn, "CONNECTION_STATUS", commandId, response);
                }
                case "START_SYSTEM" -> {
                    synchronized (stateLock) {
                        systemRunning = true;
                        systemStartedAt = System.currentTimeMillis();
                        String timestamp = new java.text.SimpleDateFormat("yyyy_MM_dd_HH_mm_ss").format(new java.util.Date());
                        currentOutputDir = "OUTPUT_FILES_" + timestamp;

                        for (GroupRuntime group : groupsById.values()) {
                            if (!"running".equals(group.status)) {
                                startGroupInternal(group);
                            }
                        }
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
                    String groupId = requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "START_GROUP");
                    if (groupId == null) {
                        return;
                    }

                    GroupRuntime group = groupsById.get(groupId);
                    if (group == null) {
                        sendError(conn, commandId, "NOT_FOUND", "Group not found: " + groupId, Map.of(
                            "groupId", groupId
                        ));
                        return;
                    }

                    synchronized (stateLock) {
                        if (currentOutputDir == null) {
                            String timestamp = new java.text.SimpleDateFormat("yyyy_MM_dd_HH_mm_ss").format(new java.util.Date());
                            currentOutputDir = "OUTPUT_FILES_" + timestamp;
                        }
                        if (!systemRunning) {
                            systemStartedAt = System.currentTimeMillis();
                        }
                        startGroupInternal(group);
                        systemRunning = true;
                    }

                    sendAck(conn, commandId, "group_started");
                    broadcastGroupsUpdate();
                    broadcastSystemStatus();
                    sendLog(conn, "info", group.id, "Group started");
                }
                case "STOP_GROUP" -> {
                    String groupId = requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "STOP_GROUP");
                    if (groupId == null) {
                        return;
                    }

                    GroupRuntime group = groupsById.get(groupId);
                    if (group == null) {
                        sendError(conn, commandId, "NOT_FOUND", "Group not found: " + groupId, Map.of(
                            "groupId", groupId
                        ));
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
                case "CREATE_GROUP" -> handleCreateGroup(conn, commandId, payload);
                case "DELETE_GROUP" -> handleDeleteGroup(conn, commandId, payload);
                case "UPDATE_GROUP_CONFIG" -> handleUpdateGroupConfig(conn, commandId, payload);
                case "CREATE_FLOW" -> handleCreateFlow(conn, commandId, payload);
                case "DELETE_FLOW" -> handleDeleteFlow(conn, commandId, payload);
                case "UPDATE_FLOW_CONFIG" -> handleUpdateFlowConfig(conn, commandId, payload);
                case "CREATE_VARIABLE" -> handleCreateVariable(conn, commandId, payload);
                case "DELETE_VARIABLE" -> handleDeleteVariable(conn, commandId, payload);
                case "UPDATE_VARIABLE" -> handleUpdateVariable(conn, commandId, payload);
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

    private String requireTextField(WebSocket conn, String commandId, JsonNode payload, String fieldName, String code, String commandName) {
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

    private void handleCreateGroup(WebSocket conn, String commandId, JsonNode payload) {
        String name = requireTextField(conn, commandId, payload, "name", "INVALID_PAYLOAD", "CREATE_GROUP");
        if (name == null) {
            return;
        }
        
        String clientRequestId = payload.path("clientRequestId").asText(null);

        synchronized (stateLock) {
            for (GroupRuntime group : groupsById.values()) {
                if (group.name.equalsIgnoreCase(name)) {
                    sendError(conn, commandId, clientRequestId, "INVALID_PAYLOAD", "Group name already exists", Map.of("name", name));
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

            groupsById.put(id, new GroupRuntime(id, name, "stopped", description, threads, outputMode, true));
            persistState();
        }

        sendAck(conn, commandId, clientRequestId, "group_created");
        logToBackend("info", "GROUPS", "Created group '" + name + "'", commandId);
        broadcastGroupsUpdate();
    }

    private void handleDeleteGroup(WebSocket conn, String commandId, JsonNode payload) {
        String groupId = requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "DELETE_GROUP");
        if (groupId == null) {
            return;
        }

        String groupName;
        synchronized (stateLock) {
            GroupRuntime group = groupsById.remove(groupId);
            if (group == null) {
                sendError(conn, commandId, "NOT_FOUND", "Group not found: " + groupId, Map.of("groupId", groupId));
                return;
            }
            groupName = group.name;

            stopGroupInternal(group);
            persistState();
            systemRunning = hasAnyRunningGroup();
        }

        sendAck(conn, commandId, "group_deleted");
        // We removed it from the map, but we saved the name
        logToBackend("info", "GROUPS", "Deleted group '" + groupName + "'", commandId);

        broadcastGroupsUpdate();
        broadcastSystemStatus();
    }

    private void handleUpdateGroupConfig(WebSocket conn, String commandId, JsonNode payload) {
        String groupId = requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "UPDATE_GROUP_CONFIG");
        if (groupId == null) {
            return;
        }

        synchronized (stateLock) {
            GroupRuntime group = groupsById.get(groupId);
            if (group == null) {
                sendError(conn, commandId, "NOT_FOUND", "Group not found: " + groupId, Map.of("groupId", groupId));
                return;
            }

            if (payload.hasNonNull("name")) {
                String newName = payload.path("name").asText(group.name).trim();
                if (newName.isBlank()) {
                    sendError(conn, commandId, "INVALID_PAYLOAD", "Group name cannot be empty", Map.of("groupId", groupId));
                    return;
                }

                for (GroupRuntime existing : groupsById.values()) {
                    if (!existing.id.equals(groupId) && existing.name.equalsIgnoreCase(newName)) {
                        sendError(conn, commandId, "INVALID_PAYLOAD", "Group name already exists", Map.of("name", newName));
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
                // Propagate to all flows in runtime
                for (FlowRuntime flow : group.flows) {
                    flow.enabled = enabled;
                }
            }

            persistState();
        }

        sendAck(conn, commandId, "group_updated");
        GroupRuntime group = groupsById.get(groupId); // It exists, otherwise would have returned early
        logToBackend("info", "GROUPS", "Updated config for group '" + (group != null ? group.name : groupId) + "'", commandId);
        broadcastGroupsUpdate();
    }

    private void handleCreateFlow(WebSocket conn, String commandId, JsonNode payload) {
        String groupId = requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "CREATE_FLOW");
        String name = requireTextField(conn, commandId, payload, "name", "INVALID_PAYLOAD", "CREATE_FLOW");
        String technology = requireTextField(conn, commandId, payload, "technology", "INVALID_PAYLOAD", "CREATE_FLOW");
        String host = requireTextField(conn, commandId, payload, "host", "INVALID_PAYLOAD", "CREATE_FLOW");
        if (groupId == null || name == null || technology == null || host == null) {
            return;
        }
        
        String clientRequestId = payload.path("clientRequestId").asText(null);

        if (connectorCatalogService.findLatestConnector(technology).isEmpty()) {
            sendError(conn, commandId, clientRequestId, "INVALID_PAYLOAD", "Connector not found for technology: " + technology, Map.of("technology", technology));
            return;
        }

        synchronized (stateLock) {
            GroupRuntime group = groupsById.get(groupId);
            if (group == null) {
                sendError(conn, commandId, clientRequestId, "NOT_FOUND", "Group not found: " + groupId, Map.of("groupId", groupId));
                return;
            }

            String flowId = payload.path("flowId").asText("");
            if (flowId.isBlank()) {
                flowId = UUID.randomUUID().toString();
            }

            if (findFlowById(group, flowId) != null) {
                sendError(conn, commandId, clientRequestId, "INVALID_PAYLOAD", "Flow already exists: " + flowId, Map.of("flowId", flowId));
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

            persistState();
        }

        sendAck(conn, commandId, clientRequestId, "flow_created");
        logToBackend("info", "FLOWS", "Created flow '" + name + "'", commandId);
        broadcastGroupsUpdate();
    }

    private void handleDeleteFlow(WebSocket conn, String commandId, JsonNode payload) {
        String groupId = requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "DELETE_FLOW");
        String flowId = requireTextField(conn, commandId, payload, "flowId", "INVALID_PAYLOAD", "DELETE_FLOW");
        if (groupId == null || flowId == null) {
            return;
        }

        synchronized (stateLock) {
            GroupRuntime group = groupsById.get(groupId);
            if (group == null) {
                sendError(conn, commandId, "NOT_FOUND", "Group not found: " + groupId, Map.of("groupId", groupId));
                return;
            }

            FlowRuntime flow = findFlowById(group, flowId);
            if (flow == null) {
                sendError(conn, commandId, "NOT_FOUND", "Flow not found: " + flowId, Map.of("flowId", flowId));
                return;
            }

            stopPublisherTask(flowId);
            ConnectorPlugin connector = connectorByFlowId.remove(flowId);
            if (connector != null) {
                try {
                    connector.stop();
                } catch (Exception ignored) {
                    totalErrors.incrementAndGet();
                }
            }

            logToBackend("info", "FLOWS", "Deleted flow '" + flow.name + "'", commandId);
            group.flows.remove(flow);
            persistState();
        }

        sendAck(conn, commandId, "flow_deleted");
        broadcastGroupsUpdate();
    }

    private void handleUpdateFlowConfig(WebSocket conn, String commandId, JsonNode payload) {
        String groupId = requireTextField(conn, commandId, payload, "groupId", "INVALID_PAYLOAD", "UPDATE_FLOW_CONFIG");
        String flowId = requireTextField(conn, commandId, payload, "flowId", "INVALID_PAYLOAD", "UPDATE_FLOW_CONFIG");
        if (groupId == null || flowId == null) {
            return;
        }

        String updatedFlowName;
        synchronized (stateLock) {
            GroupRuntime group = groupsById.get(groupId);
            if (group == null) {
                sendError(conn, commandId, "NOT_FOUND", "Group not found: " + groupId, Map.of("groupId", groupId));
                return;
            }

            FlowRuntime flow = findFlowById(group, flowId);
            if (flow == null) {
                sendError(conn, commandId, "NOT_FOUND", "Flow not found: " + flowId, Map.of("flowId", flowId));
                return;
            }

            boolean wasRunning = "connected".equals(flow.connectionStatus);
            if (payload.hasNonNull("name")) {
                flow.name = payload.path("name").asText(flow.name);
            }
            if (payload.hasNonNull("technology")) {
                String technology = payload.path("technology").asText(flow.technology);
                if (connectorCatalogService.findLatestConnector(technology).isEmpty()) {
                    sendError(conn, commandId, "INVALID_PAYLOAD", "Connector not found for technology: " + technology, Map.of("technology", technology));
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

            persistState();
            updatedFlowName = flow.name;
        }

        sendAck(conn, commandId, "flow_updated");
        logToBackend("info", "FLOWS", "Updated config for flow '" + updatedFlowName + "'", commandId);
        broadcastGroupsUpdate();
    }

    private void handleCreateVariable(WebSocket conn, String commandId, JsonNode payload) {
        String name = requireTextField(conn, commandId, payload, "name", "INVALID_PAYLOAD", "CREATE_VARIABLE");
        String type = requireTextField(conn, commandId, payload, "type", "INVALID_PAYLOAD", "CREATE_VARIABLE");
        String scope = requireTextField(conn, commandId, payload, "scope", "INVALID_PAYLOAD", "CREATE_VARIABLE");
        if (name == null || type == null || scope == null) {
            return;
        }
        
        String clientRequestId = payload.path("clientRequestId").asText(null);

        String coreType = normalizeVariableTypeForCore(type);
        Object defaultValue = payload.has("config") ? payload.get("config").toString() : "";
        Map<String, Object> config = Map.of();
        Variable createdVariable;

        
        synchronized (stateLock) {
            String variableId = payload.path("variableId").asText("");
            if (variableId.isBlank()) {
                variableId = UUID.randomUUID().toString();
            }
            try {
                createdVariable = new Variable(variableId, name, scope.toUpperCase(), coreType, defaultValue, config);
                variablesById.put(variableId, createdVariable);
                persistState();
            } catch (IllegalArgumentException ex) {
                sendError(conn, commandId, clientRequestId, "INVALID_PAYLOAD", ex.getMessage(), Map.of("name", name, "type", type, "scope", scope));
                return;
            }
        }

        Map<String, Object> response = new LinkedHashMap<>(createdVariable.toPayload());
        response.put("commandId", commandId);
        if (clientRequestId != null) {
            response.put("clientRequestId", clientRequestId);
        }
        response.put("status", "ok");
        response.put("result", "variable_created");
        response.put("type", type);
        response.put("scope", scope.toLowerCase());
        sendMessage(conn, "CONNECTION_STATUS", commandId, response);
        logToBackend("info", "VARIABLES", "Created variable '" + name + "'", commandId);
        sendVariablesUpdate();
    }

    private void handleDeleteVariable(WebSocket conn, String commandId, JsonNode payload) {
        String variableId = requireTextField(conn, commandId, payload, "variableId", "INVALID_PAYLOAD", "DELETE_VARIABLE");
        if (variableId == null) {
            return;
        }
        
        String clientRequestId = payload.path("clientRequestId").asText(null);

        synchronized (stateLock) {
            Variable removed = variablesById.remove(variableId);
            if (removed == null) {
                sendError(conn, commandId, clientRequestId, "NOT_FOUND", "Variable not found: " + variableId, Map.of("variableId", variableId));
                return;
            }
            logToBackend("info", "VARIABLES", "Deleted variable '" + removed.getName() + "'", commandId);
            persistState();
        }

        sendAck(conn, commandId, clientRequestId, "variable_deleted");
        sendVariablesUpdate();
    }

    private void handleUpdateVariable(WebSocket conn, String commandId, JsonNode payload) {
        String variableId = requireTextField(conn, commandId, payload, "variableId", "INVALID_PAYLOAD", "UPDATE_VARIABLE");
        if (variableId == null) {
            return;
        }

        String updatedVariableName;
        synchronized (stateLock) {
            Variable existing = variablesById.get(variableId);
            if (existing == null) {
                sendError(conn, commandId, "NOT_FOUND", "Variable not found: " + variableId, Map.of("variableId", variableId));
                return;
            }

            String name = payload.path("name").asText(existing.getName());
            updatedVariableName = name;
            String type = normalizeVariableTypeForCore(payload.path("type").asText(existing.getType()));
            String scope = payload.path("scope").asText(existing.getScope()).toUpperCase();
            Object defaultValue = payload.has("config") ? payload.get("config").toString() : existing.getDefaultValue();

            try {
                Variable updated = new Variable(variableId, name, scope, type, defaultValue, existing.getConfig());
                variablesById.put(variableId, updated);
                persistState();
            } catch (IllegalArgumentException ex) {
                sendError(conn, commandId, "INVALID_PAYLOAD", ex.getMessage(), Map.of("variableId", variableId));
                return;
            }
        }

        sendAck(conn, commandId, "variable_updated");
        logToBackend("info", "VARIABLES", "Updated variable '" + updatedVariableName + "'", commandId);
        sendVariablesUpdate();
    }

    private FlowRuntime findFlowById(GroupRuntime group, String flowId) {
        for (FlowRuntime flow : group.flows) {
            if (flow.id.equals(flowId)) {
                return flow;
            }
        }
        return null;
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

                Map<String, Object> connectorConfig = buildFlowConnectorConfig(group, flow);
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
                    () -> publishBurst(group, flow),
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

    private void publishBurst(GroupRuntime group, FlowRuntime flow) {
        ConnectorPlugin connector = connectorByFlowId.get(flow.id);
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

            totalMessages.addAndGet(sent);
            messagesLastWindow.addAndGet(sent);
            
            int burstBytes = 0;
            if (lastPayload != null) {
                // Approximate burst bytes using the last payload size multiplied by 'sent'
                // For exact accuracy, we should sum sizes inside the loop.
                burstBytes = lastPayload.getBytes(StandardCharsets.UTF_8).length * sent;
            }
            bytesSentLastWindow.addAndGet(burstBytes);

            if (lastPayload != null) {
                String preview = lastPayload.length() > 250 ? lastPayload.substring(0, 250) + "..." : lastPayload;
                sendLogToAll("data", flow.id, "[" + group.name + " - " + flow.name + "] ==> " + preview);
            }

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
        return templateEngine.evaluate(flow.template, sequence, variablesById);
    }

    private Map<String, Object> buildFlowConnectorConfig(GroupRuntime group, FlowRuntime flow) {
        Map<String, Object> config = new LinkedHashMap<>();
        if (flow.connectorConfig != null && !flow.connectorConfig.isEmpty()) {
            config.putAll(flow.connectorConfig);
        }

        if ("file".equalsIgnoreCase(flow.technology)) {
            config.putIfAbsent("outputDir", currentOutputDir == null ? "OUTPUT_FILES" : currentOutputDir);
            config.putIfAbsent("groupName", group.name);
            // Default to json if not set
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

    private Map<String, Object> parseConnectorConfig(JsonNode connectorConfigNode) {
        if (connectorConfigNode == null || connectorConfigNode.isMissingNode() || connectorConfigNode.isNull() || !connectorConfigNode.isObject()) {
            return Map.of();
        }
        return objectMapper.convertValue(connectorConfigNode, MAP_TYPE);
    }

    private String sanitizeFileName(String value) {
        if (value == null || value.isBlank()) {
            return "flow";
        }
        return value.replaceAll("[^a-zA-Z0-9._-]", "_");
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
            networkUpPerSecond = bytesSentLastWindow.getAndSet(0);
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
        Map<String, Object> payload = buildMetricsPayload(commandId);
        sendMessage(conn, "METRICS_UPDATE", commandId, payload);
    }

    private static long bytesToMb(long bytes) {
        return Math.max(1, bytes / (1024 * 1024));
    }

    private void sendSystemStatus(WebSocket conn, String commandId) {
        sendMessage(conn, "SYSTEM_STATUS", commandId, buildSystemStatusPayload(commandId));
    }

    private Map<String, Object> buildSystemStatusPayload(String commandId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        if (commandId != null) {
            payload.put("commandId", commandId);
        }
        payload.put("status", systemRunning ? "running" : "stopped");
        long uptime = systemRunning ? Math.max(0, (System.currentTimeMillis() - systemStartedAt) / 1000) : 0;
        payload.put("uptime", uptime);
        payload.put("totalMessages", totalMessages.get());
        payload.put("messagesPerSecond", messagesPerSecond);
        return payload;
    }

    private Map<String, Object> buildMetricsPayload(String commandId) {
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
        payload.put("messagesPerSecond", messagesPerSecond);
        payload.put("totalMessages", totalMessages.get());
        payload.put("networkUp", networkUpPerSecond);
        payload.put("networkDown", 0.0);
        long uptime = systemRunning ? Math.max(0, (System.currentTimeMillis() - systemStartedAt) / 1000) : 0;
        payload.put("uptime", uptime);
        payload.put("activeConnections", getConnections().size());
        payload.put("errorCount", totalErrors.get());
        return payload;
    }

    private Map<String, Object> buildInitialStatePayload(String commandId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        if (commandId != null) {
            payload.put("commandId", commandId);
        }

        payload.put("systemStatus", buildSystemStatusPayload(null));
        payload.put("groups", toGroupsPayload());

        List<Map<String, Object>> variablesPayload = new ArrayList<>();
        synchronized (stateLock) {
            for (Variable variable : variablesById.values()) {
                variablesPayload.add(normalizeVariablePayloadForUi(variable.toPayload()));
            }
        }
        payload.put("variables", variablesPayload);
        payload.put("metrics", buildMetricsPayload(null));
        payload.put("connectorCatalog", connectorCatalogService.listAvailableConnectors());
        return payload;
    }

    private void sendInitialState(WebSocket conn, String commandId) {
        sendMessage(conn, "INITIAL_STATE", commandId, buildInitialStatePayload(commandId));
    }

    private void sendGroupsUpdate(WebSocket conn) {
        sendMessage(conn, "GROUPS_UPDATE", toGroupsPayload());
    }

    private void sendVariablesUpdate() {
        List<Map<String, Object>> payload = new ArrayList<>();
        synchronized (stateLock) {
            for (Variable variable : variablesById.values()) {
                payload.add(normalizeVariablePayloadForUi(variable.toPayload()));
            }
        }
        broadcastMessage("VARIABLE_UPDATE", payload);
    }

    private void broadcastGroupsUpdate() {
        List<Map<String, Object>> payload = toGroupsPayload();
        broadcastMessage("GROUPS_UPDATE", payload);
    }

    private final Map<String, Long> lastFlowUpdateByFlowId = new ConcurrentHashMap<>();

    private void broadcastFlowUpdate(FlowRuntime flow) {
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
        long uptime = systemRunning ? Math.max(0, (System.currentTimeMillis() - systemStartedAt) / 1000) : 0;
        payload.put("uptime", uptime);
        payload.put("totalMessages", totalMessages.get());
        payload.put("messagesPerSecond", messagesPerSecond);
        broadcastMessage("SYSTEM_STATUS", payload);
    }

    private void sendAck(WebSocket conn, String commandId, String result) {
        sendAck(conn, commandId, null, result);
    }

    private void sendAck(WebSocket conn, String commandId, String clientRequestId, String result) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("commandId", commandId);
        if (clientRequestId != null) {
            payload.put("clientRequestId", clientRequestId);
        }
        payload.put("status", "ok");
        payload.put("result", result);
        sendMessage(conn, "CONNECTION_STATUS", commandId, payload);
    }

    private void sendError(WebSocket conn, String commandId, String code, String message, Map<String, Object> details) {
        sendError(conn, commandId, null, code, message, details);
    }

    private void sendError(WebSocket conn, String commandId, String clientRequestId, String code, String message, Map<String, Object> details) {
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

    private String normalizeVariableTypeForCore(String type) {
        return "temporal".equalsIgnoreCase(type) ? "date" : type;
    }

    private Map<String, Object> normalizeVariablePayloadForUi(Map<String, Object> payload) {
        Map<String, Object> normalized = new LinkedHashMap<>(payload);
        Object type = normalized.get("type");
        if (type instanceof String && "date".equalsIgnoreCase((String) type)) {
            normalized.put("type", "temporal");
        }
        Object scope = normalized.get("scope");
        if (scope instanceof String) {
            normalized.put("scope", ((String) scope).toLowerCase());
        }
        return normalized;
    }

    private void logToBackend(String level, String source, String message, String commandId) {
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

    private void sendLog(WebSocket conn, String level, String source, String message) {
        sendLog(conn, level, source, message, MDC.get("commandId"));
    }

    private void sendLog(WebSocket conn, String level, String source, String message, String commandId) {
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

    private void sendLogToAll(String level, String source, String message) {
        sendLogToAll(level, source, message, MDC.get("commandId"));
    }

    private void sendLogToAll(String level, String source, String message, String commandId) {
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


    private void broadcastMessage(String type, Object payload) {
        broadcastMessage(type, null, payload);
    }

    private void broadcastMessage(String type, String commandId, Object payload) {
        for (WebSocket connection : getConnections()) {
            if (connection != null && connection.isOpen()) {
                sendMessage(connection, type, commandId, payload);
            }
        }
    }

    private void sendMessage(WebSocket conn, String type, Object payload) {
        sendMessage(conn, type, null, payload);
    }

    private void sendMessage(WebSocket conn, String type, String commandId, Object payload) {
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

    private static final class GroupRuntime {
        private final String id;
        private String name;
        private String status;
        private String description;
        private int threads;
        private String outputMode;
        private boolean enabled;
        private final List<FlowRuntime> flows = new ArrayList<>();

        private GroupRuntime(String id, String name, String status, String description, int threads, String outputMode, boolean enabled) {
            this.id = id;
            this.name = name;
            this.status = status;
            this.description = description;
            this.threads = threads;
            this.outputMode = outputMode;
            this.enabled = enabled;
        }

        private static GroupRuntime fromDefinition(GroupDefinition definition) {
            GroupRuntime runtime = new GroupRuntime(
                definition.getGroupId(),
                definition.getName(),
                "stopped",
                definition.getDescription(),
                definition.getThreads(),
                definition.getOutputMode(),
                definition.isEnabled()
            );

            for (FlowDefinition flowDefinition : definition.getAllFlows().values()) {
                runtime.flows.add(FlowRuntime.fromDefinition(flowDefinition));
            }

            return runtime;
        }

        private GroupDefinition toDefinition() {
            GroupDefinition definition = new GroupDefinition(id, name, description, threads, outputMode);
            definition.setEnabled(enabled);
            for (FlowRuntime flow : flows) {
                definition.addFlow(flow.toDefinition(id));
            }
            return definition;
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
            payload.put("enabled", enabled);

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
        private String name;
        private String technology;
        private String connectionStatus;
        private int throughput;
        private int latency;
        private boolean hasError;
        private String errorMessage;
        private int interval;
        private int burst;
        private String topic;
        private String host;
        private int port;
        private String template;
        private String format;
        private boolean enabled;
        private Map<String, Object> connectorConfig;

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
            String template,
            String format,
            boolean enabled,
            Map<String, Object> connectorConfig
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
            this.format = format != null ? format : "json";
            this.enabled = enabled;
            this.connectorConfig = connectorConfig != null ? new LinkedHashMap<>(connectorConfig) : new LinkedHashMap<>();
        }

        private static FlowRuntime fromDefinition(FlowDefinition definition) {
            String id = definition.getFlowId();
            String name = definition.getName();
            String technology = definition.getTechnology();
            String status = "disconnected";
            int throughput = 0;
            int latency = 0;
            boolean hasError = false;
            String errorMessage = null;
            int interval = definition.getInterval();
            int burst = definition.getBurst();
            String topic = definition.getTopic();
            String host = definition.getHost();
            int port = definition.getPort();
            String template = definition.getTemplate();
            String format = definition.getFormat();
            boolean enabled = definition.isEnabled();
            Map<String, Object> config = definition.getConnectorConfig();

            return new FlowRuntime(id, name, technology, status, throughput, latency, hasError, errorMessage, interval, burst, topic, host, port, template, format, enabled, config);
        }

        private FlowDefinition toDefinition(String groupId) {
            FlowDefinition def = new FlowDefinition(
                id,
                groupId,
                name,
                technology,
                host,
                port,
                topic,
                interval,
                burst,
                template,
                format,
                technology,
                connectorConfig
            );
            def.setEnabled(enabled);
            return def;
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
            payload.put("format", format);
            payload.put("enabled", enabled);
            payload.put("connectorConfig", connectorConfig);
            return payload;
        }
    }
}
