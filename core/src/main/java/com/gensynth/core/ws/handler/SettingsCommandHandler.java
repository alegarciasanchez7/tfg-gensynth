package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.gensynth.core.config.FolderAccess;
import com.gensynth.core.model.ProjectSettings;
import com.gensynth.core.model.TickSettings;
import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import org.java_websocket.WebSocket;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

/**
 * Handles project settings commands (UPDATE_SETTINGS), which broadcast SETTINGS_UPDATE, and the
 * preferences of this computer (UPDATE_OUTPUT_FOLDER).
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
     * Handles the UPDATE_OUTPUT_FOLDER command: changes the folder where each START creates its
     * session folder. The folder must be absolute; it is created when missing and must be
     * writable. A null or empty path goes back to the default folder. Running groups keep their
     * current session folder; the change applies from the next START.
     *
     * @param conn the WebSocket connection
     * @param payload the JSON payload, e.g. {@code { "path": "/home/ana/results" }}
     * @param commandId the command identifier
     */
    public void handleUpdateOutputFolder(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        JsonNode pathNode = payload == null ? null : payload.get("path");
        String rawPath = pathNode == null || pathNode.isNull() ? "" : pathNode.asText("").trim();

        Path folder = null;
        if (!rawPath.isEmpty()) {
            try {
                folder = Paths.get(rawPath);
            } catch (InvalidPathException e) {
                sendInvalidFolder(conn, commandId, "Invalid output folder: " + rawPath);
                return;
            }
            if (!folder.isAbsolute()) {
                sendInvalidFolder(conn, commandId, "The output folder must be a full path, e.g. one chosen with Browse: " + rawPath);
                return;
            }
            try {
                Files.createDirectories(folder);
            } catch (IOException | SecurityException e) {
                sendInvalidFolder(conn, commandId, FolderAccess.noPermissionMessage(folder));
                return;
            }
            if (!FolderAccess.canWriteIn(folder)) {
                sendInvalidFolder(conn, commandId, FolderAccess.noPermissionMessage(folder));
                return;
            }
        }

        try {
            ctx.getDevicePreferences().setOutputFolder(folder);
        } catch (IOException e) {
            server.sendError(conn, commandId, "INTERNAL_ERROR", "Could not save the output folder: " + e.getMessage(), Map.of("field", "path"));
            return;
        }

        Map<String, Object> outputFolder = ctx.outputFolderPayload();
        server.sendAck(conn, commandId, "output_folder_updated", Map.of("outputFolder", outputFolder));
        server.logToBackend("info", "SETTINGS", "Output folder set to " + outputFolder.get("path"), commandId);
    }

    private void sendInvalidFolder(WebSocket conn, String commandId, String message) {
        ctx.getServer().sendError(conn, commandId, "INVALID_PAYLOAD", message, Map.of("field", "path"));
    }

    /**
     * Broadcasts the current project settings to every connected client.
     */
    public void broadcastSettingsUpdate() {
        ctx.getServer().broadcastMessage("SETTINGS_UPDATE", ctx.getProjectSettings().toPayload());
    }
}
