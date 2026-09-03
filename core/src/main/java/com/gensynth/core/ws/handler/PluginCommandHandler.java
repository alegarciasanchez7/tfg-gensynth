package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.gensynth.core.connectors.plugin.PluginInstallResult;
import com.gensynth.core.connectors.plugin.PluginValidationResult;
import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import org.java_websocket.WebSocket;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Handles plugin management commands (VALIDATE_PLUGIN, INSTALL_PLUGIN, UNINSTALL_PLUGIN).
 */
public class PluginCommandHandler implements CommandHandler {

    private static final Logger logger = LoggerFactory.getLogger(PluginCommandHandler.class);
    
    private final BridgeContext ctx;

    /**
     * Constructs a PluginCommandHandler with the shared BridgeContext.
     *
     * @param ctx the shared bridge context
     */
    public PluginCommandHandler(BridgeContext ctx) {
        this.ctx = ctx;
    }

    @Override
    public void handle(WebSocket conn, JsonNode payload, String commandId) throws Exception {
        // Methods are routed individually by UiBridgeWebSocketServer.
    }

    /**
     * Handles the VALIDATE_PLUGIN command.
     *
     * @param conn the WebSocket connection
     * @param payload the JSON payload containing details for validating the plugin
     * @param commandId the command identifier
     */
    public void handleValidatePlugin(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String jarBase64 = server.requireTextField(conn, commandId, payload, "jarBase64", "INVALID_PAYLOAD", "VALIDATE_PLUGIN");
        String pluginName = server.requireTextField(conn, commandId, payload, "pluginName", "INVALID_PAYLOAD", "VALIDATE_PLUGIN");
        String pluginVersion = server.requireTextField(conn, commandId, payload, "pluginVersion", "INVALID_PAYLOAD", "VALIDATE_PLUGIN");
        if (jarBase64 == null || pluginName == null || pluginVersion == null) {
            return;
        }

        byte[] jarBytes;
        try {
            jarBytes = Base64.getDecoder().decode(jarBase64);
        } catch (IllegalArgumentException e) {
            server.sendError(conn, commandId, "INVALID_PAYLOAD", "Invalid Base64 encoding for JAR data", Map.of());
            return;
        }

        PluginValidationResult result = ctx.getPluginInstaller().validate(jarBytes, pluginName, pluginVersion);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("commandId", commandId);
        response.put("status", "ok");
        response.put("valid", result.isValid());
        response.put("pluginId", result.getPluginId());
        response.put("displayName", result.getDisplayName());
        response.put("pluginVersion", result.getPluginVersion());
        response.put("coreApiVersion", result.getCoreApiVersion());
        response.put("logs", result.getLogs());

        logger.info("[PLUGINS] Sending validation result for '{}': valid={}, logsCount={}",
                pluginName, result.isValid(), result.getLogs().size());

        server.sendMessage(conn, "PLUGIN_VALIDATION_RESULT", commandId, response);

        server.logToBackend(result.isValid() ? "info" : "warn", "PLUGINS",
                "Plugin validation " + (result.isValid() ? "passed" : "failed") + " for '" + pluginName + "'", commandId);
    }

    /**
     * Handles the INSTALL_PLUGIN command.
     *
     * @param conn the WebSocket connection
     * @param payload the JSON payload containing details for installing the plugin
     * @param commandId the command identifier
     */
    public void handleInstallPlugin(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String jarBase64 = server.requireTextField(conn, commandId, payload, "jarBase64", "INVALID_PAYLOAD", "INSTALL_PLUGIN");
        String pluginName = server.requireTextField(conn, commandId, payload, "pluginName", "INVALID_PAYLOAD", "INSTALL_PLUGIN");
        String pluginVersion = server.requireTextField(conn, commandId, payload, "pluginVersion", "INVALID_PAYLOAD", "INSTALL_PLUGIN");
        if (jarBase64 == null || pluginName == null || pluginVersion == null) {
            return;
        }

        byte[] jarBytes;
        try {
            jarBytes = Base64.getDecoder().decode(jarBase64);
        } catch (IllegalArgumentException e) {
            server.sendError(conn, commandId, "INVALID_PAYLOAD", "Invalid Base64 encoding for JAR data", Map.of());
            return;
        }

        PluginInstallResult result = ctx.getPluginInstaller().install(jarBytes, pluginName, pluginVersion);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("commandId", commandId);
        response.put("status", result.isSuccess() ? "ok" : "error");
        response.put("success", result.isSuccess());
        response.put("message", result.getMessage());
        response.put("restartRequired", result.isRestartRequired());
        server.sendMessage(conn, "PLUGIN_INSTALL_RESULT", commandId, response);

        if (result.isSuccess()) {
            server.logToBackend("info", "PLUGINS", "Plugin '" + pluginName + "' installed. Restarting...", commandId);

            // Persist state before restart
            server.persistState();

            // Broadcast restart required to all connected clients
            broadcastRestartRequired();

            // Schedule JVM exit (the process wrapper/script will restart)
            ctx.getScheduler().schedule(this::restartAfterPluginInstall, 3, TimeUnit.SECONDS);
        } else {
            server.logToBackend("error", "PLUGINS", "Plugin install failed: " + result.getMessage(), commandId);
        }
    }

    /**
     * Handles the UNINSTALL_PLUGIN command.
     *
     * @param conn the WebSocket connection
     * @param payload the JSON payload containing the pluginId and pluginVersion to uninstall
     * @param commandId the command identifier
     */
    public void handleUninstallPlugin(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String pluginId = server.requireTextField(conn, commandId, payload, "pluginId", "INVALID_PAYLOAD", "UNINSTALL_PLUGIN");
        String pluginVersion = server.requireTextField(conn, commandId, payload, "pluginVersion", "INVALID_PAYLOAD", "UNINSTALL_PLUGIN");
        if (pluginId == null || pluginVersion == null) {
            return;
        }

        PluginInstallResult result = ctx.getPluginInstaller().uninstall(pluginId, pluginVersion);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("commandId", commandId);
        response.put("status", result.isSuccess() ? "ok" : "error");
        response.put("success", result.isSuccess());
        response.put("message", result.getMessage());
        response.put("restartRequired", result.isRestartRequired());
        server.sendMessage(conn, "PLUGIN_INSTALL_RESULT", commandId, response);

        if (result.isSuccess()) {
            server.logToBackend("info", "PLUGINS", "Plugin '" + pluginId + "' uninstalled. Restarting...", commandId);

            server.persistState();
            broadcastRestartRequired();

            ctx.getScheduler().schedule(this::restartAfterPluginInstall, 3, TimeUnit.SECONDS);
        } else {
            server.logToBackend("error", "PLUGINS", "Plugin uninstall failed: " + result.getMessage(), commandId);
        }
    }

    /**
     * Broadcasts a restart notification to all active connections.
     */
    public void broadcastRestartRequired() {
        UiBridgeWebSocketServer server = ctx.getServer();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("message", "Application is restarting to apply plugin changes...");
        payload.put("delaySeconds", 3);

        for (WebSocket conn : server.getConnections()) {
            if (conn.isOpen()) {
                server.sendMessage(conn, "RESTART_REQUIRED", null, payload);
            }
        }
    }

    /**
     * Performs a clean shutdown of the server and triggers a JVM/application restart.
     */
    public void restartAfterPluginInstall() {
        logger.info("Restarting Gen-Synth Core after plugin installation...");
        try {
            // Release the port before spawning the new process
            ctx.getServer().stop(1000);
            com.gensynth.core.util.RestartUtil.restart();
        } catch (Exception e) {
            logger.error("Failed to trigger restart", e);
        }
    }
}
