package com.gensynth.core.desktop.bridge;

import com.gensynth.core.ws.*;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.callback.CefQueryCallback;
import org.cef.handler.CefMessageRouterHandlerAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Handles messages sent from JavaScript (window.javaBridge) to Java.
 */
public class GensynthMessageRouter extends CefMessageRouterHandlerAdapter {
    private static final Logger logger = LoggerFactory.getLogger(GensynthMessageRouter.class);
    private final javax.swing.JFrame parentFrame;

    public GensynthMessageRouter(javax.swing.JFrame parentFrame) {
        this.parentFrame = parentFrame;
    }

    @Override
    public boolean onQuery(CefBrowser browser, CefFrame frame, long queryId, String request, boolean persistent,
            CefQueryCallback callback) {
        logger.info("[BRIDGE] Command received from UI: {}", request);

        try {
            UiBridgeWebSocketServer server = com.gensynth.core.App.getWsServer();
            if (server == null) {
                callback.failure(500, "Gen-Synth Core is not fully initialized");
                return true;
            }

            // Intercept SAVE_STATE to show native file dialog in desktop mode
            if (request.contains("SAVE_STATE")) {
                javax.swing.SwingUtilities.invokeLater(() -> {
                    java.awt.FileDialog fileDialog = new java.awt.FileDialog(parentFrame,
                            "Save Gen-Synth Configuration", java.awt.FileDialog.SAVE);
                    fileDialog.setFile("*.json");
                    fileDialog.setVisible(true);

                    String directory = fileDialog.getDirectory();
                    String file = fileDialog.getFile();

                    if (directory != null && file != null) {
                        String path = new java.io.File(directory, file).getAbsolutePath();
                        if (!path.toLowerCase().endsWith(".json")) {
                            path += ".json";
                        }

                        // Extract original commandId if present to keep UI synchronized
                        String originalCommandId = "desktop_export_" + System.currentTimeMillis();
                        if (request.contains("\"commandId\":\"")) {
                            int start = request.indexOf("\"commandId\":\"") + 13;
                            int end = request.indexOf("\"", start);
                            if (start > 12 && end > start) {
                                originalCommandId = request.substring(start, end);
                            }
                        }

                        // Construct the EXPORT_STATE command with mandatory protocolVersion and payload
                        // object
                        String exportCommand = String.format(
                                "{\"type\":\"EXPORT_STATE\",\"commandId\":\"%s\",\"protocolVersion\":\"1.0.0\",\"payload\":{\"filePath\":\"%s\"}}",
                                originalCommandId, path.replace("\\", "\\\\"));

                        server.handleDesktopCommand(exportCommand, callback, browser);
                    } else {
                        callback.success("{\"status\":\"cancelled\"}");
                    }
                });
                return true;
            }

            // Route the command to the main server logic using the virtual socket
            server.handleDesktopCommand(request, callback, browser);
            return true;
        } catch (Exception e) {
            logger.error("[BRIDGE] Error processing command", e);
            callback.failure(500, e.getMessage());
            return true;
        }
    }
}
