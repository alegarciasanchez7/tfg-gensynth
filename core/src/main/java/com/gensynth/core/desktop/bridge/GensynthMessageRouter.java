package com.gensynth.core.desktop.bridge;

import com.gensynth.core.desktop.DesktopFileChooser;
import com.gensynth.core.desktop.ExternalLinkOpener;
import com.gensynth.core.persistence.ProjectFileFormat;
import com.gensynth.core.ws.*;
import org.java_websocket.WebSocket;
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
    private static final javax.swing.filechooser.FileNameExtensionFilter PROJECT_FILE_FILTER =
            new javax.swing.filechooser.FileNameExtensionFilter(
                    "GenSynth project (*" + ProjectFileFormat.EXTENSION + ")", ProjectFileFormat.EXTENSION.substring(1));
    private static final String DEFAULT_PROJECT_FILE_NAME = "gen-synth-project" + ProjectFileFormat.EXTENSION;
    private static final String OPEN_EXTERNAL_URL = "OPEN_EXTERNAL_URL";
    private static final com.fasterxml.jackson.databind.ObjectMapper JSON = new com.fasterxml.jackson.databind.ObjectMapper();
    private final javax.swing.JFrame parentFrame;
    /** True while a save, load or folder dialog is open: only one may be open at a time. */
    private final java.util.concurrent.atomic.AtomicBoolean fileDialogOpen = new java.util.concurrent.atomic.AtomicBoolean(false);

    public GensynthMessageRouter(javax.swing.JFrame parentFrame) {
        this.parentFrame = parentFrame;
    }

    @Override
    public boolean onQuery(CefBrowser browser, CefFrame frame, long queryId, String request, boolean persistent,
            CefQueryCallback callback) {
        logger.info("[BRIDGE] Command received from UI: {}", request);

        try {
            // Desktop-only request answered here; checked first because the routing below matches substrings
            if (request.contains(OPEN_EXTERNAL_URL)) {
                com.fasterxml.jackson.databind.JsonNode command = JSON.readTree(request);
                if (OPEN_EXTERNAL_URL.equals(command.path("type").asText())) {
                    String url = command.path("payload").path("url").asText(null);
                    if (ExternalLinkOpener.open(url)) {
                        callback.success("{\"status\":\"ok\"}");
                    } else {
                        callback.failure(403, "URL not allowed");
                    }
                    return true;
                }
            }

            UiBridgeWebSocketServer server = com.gensynth.core.App.getWsServer();
            if (server == null) {
                callback.failure(500, "Gen-Synth Core is not fully initialized");
                return true;
            }

            // Intercept SAVE_STATE to show a file dialog in desktop mode
            if (request.contains("SAVE_STATE")) {
                runFileDialog(request, callback, () -> {
                    java.util.Optional<java.io.File> selected = DesktopFileChooser.saveFile(parentFrame,
                            "Save Gen-Synth Configuration", PROJECT_FILE_FILTER, new java.io.File(DEFAULT_PROJECT_FILE_NAME));

                    if (selected.isPresent()) {
                        String path = ProjectFileFormat.ensureExtension(selected.get().getAbsolutePath());

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

            // Intercept PICK_DIRECTORY to show a folder picker
            if (request.contains("PICK_DIRECTORY")) {
                String commandId = extractCommandId(request);
                runFileDialog(request, callback, () -> {
                    java.util.Optional<java.io.File> selected =
                            DesktopFileChooser.chooseDirectory(parentFrame, "Select Output Directory");

                    java.util.Map<String, Object> payload = new java.util.LinkedHashMap<>();
                    if (selected.isPresent()) {
                        String path = selected.get().getAbsolutePath();
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
                });
                return true;
            }

            // Intercept LOAD_STATE to show a file dialog in desktop mode
            if (request.contains("LOAD_STATE")) {
                runFileDialog(request, callback, () -> {
                    java.util.Optional<java.io.File> selected =
                            DesktopFileChooser.openFile(parentFrame, "Load Gen-Synth Project", PROJECT_FILE_FILTER);
                    String commandId = extractCommandId(request);

                    if (selected.isPresent()) {
                        try {
                            java.io.File selectedFile = selected.get();
                            // Reject anything that is not a GenSynth project before touching the Core state
                            com.fasterxml.jackson.databind.node.ObjectNode project =
                                    ProjectFileFormat.read(selectedFile.toPath(), server.getObjectMapper());
                            // Attach the source path so the UI knows which file is open
                            project.put("sourceFilePath", selectedFile.getAbsolutePath());
                            String content = server.getObjectMapper().writeValueAsString(project);

                            String fullImportCommand = String.format(
                                    "{\"type\":\"IMPORT_STATE\",\"commandId\":\"%s\",\"protocolVersion\":\"1.0.0\",\"payload\":%s}",
                                    commandId, content);

                            server.handleDesktopCommand(fullImportCommand, callback, browser);

                        } catch (Exception e) {
                            logger.error("[BRIDGE] Error loading file", e);
                            // The UI only listens to the desktop socket, so report the error there too
                            WebSocket desktopSocket = server.getDesktopSocket();
                            if (desktopSocket != null) {
                                String code = e instanceof IllegalArgumentException ? "INVALID_PROJECT_FILE" : "LOAD_FAILED";
                                server.sendError(desktopSocket, commandId, code, e.getMessage(), null);
                            }
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

    /**
     * Runs a file dialog request on the Swing thread, one at a time. A request that arrives while
     * a dialog is open (for example the same command sent again) is rejected instead of opening a
     * second dialog over the first one, which would save or load twice.
     *
     * @param request  the command received from the UI
     * @param callback the query callback, failed with 409 when a dialog is already open
     * @param dialog   shows the dialog and answers the UI
     */
    void runFileDialog(String request, CefQueryCallback callback, Runnable dialog) {
        if (!fileDialogOpen.compareAndSet(false, true)) {
            logger.warn("[BRIDGE] Ignoring command {}: a file dialog is already open", extractCommandId(request));
            callback.failure(409, "A file dialog is already open");
            return;
        }
        javax.swing.SwingUtilities.invokeLater(() -> {
            try {
                dialog.run();
            } finally {
                fileDialogOpen.set(false);
            }
        });
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
