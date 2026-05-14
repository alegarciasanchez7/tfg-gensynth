package com.gensynth.core.desktop.bridge;

import com.gensynth.core.ws.*;
import org.java_websocket.WebSocket;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.callback.CefQueryCallback;
import org.cef.callback.CefRunFileDialogCallback;
import org.cef.handler.CefDialogHandler.FileDialogMode;
import org.cef.handler.CefMessageRouterHandlerAdapter;
import java.util.Vector;
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
                        String originalCommandId = extractCommandId(request);

                        // Construct the EXPORT_STATE command with mandatory protocolVersion and payload
                        // object
                        String exportCommand = String.format(
                                "{\"type\":\"EXPORT_STATE\",\"commandId\":\"%s\",\"protocolVersion\":\"1.0.0\",\"payload\":{\"filePath\":\"%s\"}}",
                                originalCommandId, path.replace("\\", "\\\\"));

                        server.handleDesktopCommand(exportCommand, callback, browser);
                    } else {
                        // Notify the UI that the operation was cancelled using a proper CoreMessage
                        String commandId = extractCommandId(request);
                        String cancelResponse = String.format(
                                "{\"type\":\"SAVE_STATE\",\"commandId\":\"%s\",\"protocolVersion\":\"1.0.0\",\"payload\":{\"status\":\"cancelled\"}}",
                                commandId);

                        WebSocket desktopSocket = server.getDesktopSocket();
                        if (desktopSocket != null) {
                            desktopSocket.send(cancelResponse);
                        }

                        callback.success(cancelResponse);
                    }
                });
                return true;
            }

            // Intercept PICK_DIRECTORY to show native folder picker
            if (request.contains("PICK_DIRECTORY")) {
                String commandId = extractCommandId(request);
                browser.runFileDialog(FileDialogMode.FILE_DIALOG_OPEN_FOLDER,
                        "Select Output Directory", null, null, 0, new CefRunFileDialogCallback() {
                            @Override
                            public void onFileDialogDismissed(Vector<String> filePaths) {
                                java.util.Map<String, Object> payload = new java.util.LinkedHashMap<>();
                                if (filePaths != null && !filePaths.isEmpty()) {
                                    String path = filePaths.get(0);
                                    payload.put("status", "success");
                                    payload.put("path", path);
                                    server.broadcastMessage("PICK_DIRECTORY_RESULT", commandId, payload);
                                    callback.success("{\"status\":\"success\"}");
                                } else {
                                    payload.put("status", "cancelled");
                                    server.broadcastMessage("PICK_DIRECTORY_RESULT", commandId, payload);

                                    // Also send as a direct response to satisfy the bridge promise
                                    String cancelResponse = String.format(
                                            "{\"type\":\"PICK_DIRECTORY\",\"commandId\":\"%s\",\"protocolVersion\":\"1.0.0\",\"payload\":{\"status\":\"cancelled\"}}",
                                            commandId);

                                    WebSocket desktopSocket = server.getDesktopSocket();
                                    if (desktopSocket != null) {
                                        desktopSocket.send(cancelResponse);
                                    }

                                    callback.success(cancelResponse);
                                }
                            }
                        });
                return true;
            }

            // Intercept LOAD_STATE to show native file dialog in desktop mode
            if (request.contains("LOAD_STATE")) {
                javax.swing.SwingUtilities.invokeLater(() -> {
                    java.awt.FileDialog fileDialog = new java.awt.FileDialog(parentFrame,
                            "Load Gen-Synth Project", java.awt.FileDialog.LOAD);
                    fileDialog.setFile("*.json");
                    fileDialog.setVisible(true);

                    String directory = fileDialog.getDirectory();
                    String file = fileDialog.getFile();
                    String commandId = extractCommandId(request);

                    if (directory != null && file != null) {
                        try {
                            java.io.File selectedFile = new java.io.File(directory, file);
                            String content = Files.readString(selectedFile.toPath(), StandardCharsets.UTF_8);
                            // Validate JSON content before sending
                            server.getObjectMapper().readTree(content);

                            String fullImportCommand = String.format(
                                    "{\"type\":\"IMPORT_STATE\",\"commandId\":\"%s\",\"protocolVersion\":\"1.0.0\",\"payload\":%s}",
                                    commandId, content);

                            server.handleDesktopCommand(fullImportCommand, callback, browser);

                        } catch (Exception e) {
                            logger.error("[BRIDGE] Error loading file", e);
                            callback.failure(500, "Error loading file: " + e.getMessage());
                        }
                    } else {
                        // Notify the UI that the operation was cancelled
                        String cancelResponse = String.format(
                                "{\"type\":\"LOAD_STATE\",\"commandId\":\"%s\",\"protocolVersion\":\"1.0.0\",\"payload\":{\"status\":\"cancelled\"}}",
                                commandId);

                        WebSocket desktopSocket = server.getDesktopSocket();
                        if (desktopSocket != null) {
                            desktopSocket.send(cancelResponse);
                        }

                        callback.success(cancelResponse);
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

    private String extractCommandId(String request) {
        if (request.contains("\"commandId\":\"")) {
            int start = request.indexOf("\"commandId\":\"") + 13;
            int end = request.indexOf("\"", start);
            if (start > 12 && end > start) {
                return request.substring(start, end);
            }
        }
        return "unknown_" + System.currentTimeMillis();
    }
}
