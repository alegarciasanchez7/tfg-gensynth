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
    /** Virtual socket of this window, created with the first command and kept for the push messages. */
    private DesktopBridgeSocket desktopSocket;

    public GensynthMessageRouter(javax.swing.JFrame parentFrame) {
        this.parentFrame = parentFrame;
    }

    @Override
    public boolean onQuery(CefBrowser browser, CefFrame frame, long queryId, String request, boolean persistent,
            CefQueryCallback callback) {
        logger.info("[BRIDGE] Command received from UI: {}", request);

        try {
            // Routed by the type of the command, never by its text: payloads now carry file paths,
            // and a folder named "SAVE_STATE" must not turn a load into a save
            com.fasterxml.jackson.databind.JsonNode command = parse(request);
            String type = command.path("type").asText("");

            // Desktop-only request answered here
            if (OPEN_EXTERNAL_URL.equals(type)) {
                String url = command.path("payload").path("url").asText(null);
                if (ExternalLinkOpener.open(url)) {
                    callback.success("{\"status\":\"ok\"}");
                } else {
                    callback.failure(403, "URL not allowed");
                }
                return true;
            }

            UiBridgeWebSocketServer server = com.gensynth.core.App.getWsServer();
            if (server == null) {
                callback.failure(500, "Gen-Synth Core is not fully initialized");
                return true;
            }

            // Intercept SAVE_STATE to show a file dialog in desktop mode
            if ("SAVE_STATE".equals(type)) {
                String commandId = commandId(command);
                runFileDialog(commandId, callback, () -> {
                    java.util.Optional<java.io.File> selected = DesktopFileChooser.saveFile(parentFrame,
                            "Save Gen-Synth Configuration", PROJECT_FILE_FILTER, new java.io.File(DEFAULT_PROJECT_FILE_NAME));

                    if (selected.isPresent()) {
                        String path = ProjectFileFormat.ensureExtension(selected.get().getAbsolutePath());


                        // Construct the EXPORT_STATE command with mandatory protocolVersion and payload
                        // object
                        String exportCommand = String.format(
                                "{\"type\":\"EXPORT_STATE\",\"commandId\":\"%s\",\"protocolVersion\":\"1.0.0\",\"payload\":{\"filePath\":\"%s\"}}",
                                commandId, path.replace("\\", "\\\\"));

                        dispatch(server, exportCommand, callback, browser);
                    } else {
                        // Notify the UI that the operation was cancelled using a proper CoreMessage
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
            if ("PICK_DIRECTORY".equals(type)) {
                String commandId = commandId(command);
                runFileDialog(commandId, callback, () -> {
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

            // Intercept LOAD_STATE to show a file dialog in desktop mode; with a file path (a project
            // sent by the command line or opened with a double click) that file is loaded directly
            if ("LOAD_STATE".equals(type)) {
                String commandId = commandId(command);
                String filePath = command.path("payload").path("filePath").asText("");
                if (!filePath.isBlank()) {
                    runFileDialog(commandId, callback,
                            () -> loadProject(new java.io.File(filePath), commandId, server, callback, browser));
                    return true;
                }
                runFileDialog(commandId, callback, () -> {
                    java.util.Optional<java.io.File> selected =
                            DesktopFileChooser.openFile(parentFrame, "Load Gen-Synth Project", PROJECT_FILE_FILTER);

                    if (selected.isPresent()) {
                        loadProject(selected.get(), commandId, server, callback, browser);
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
            dispatch(server, request, callback, browser);
            return true;
        } catch (Exception e) {
            logger.error("[BRIDGE] Error processing command", e);
            callback.failure(500, e.getMessage());
            return true;
        }
    }

    /**
     * Loads a project file into the Core as IMPORT_STATE, with its path so the UI knows which
     * file is open (and Save writes back to it). Files that are not GenSynth projects are
     * rejected before the Core state is touched.
     */
    private void loadProject(java.io.File file, String commandId, UiBridgeWebSocketServer server,
                             CefQueryCallback callback, CefBrowser browser) {
        try {
            com.fasterxml.jackson.databind.node.ObjectNode project =
                    ProjectFileFormat.read(file.toPath(), server.getObjectMapper());
            project.put("sourceFilePath", file.getAbsolutePath());
            String content = server.getObjectMapper().writeValueAsString(project);
            String fullImportCommand = String.format(
                    "{\"type\":\"IMPORT_STATE\",\"commandId\":\"%s\",\"protocolVersion\":\"1.0.0\",\"payload\":%s}",
                    commandId, content);
            dispatch(server, fullImportCommand, callback, browser);
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
    }

    /**
     * Sends a command to the Core through the virtual socket of this window, which answers the
     * given query and keeps pushing messages to the browser afterwards.
     *
     * @param server   the Core engine
     * @param command  the command to run
     * @param callback the query callback answered by the first message sent back
     * @param browser  the browser of this window
     */
    synchronized void dispatch(UiBridgeWebSocketServer server, String command, CefQueryCallback callback,
                               CefBrowser browser) {
        if (desktopSocket == null) {
            desktopSocket = new DesktopBridgeSocket(callback, browser);
        } else {
            desktopSocket.setCallback(callback);
        }
        server.handleDesktopCommand(command, desktopSocket);
    }

    /**
     * @param request the command received from the UI
     * @return the command as JSON, or an empty object when it is not valid JSON (the Core then
     *         answers it with its own error)
     */
    static com.fasterxml.jackson.databind.JsonNode parse(String request) {
        try {
            com.fasterxml.jackson.databind.JsonNode command = JSON.readTree(request);
            return command == null ? JSON.createObjectNode() : command;
        } catch (Exception e) {
            return JSON.createObjectNode();
        }
    }

    /**
     * Runs a file dialog request on the Swing thread, one at a time. A request that arrives while
     * a dialog is open (for example the same command sent again) is rejected instead of opening a
     * second dialog over the first one, which would save or load twice.
     *
     * @param commandId the identifier of the command received from the UI
     * @param callback  the query callback, failed with 409 when a dialog is already open
     * @param dialog   shows the dialog and answers the UI
     */
    void runFileDialog(String commandId, CefQueryCallback callback, Runnable dialog) {
        if (!fileDialogOpen.compareAndSet(false, true)) {
            logger.warn("[BRIDGE] Ignoring command {}: a file dialog is already open", commandId);
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

    /**
     * @param command the command received from the UI
     * @return its identifier, or a made-up one when it has none
     */
    private static String commandId(com.fasterxml.jackson.databind.JsonNode command) {
        String commandId = command.path("commandId").asText("");
        return commandId.isEmpty() ? "unknown_" + System.currentTimeMillis() : commandId;
    }
}
