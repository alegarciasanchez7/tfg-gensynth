package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.model.Variable;
import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import com.gensynth.core.flow.variables.InvalidVariableConfigException;
import com.gensynth.core.flow.variables.VariableType;
import org.java_websocket.WebSocket;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static com.gensynth.core.ws.BridgeProtocol.CLIENT_REQUEST_ID;
import static com.gensynth.core.ws.BridgeProtocol.FLOW_ID;
import static com.gensynth.core.ws.BridgeProtocol.GROUP_ID;
import static com.gensynth.core.ws.BridgeProtocol.INVALID_PAYLOAD;
import static com.gensynth.core.ws.BridgeProtocol.SOURCE_VARIABLES;
import static com.gensynth.core.ws.BridgeProtocol.VARIABLE_ID;

/**
 * Handles variable management commands (CREATE_VARIABLE, DELETE_VARIABLE, UPDATE_VARIABLE).
 */
public class VariableCommandHandler implements CommandHandler {
    private static final String CREATE_VARIABLE = "CREATE_VARIABLE";
    private static final String SCOPE = "scope";
    private static final String CONFIG = "config";

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    
    private final BridgeContext ctx;

    /**
     * Constructs a VariableCommandHandler with the shared BridgeContext.
     *
     * @param ctx the shared bridge context
     */
    public VariableCommandHandler(BridgeContext ctx) {
        this.ctx = ctx;
    }

    @Override
    public void handle(WebSocket conn, JsonNode payload, String commandId) throws Exception {
        // Methods are routed individually by UiBridgeWebSocketServer.
    }

    /**
     * Handles the CREATE_VARIABLE command.
     *
     * @param conn the WebSocket connection
     * @param payload the JSON payload containing details for the new variable
     * @param commandId the command identifier
     */
    public void handleCreateVariable(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String name = server.requireTextField(conn, commandId, payload, "name", INVALID_PAYLOAD, CREATE_VARIABLE);
        String type = server.requireTextField(conn, commandId, payload, "type", INVALID_PAYLOAD, CREATE_VARIABLE);
        String scope = server.requireTextField(conn, commandId, payload, SCOPE, INVALID_PAYLOAD, CREATE_VARIABLE);
        if (name == null || type == null || scope == null) {
            return;
        }

        String clientRequestId = payload.path(CLIENT_REQUEST_ID).asText(null);
        String coreType = normalizeVariableTypeForCore(type);
        ObjectMapper objectMapper = ctx.getObjectMapper();

        Map<String, Object> config = payload.has(CONFIG) && payload.get(CONFIG).isObject()
            ? objectMapper.convertValue(payload.get(CONFIG), MAP_TYPE)
            : Map.of();
        Object defaultValue = payload.has(CONFIG) ? payload.get(CONFIG).toString() : "";
        Variable createdVariable;

        synchronized (ctx.getStateLock()) {
            String variableId = payload.path(VARIABLE_ID).asText("");
            if (variableId.isBlank()) {
                variableId = UUID.randomUUID().toString();
            }

            String flowId = payload.path(FLOW_ID).asText(null);
            if (flowId == null || flowId.trim().isEmpty() || "null".equalsIgnoreCase(flowId)) {
                flowId = null;
            }
            String groupId = payload.path(GROUP_ID).asText(null);
            if (groupId == null || groupId.trim().isEmpty() || "null".equalsIgnoreCase(groupId)) {
                groupId = null;
            }

            try {
                createdVariable = new Variable(variableId, name, scope.toUpperCase(), coreType, defaultValue, config, flowId, groupId);
                ctx.getVariablesById().put(variableId, createdVariable);
                server.persistState();
            } catch (InvalidVariableConfigException ex) {
                server.sendError(conn, commandId, clientRequestId, "VALIDATION_ERROR", ex.getMessage(), Map.of(VARIABLE_ID, variableId, "errors", ex.getErrors()));
                return;
            } catch (IllegalArgumentException ex) {
                server.sendError(conn, commandId, clientRequestId, INVALID_PAYLOAD, ex.getMessage(), Map.of("name", name, "type", type, SCOPE, scope));
                return;
            }
        }

        Map<String, Object> response = new LinkedHashMap<>(createdVariable.toPayload());
        response.put("commandId", commandId);
        if (clientRequestId != null) {
            response.put(CLIENT_REQUEST_ID, clientRequestId);
        }
        response.putIfAbsent("status", "ok");
        response.put("result", "variable_created");
        response.put("type", type);
        response.put(SCOPE, scope.toLowerCase());
        server.sendMessage(conn, "CONNECTION_STATUS", commandId, response);
        server.logToBackend("info", SOURCE_VARIABLES, "Created variable '" + name + "'", commandId);
        server.sendVariablesUpdate();
    }

