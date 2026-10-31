package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.gensynth.core.api.IUpdateService;
import com.gensynth.core.update.UpdateCheck;
import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import org.java_websocket.WebSocket;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Handles the update commands (CHECK_FOR_UPDATES, INSTALL_UPDATE, CANCEL_UPDATE) and broadcasts
 * the progress of an update as UPDATE_STATUS events.
 *
 * The user decides every step: a check only reports, and an update starts only when the UI
 * sends INSTALL_UPDATE. The network work runs on its own thread, never on the server
 * scheduler, which is stopped while the application closes to install.
 */
public class UpdateCommandHandler implements CommandHandler {
    private static final String VERSION = "version";
    private static final String CANCELLED = "cancelled";

    private static final Logger logger = LoggerFactory.getLogger(UpdateCommandHandler.class);

    private final BridgeContext ctx;
    private final IUpdateService service;
    private final ExecutorService executor;
    private final AtomicBoolean inProgress = new AtomicBoolean();
    private final AtomicReference<Future<?>> currentUpdate = new AtomicReference<>();
    private volatile boolean cancelRequested;
    private volatile boolean installing;

    /**
     * Creates the handler with its own background thread.
     *
     * @param ctx     the shared bridge context
     * @param service checks, downloads and installs updates
     */
    public UpdateCommandHandler(BridgeContext ctx, IUpdateService service) {
        this(ctx, service, Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "gensynth-updater");
            thread.setDaemon(true);
            return thread;
        }));
    }

    /**
     * Creates the handler with the given executor (used by tests).
     *
     * @param ctx      the shared bridge context
     * @param service  checks, downloads and installs updates
     * @param executor runs the network work
     */
    public UpdateCommandHandler(BridgeContext ctx, IUpdateService service, ExecutorService executor) {
        this.ctx = ctx;
        this.service = service;
        this.executor = executor;
    }

    @Override
    public void handle(WebSocket conn, JsonNode payload, String commandId) throws Exception {
        // Methods are routed individually by UiBridgeWebSocketServer.
    }

    /**
     * Handles CHECK_FOR_UPDATES: answers whether updates are supported and, if they are,
     * whether a newer release exists. Nothing is downloaded.
     *
     * @param conn      the WebSocket connection
     * @param commandId the command identifier
     */
    public void handleCheckForUpdates(WebSocket conn, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String reason = service.unsupportedReason();
        if (reason != null) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("currentVersion", service.currentVersion());
            result.put("supported", false);
            result.put("reason", reason);
            result.put("available", false);
            server.sendAck(conn, commandId, "update_checked", result);
            return;
        }
        executor.execute(() -> {
            try {
                Map<String, Object> result = new LinkedHashMap<>(service.check().toPayload());
                result.put("supported", true);
                server.sendAck(conn, commandId, "update_checked", result);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch (Exception e) {
                logger.info("Update check failed: {}", e.getMessage());
                server.sendError(conn, commandId, "UPDATE_CHECK_FAILED", "Could not check for updates: " + e.getMessage(), Map.of());
            }
        });
    }

    /**
     * Handles INSTALL_UPDATE: checks again that {@code version} is the latest release, then
     * downloads and verifies its installer and starts it. Progress goes out as UPDATE_STATUS.
     *
     * @param conn      the WebSocket connection
     * @param payload   {@code { "version": "0.5.3" }}, the version the user accepted
     * @param commandId the command identifier
     */
    public void handleInstallUpdate(WebSocket conn, JsonNode payload, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        String version = server.requireTextField(conn, commandId, payload, VERSION, "INVALID_PAYLOAD", "INSTALL_UPDATE");
        if (version == null) {
            return;
        }
        String reason = service.unsupportedReason();
        if (reason != null) {
            server.sendError(conn, commandId, "UPDATE_NOT_SUPPORTED", reason, Map.of());
            return;
        }
        if (!inProgress.compareAndSet(false, true)) {
            server.sendError(conn, commandId, "UPDATE_IN_PROGRESS", "An update is already in progress", Map.of());
            return;
        }
        cancelRequested = false;
        installing = false;
        server.sendAck(conn, commandId, "update_started", Map.of(VERSION, version));
        currentUpdate.set(executor.submit(() -> runUpdate(version)));
    }

    /**
     * Handles CANCEL_UPDATE: stops a download or verification in progress and deletes the
     * partial file. Once the installer has started it can no longer be cancelled here.
     *
     * @param conn      the WebSocket connection
     * @param commandId the command identifier
     */
    public void handleCancelUpdate(WebSocket conn, String commandId) {
        UiBridgeWebSocketServer server = ctx.getServer();
        Future<?> update = currentUpdate.get();
        if (!inProgress.get() || update == null || installing) {
            server.sendAck(conn, commandId, "update_not_cancelled", Map.of(CANCELLED, false));
            return;
        }
        cancelRequested = true;
        update.cancel(true);
        broadcastStatus(CANCELLED, null, 0, 0, null);
        server.sendAck(conn, commandId, "update_cancelled", Map.of(CANCELLED, true));
    }

    private void runUpdate(String version) {
        try {
            UpdateCheck update = service.check();
            if (!update.available() || !version.equals(update.latestVersion())) {
                throw new IllegalStateException("Version " + version + " is no longer the latest release ("
                    + update.latestVersion() + "). Check for updates again.");
            }
            broadcastStatus("downloading", version, 0, update.assetSize(), null);
            Path installer = service.download(update, new IUpdateService.DownloadProgress() {
                @Override
                public void onProgress(long receivedBytes, long totalBytes) {
                    if (!cancelRequested) {
                        broadcastStatus("downloading", version, receivedBytes, totalBytes, null);
                    }
                }

                @Override
                public void onVerifying() {
                    if (!cancelRequested) {
                        broadcastStatus("verifying", version, update.assetSize(), update.assetSize(), null);
                    }
                }
            });
            if (cancelRequested || Thread.currentThread().isInterrupted()) {
                return;
            }
            installing = true;
            broadcastStatus("installing", version, update.assetSize(), update.assetSize(),
                service.closesAppToInstall()
                    ? "GenSynth will close and open the installer."
                    : "Enter your password to install. GenSynth will restart.");
            service.install(installer);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            if (!cancelRequested) {
                broadcastStatus(CANCELLED, version, 0, 0, null);
            }
        } catch (Exception e) {
            if (!cancelRequested) {
                logger.warn("Update to {} failed: {}", version, e.getMessage());
                broadcastStatus("failed", version, 0, 0, e.getMessage());
            }
        } finally {
            installing = false;
            inProgress.set(false);
        }
    }

    private void broadcastStatus(String phase, String version, long receivedBytes, long totalBytes, String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("phase", phase);
        payload.put(VERSION, version);
        payload.put("receivedBytes", receivedBytes);
        payload.put("totalBytes", totalBytes);
        if (message != null) {
            payload.put("message", message);
        }
        ctx.getServer().broadcastMessage("UPDATE_STATUS", payload);
    }

    /**
     * Stops the background thread (tests and shutdown).
     */
    public void shutdown() {
        executor.shutdownNow();
    }
}
