package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.gensynth.core.model.ProjectSettings;
import com.gensynth.core.model.TickSettings;
import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import org.java_websocket.WebSocket;

import java.util.Map;

/**
 * Handles project settings commands (UPDATE_SETTINGS) and broadcasts SETTINGS_UPDATE.
 */
public class SettingsCommandHandler implements CommandHandler {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final BridgeContext ctx;

    /**
     * Constructs a SettingsCommandHandler with the shared BridgeContext.
     *
     * @param ctx the shared bridge context
     */
    public SettingsCommandHandler(BridgeContext ctx) {
        this.ctx = ctx;
    }

    @Override
    public void handle(WebSocket conn, JsonNode payload, String commandId) throws Exception {
        // Methods are routed individually by UiBridgeWebSocketServer.
    }

    /**
     * Handles the UPDATE_SETTINGS command. The new tick settings are validated, applied live
     * (running groups keep running and the clock is rescheduled) and persisted.
     *
     * @param conn the WebSocket connection
     * @param payload the JSON payload, e.g. {@code { "tick": { "mode", "value", "unit" } }}
     * @param commandId the command identifier
     */
    public void handleUpdateSettings(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        JsonNode tickNode = payload == null ? null : payload.path("tick");
        if (tickNode == null || !tickNode.isObject()) {
            server.sendError(conn, commandId, "INVALID_PAYLOAD", "UPDATE_SETTINGS requires a 'tick' object", Map.of("field", "tick"));
            return;
        }

        TickSettings tick;
        try {
            tick = TickSettings.fromPayload(ctx.getObjectMapper().convertValue(tickNode, MAP_TYPE));
        } catch (IllegalArgumentException e) {
            server.sendError(conn, commandId, "INVALID_PAYLOAD", e.getMessage(), Map.of("field", "tick"));
            return;
        }

        ProjectSettings settings = new ProjectSettings(tick);
        synchronized (ctx.getStateLock()) {
            ctx.applyProjectSettings(settings);
            server.persistState();
        }

        server.sendAck(conn, commandId, "settings_updated", Map.of("settings", settings.toPayload()));
        broadcastSettingsUpdate();
        server.logToBackend("info", "SETTINGS", "Tick clock set to " + tick.describe(), commandId);
    }

    /**
     * Broadcasts the current project settings to every connected client.
     */
    public void broadcastSettingsUpdate() {
        ctx.getServer().broadcastMessage("SETTINGS_UPDATE", ctx.getProjectSettings().toPayload());
    }
}
