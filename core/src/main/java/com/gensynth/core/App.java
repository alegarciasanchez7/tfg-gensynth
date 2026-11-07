package com.gensynth.core;

import com.gensynth.core.api.IOpenWindowClient;
import com.gensynth.core.config.AppConfig;
import com.gensynth.core.config.AppPaths;
import com.gensynth.core.ws.OpenProjectClient;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import com.gensynth.core.desktop.DesktopFileChooser;
import com.gensynth.core.desktop.MainFrame;
import com.gensynth.core.desktop.NativeLoader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
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

    private final AppConfig config;
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

        AppPaths paths = AppPaths.current();
        logger.info("Data folder: {} | Output folder: {}", paths.dataHome(), paths.outputsHome());
        logger.info("WebSocket Server: {}:{}", config.getWebsocketHost(), config.getWebsocketPort());
        webSocketServer = new UiBridgeWebSocketServer(config.getWebsocketHost(), config.getWebsocketPort());
        publishWsServer(webSocketServer);
    }

    /** Keeps the server reachable from the desktop code through {@link #getWsServer()}. */
    private static void publishWsServer(UiBridgeWebSocketServer server) {
        wsServer = server;
    }

    private void checkAndPerformRollback() {
        Path markerPath = AppPaths.current().pendingInstallMarker();
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
            Path reportPath = AppPaths.current().rollbackReport();

            // Build a JSON report from the marker content
            String json = markerContent;
            if (!json.contains("\"message\"")) {
                json = json.replace("}",
                        ", \"message\": \"Plugin caused a critical startup failure and was automatically removed.\"}");
            }

            Files.writeString(reportPath, json, java.nio.charset.StandardCharsets.UTF_8);
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
        confirmSuccessfulPluginBoot();
        logger.info("Gen-Synth Core started successfully!");
    }

    private void confirmSuccessfulPluginBoot() {
        Path markerPath = AppPaths.current().pendingInstallMarker();
        if (Files.exists(markerPath)) {
            try {
                Files.delete(markerPath);
                logger.info("[PLUGINS] Plugin installation confirmed successful. Removed pending install marker.");
            } catch (IOException e) {
                logger.error("Error clearing pending install marker: {}", e.getMessage());
            }
        }
    }

    /**
     * Stops the application components.
     */
    private void stop() {
        logger.info("Gen-Synth Core stopping...");
        if (webSocketServer != null) {
            try {
                webSocketServer.shutdown();
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

    /**
     * What the application was asked to do when it started.
     *
     * @param desktop     whether to open the desktop window
     * @param openFile    absolute path of the project file to open in it, or null
     * @param restartArgs the arguments a restart (e.g. after installing a plugin) uses: the same
     *                    mode, without the project file, which is not opened again
     */
    record StartupArgs(boolean desktop, String openFile, List<String> restartArgs) {
    }

    /**
     * Reads the startup arguments: {@code --desktop}, and the project file to open as
     * {@code --open <file>} (the {@code edit} command of the command line) or alone (what Windows
     * and Linux pass on a double click or "Open with"). The launchers replace their default
     * {@code --desktop} when they receive an argument, so a file means the desktop window too,
     * whatever its name: one that is not a project is reported by the window, instead of
     * starting an engine without window.
     *
     * @param args the command line arguments
     * @return what to do
     */
    static StartupArgs parseArgs(String[] args) {
        boolean desktop = false;
        String openFile = null;
        List<String> restartArgs = new ArrayList<>();
        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            if ("--desktop".equalsIgnoreCase(arg)) {
                desktop = true;
            } else if ("--open".equals(arg) && i + 1 < args.length) {
                openFile = args[++i];
            } else if (!arg.startsWith("-")) {
                openFile = arg;
            } else {
                restartArgs.add(arg);
            }
        }
        if (openFile != null) {
            desktop = true;
            openFile = Paths.get(openFile).toAbsolutePath().normalize().toString();
        }
        if (desktop) {
            restartArgs.add(0, "--desktop");
        }
        return new StartupArgs(desktop, openFile, List.copyOf(restartArgs));
    }

    public static void main(String[] args) {
        StartupArgs startup = parseArgs(args);
        originalArgs = startup.restartArgs().toArray(new String[0]);
        // Mark that we are in the main boot of the application
        System.setProperty("gensynth.main_boot", "true");
        boolean isDesktop = startup.desktop();

        if (startup.openFile() != null && handOverToOpenWindow(startup.openFile())) {
            // Exit explicitly: an error dialog leaves the Swing thread alive
            System.exit(0);
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
                // Projects can be opened in this window from outside (CLI, double click)
                wsServer.setWindowActivator(MainFrame::bringToFront);
                if (startup.openFile() != null) {
                    wsServer.setPendingOpenProject(startup.openFile());
                }
                registerOpenFileHandler(wsServer);
                logger.info("[DESKTOP] Starting Gen-Synth in Desktop Mode...");
                DesktopFileChooser.installNativeLookAndFeel();
                org.cef.CefApp cefApp = NativeLoader.initialize();

                // Load standard http protocol on gensynth.local domain, fully compatible across all Linux and Windows platforms
                String initialUrl = "http://gensynth.local/index.html";

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

    /**
     * Opens the project in the GenSynth window that is already open, if any (a double click on a
     * project file while the application is open, on Windows and Linux): a second window would
     * clash with the first one. Errors are shown in a dialog, as there is no window of this
     * process to show them.
     *
     * @param openFile absolute path of the project file
     * @return true when an open window took it, so this process has nothing more to do
     */
    private static boolean handOverToOpenWindow(String openFile) {
        AppConfig config = new AppConfig();
        try {
            IOpenWindowClient.Outcome outcome = new OpenProjectClient(
                config.getWebsocketHost(), config.getWebsocketPort(), 2000).requestOpen(openFile);
            return outcome == IOpenWindowClient.Outcome.SENT;
        } catch (IllegalStateException e) {
            logger.warn("[DESKTOP] The open window could not open {}: {}", openFile, e.getMessage());
            if (!java.awt.GraphicsEnvironment.isHeadless()) {
                javax.swing.JOptionPane.showMessageDialog(null, e.getMessage(), "GenSynth",
                    javax.swing.JOptionPane.ERROR_MESSAGE);
            }
            return true;
        }
    }

    /**
     * macOS sends the project files to open (double click, "Open with") as system events instead
     * of arguments, both when the application starts and while it is open. Registered before the
     * window, so the file that started the application is not missed.
     */
    private static void registerOpenFileHandler(UiBridgeWebSocketServer server) {
        if (!java.awt.Desktop.isDesktopSupported()
                || !java.awt.Desktop.getDesktop().isSupported(java.awt.Desktop.Action.APP_OPEN_FILE)) {
            return;
        }
        // Any file, as on the other systems: one that is not a project is reported by the window
        java.awt.Desktop.getDesktop().setOpenFileHandler(event -> event.getFiles().stream()
            .findFirst()
            .ifPresent(file -> server.requestOpenProject(file.getAbsolutePath())));
    }

    private void handleEmergencyRecovery() {
        Path markerPath = AppPaths.current().pendingInstallMarker();
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
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } catch (Exception ignored) {
                        // Best effort: the restart goes ahead anyway
                    }
                }

                com.gensynth.core.util.RestartUtil.restart();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                logger.error("[EMERGENCY] Emergency recovery interrupted");
                System.exit(1);
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