    /**
     * Handles the DELETE_VARIABLE command.
     *
     * @param conn the WebSocket connection
     * @param payload the JSON payload containing the variableId to delete
     * @param commandId the command identifier
     */
    public void handleDeleteVariable(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String variableId = server.requireTextField(conn, commandId, payload, VARIABLE_ID, INVALID_PAYLOAD, "DELETE_VARIABLE");
        if (variableId == null) {
            return;
        }

        String clientRequestId = payload.path(CLIENT_REQUEST_ID).asText(null);

        synchronized (ctx.getStateLock()) {
            Variable removed = ctx.getVariablesById().remove(variableId);
            if (removed == null) {
                server.sendError(conn, commandId, clientRequestId, "NOT_FOUND", "Variable not found: " + variableId, Map.of(VARIABLE_ID, variableId));
                return;
            }
            server.logToBackend("info", SOURCE_VARIABLES, "Deleted variable '" + removed.getName() + "'", commandId);
            server.persistState();
        }

        server.sendAck(conn, commandId, clientRequestId, "variable_deleted");
        server.sendVariablesUpdate();
    }

    /**
     * Handles the UPDATE_VARIABLE command.
     *
     * @param conn the WebSocket connection
     * @param payload the JSON payload containing the updated variable fields
     * @param commandId the command identifier
     */
    public void handleUpdateVariable(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String variableId = server.requireTextField(conn, commandId, payload, VARIABLE_ID, INVALID_PAYLOAD, "UPDATE_VARIABLE");
        if (variableId == null) {
            return;
        }

        String updatedVariableName;
        synchronized (ctx.getStateLock()) {
            Variable existing = ctx.getVariablesById().get(variableId);
            if (existing == null) {
                server.sendError(conn, commandId, "NOT_FOUND", "Variable not found: " + variableId, Map.of(VARIABLE_ID, variableId));
                return;
            }

            String name = payload.path("name").asText(existing.getName());
            updatedVariableName = name;
            String type = normalizeVariableTypeForCore(payload.path("type").asText(existing.getType()));
            String scope = payload.path(SCOPE).asText(existing.getScope()).toUpperCase();
            
            String flowId = payload.has(FLOW_ID) ? payload.get(FLOW_ID).asText() : existing.getFlowId();
            if (flowId == null || flowId.trim().isEmpty() || "null".equalsIgnoreCase(flowId)) {
                flowId = null;
            }
            String groupId = payload.has(GROUP_ID) ? payload.get(GROUP_ID).asText() : existing.getGroupId();
            if (groupId == null || groupId.trim().isEmpty() || "null".equalsIgnoreCase(groupId)) {
                groupId = null;
            }
            ObjectMapper objectMapper = ctx.getObjectMapper();
            Map<String, Object> config = payload.has(CONFIG) && payload.get(CONFIG).isObject()
                ? objectMapper.convertValue(payload.get(CONFIG), MAP_TYPE)
                : existing.getConfig();
            Object defaultValue = payload.has(CONFIG) ? payload.get(CONFIG).toString() : existing.getDefaultValue();

            try {
                Variable updated = new Variable(variableId, name, scope, type, defaultValue, config, flowId, groupId);
                ctx.getVariablesById().put(variableId, updated);
                ctx.getTemplateEngine().removeCachedVariable(variableId);
                server.persistState();
            } catch (InvalidVariableConfigException ex) {
                server.sendError(conn, commandId, "VALIDATION_ERROR", ex.getMessage(), Map.of(VARIABLE_ID, variableId, "errors", ex.getErrors()));
                return;
            } catch (IllegalArgumentException ex) {
                server.sendError(conn, commandId, INVALID_PAYLOAD, ex.getMessage(), Map.of(VARIABLE_ID, variableId));
                return;
            }
        }

        server.sendAck(conn, commandId, "variable_updated");
        server.logToBackend("info", SOURCE_VARIABLES, "Updated variable '" + updatedVariableName + "'", commandId);
        server.sendVariablesUpdate();
    }

    /**
     * Helper to normalize UI variable types to the internal representation.
     *
     * @param type the variable type to normalize
     * @return the normalized core variable type
     */
    public static String normalizeVariableTypeForCore(String type) {
        return VariableType.TEMPORAL.matches(type) ? "date" : type;
    }

    /**
     * Helper to normalize core variable representation into a payload suitable for the UI.
     *
     * @param payload the variable payload map to normalize
     * @return the normalized UI payload map
     */
    public static Map<String, Object> normalizeVariablePayloadForUi(Map<String, Object> payload) {
        Map<String, Object> normalized = new LinkedHashMap<>(payload);
        Object type = normalized.get("type");
        if (type instanceof String typeName && VariableType.TEMPORAL.matches(typeName)) {
            normalized.put("type", "temporal");
        }
        Object scope = normalized.get(SCOPE);
        if (scope instanceof String) {
            normalized.put(SCOPE, ((String) scope).toLowerCase());
        }
        return normalized;
    }
}
