package com.gensynth.core;

import com.gensynth.core.config.AppConfig;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import com.gensynth.core.desktop.MainFrame;
import com.gensynth.core.desktop.NativeLoader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.CountDownLatch;
import java.io.IOException;
import java.nio.file.*;
import java.util.regex.*;

/**
 * Main entry point for Gen-Synth Core.
 * Orchestrates system initialization and execution.
 */
public class App {

    private static final Logger logger = LoggerFactory.getLogger(App.class);
    private static UiBridgeWebSocketServer wsServer;
    private static String[] originalArgs;

    public static UiBridgeWebSocketServer getWsServer() {
        return wsServer;
    }

    public static String[] getOriginalArgs() {
        return originalArgs;
    }

    private AppConfig config;
    private UiBridgeWebSocketServer webSocketServer;
    private final CountDownLatch shutdownLatch;

    private App() {
        this.config = new AppConfig();
        this.shutdownLatch = new CountDownLatch(1);
    }

    /**
     * Initializes the application.
     */
    private void initialize() {
        logger.info("Gen-Synth Core initializing...");

        // --- ROLLBACK LOGIC ---
        checkAndPerformRollback();

        logger.info("WebSocket Server: {}:{}", config.getWebsocketHost(), config.getWebsocketPort());
        webSocketServer = new UiBridgeWebSocketServer(config.getWebsocketHost(), config.getWebsocketPort());
        wsServer = webSocketServer; // Store reference for desktop mode
    }

    private void checkAndPerformRollback() {
        Path markerPath = Paths.get("plugins", ".pending_install.json");
        if (Files.exists(markerPath)) {
            try {
                String content = Files.readString(markerPath);

                // If it was already attempted, it means the last startup CRASHED.
                if (content.contains("\"attempted\": true")) {
                    logger.warn("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                    logger.warn("!! PREVIOUS BOOT FAILURE DETECTED                         !!");
                    logger.warn("!! PERFORMING AUTOMATIC ROLLBACK OF PROBLEMATIC PLUGIN    !!");
                    logger.warn("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

                    performRollback(markerPath, content);
                } else {
                    // First boot attempt after install. Mark it as attempted.
                    logger.info("[PLUGINS] New plugin installation detected. Marking attempt...");
                    String updatedContent = content.replace("}", ", \"attempted\": true}");
                    Files.writeString(markerPath, updatedContent);
                }
            } catch (Exception e) {
                logger.error("Error processing rollback marker: {}", e.getMessage());
            }
        }
    }

    private void performRollback(Path markerPath, String content) throws Exception {
        // Save the report immediately so UI knows what happened even if restart is
        // required
        saveRollbackReport(content);

        // Simple regex to extract "path":"..." from JSON
        Matcher matcher = Pattern.compile("\"path\":\\s*\"([^\"]+)\"").matcher(content);
        if (matcher.find()) {
            Path jarPath = Paths.get(matcher.group(1));
            if (Files.exists(jarPath)) {
                boolean deleted = false;
                for (int i = 1; i <= 5; i++) {
                    try {
                        System.gc(); // Help Windows release file locks
                        Files.delete(jarPath);
                        logger.info(">> Successfully removed problematic JAR: {}", jarPath.getFileName());
                        deleted = true;
                        break;
                    } catch (IOException e) {
                        logger.warn(">> Retrying file release ({}/5)...", i);
                        Thread.sleep(1000);
                    }
                }

                if (!deleted) {
                    logger.error(
                            ">> [WARNING] Could not delete JAR after several attempts. It will be retried on next boot.");
                    return; // Keep marker for next attempt
                }
            }
        }
        Files.delete(markerPath);
        logger.info(">> Rollback completed. Continuing clean boot...");
    }

    private void saveRollbackReport(String markerContent) {
        try {
            Path reportPath = Paths.get("plugins", ".rollback_report.json");

            // Build a JSON report from the marker content
            String json = markerContent;
            if (!json.contains("\"message\"")) {
                json = json.replace("}",
                        ", \"message\": \"Plugin caused a critical startup failure and was automatically removed.\"}");
            }

            Files.writeString(reportPath, json);
            logger.info("[PLUGINS] Rollback report saved to {}", reportPath);
        } catch (IOException e) {
            logger.error("Failed to save rollback report", e);
        }
    }

    /**
     * Starts the application components.
     */
    private void start() {
        webSocketServer.start();
        logger.info("Gen-Synth Core started successfully!");
    }

    /**
     * Stops the application components.
     */
    private void stop() {
        logger.info("Gen-Synth Core stopping...");
        if (webSocketServer != null) {
            try {
                webSocketServer.stop();
            } catch (Exception e) {
                logger.error("Error stopping WebSocket server: {}", e.getMessage());
            }
        }
        shutdownLatch.countDown();
    }

    private void awaitShutdown() {
        try {
            shutdownLatch.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    public static void main(String[] args) {
        originalArgs = args;
        // Mark that we are in the main boot of the application
        System.setProperty("gensynth.main_boot", "true");

        boolean isDesktop = false;
        for (String arg : args) {
            if ("--desktop".equalsIgnoreCase(arg)) {
                isDesktop = true;
                break;
            }
        }

        App app = new App();
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            app.stop();
            NativeLoader.dispose();
        }));

        try {
            app.initialize();
            app.start();

            if (isDesktop) {
                logger.info("[DESKTOP] Starting Gen-Synth in Desktop Mode...");
                org.cef.CefApp cefApp = NativeLoader.initialize();

                // URL to load: for now we use the Vite dev server URL
                // Phase 3 will replace this with a custom scheme like gensynth://app/
                String initialUrl = "gensynth://app/index.html";

                MainFrame frame = new MainFrame("GenSynth", initialUrl, cefApp);
                frame.showWindow();
            }

            app.awaitShutdown();
        } catch (Throwable t) {
            logger.error("\n[EMERGENCY] Critical startup failure detected!");
            logger.error("[EMERGENCY] Error: {}", t.getMessage());
            app.handleEmergencyRecovery();
        }
    }

    private void handleEmergencyRecovery() {
        Path markerPath = Paths.get("plugins", ".pending_install.json");
        if (Files.exists(markerPath)) {
            logger.warn("[EMERGENCY] Pending plugin installation found. Performing automatic rollback...");
            try {
                String content = Files.readString(markerPath);
                performRollback(markerPath, content);

                logger.info("[EMERGENCY] Rollback successful. Triggering automatic restart...");
                // Wait a bit so the user can see the console messages
                Thread.sleep(2000);

                // Release the port before spawning the new process to avoid collisions
                if (webSocketServer != null) {
                    try {
                        webSocketServer.stop(1000);
                    } catch (Exception ignored) {
                    }
                }

                com.gensynth.core.util.RestartUtil.restart();
            } catch (Exception e) {
                logger.error("[EMERGENCY] Failed to perform emergency recovery: {}", e.getMessage());
                System.exit(1);
            }
        } else {
            logger.error("[EMERGENCY] No rollback marker found. The crash might not be plugin-related.");
            System.exit(1);
        }
    }
}
