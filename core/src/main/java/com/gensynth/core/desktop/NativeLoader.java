package com.gensynth.core.desktop;

import com.gensynth.core.config.AppPaths;
import com.gensynth.core.desktop.scheme.GensynthSchemeHandler;
import me.friwi.jcefmaven.CefAppBuilder;
import me.friwi.jcefmaven.CefInitializationException;
import me.friwi.jcefmaven.EnumProgress;
import me.friwi.jcefmaven.IProgressHandler;
import me.friwi.jcefmaven.MavenCefAppHandlerAdapter;
import me.friwi.jcefmaven.UnsupportedPlatformException;
import org.cef.CefApp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.awt.GraphicsEnvironment;
import java.io.File;
import java.io.IOException;
import java.nio.file.Path;

/**
 * Orchestrates the initialization of native JCEF (Chromium) components.
 */
public class NativeLoader {
    private static final Logger logger = LoggerFactory.getLogger(NativeLoader.class);

    private static CefApp instance;

    /**
     * Initializes the JCEF environment. On the first start the native browser is downloaded into
     * {@link AppPaths#jcefDir()} while a window explains what is happening; if the download fails,
     * the user can retry instead of the application closing silently.
     *
     * @return The initialized CefApp instance.
     */
    public static synchronized CefApp initialize() throws Exception {
        if (instance != null)
            return instance;

        logger.info("Initializing Multiplatform JCEF Environment...");

        AppPaths paths = AppPaths.current();
        File installDir = paths.jcefDir().toFile();
        if (!installDir.exists()) {
            logger.info("JCEF bundle not found. Downloading native binaries for current platform into {}", installDir);
        }

        while (true) {
            SetupProgress progress = new SetupProgress(paths.dataHome());
            try {
                instance = createBuilder(installDir, progress).build();
                logger.info("JCEF Environment initialized successfully.");
                return instance;
            } catch (CefInitializationException | IOException e) {
                logger.error("Failed to initialize JCEF: {}", e.getMessage());
                progress.close();
                if (GraphicsEnvironment.isHeadless() || !FirstRunWindow.askRetry(e.getMessage())) {
                    throw e;
                }
            } catch (UnsupportedPlatformException | InterruptedException e) {
                logger.error("Failed to initialize JCEF: {}", e.getMessage());
                throw e;
            } finally {
                progress.close();
            }
        }
    }

    private static CefAppBuilder createBuilder(File installDir, IProgressHandler progressHandler) {
        CefAppBuilder builder = new CefAppBuilder();
        builder.setProgressHandler(progressHandler);

        // Isolate JCEF cache & profile directory so it never shares state with the system Chromium browser
        File cacheDir = new File(installDir, "cache");
        if (!cacheDir.exists()) {
            cacheDir.mkdirs();
        }
        builder.getCefSettings().root_cache_path = cacheDir.getAbsolutePath();
        builder.getCefSettings().cache_path = cacheDir.getAbsolutePath();

        // Disable native Chromium log spam (Mojo deserialization errors, console noise, etc.)
        builder.getCefSettings().log_severity = org.cef.CefSettings.LogSeverity.LOGSEVERITY_DISABLE;
        
        // Use standard windowed rendering (windowless = false) on all platforms for peak native GPU performance.
        // Under Linux Wayland/GNOME, we resolve window reparenting/blank screen glitches by forcing Chromium to
        // run on the X11/XWayland server (matching Java Swing's AWT windowing backend).
        boolean isLinux = System.getProperty("os.name").toLowerCase().contains("linux");
        builder.getCefSettings().windowless_rendering_enabled = false;
        
        // Optimize for stability & isolate as standalone desktop app:
        builder.addJcefArgs(
            "--disable-gpu", 
            "--disable-gpu-compositing", 
            "--disable-software-rasterizer",
            "--hide-crash-restore-bubble",
            "--no-first-run",
            "--no-default-browser-check"
        );
        if (isLinux) {
            builder.addJcefArgs("--ozone-platform=x11", "--disable-features=UseOzonePlatform");
        }

        // Configure the installation directory (cross-platform)
        builder.setInstallDir(installDir);

        builder.setAppHandler(new MavenCefAppHandlerAdapter() {
            @Override
            public void onRegisterCustomSchemes(org.cef.callback.CefSchemeRegistrar registrar) {
                // Standard http scheme does not require manual custom registration.
            }

            @Override
            public void onContextInitialized() {
                // Register the scheme handler factory under the standard HTTP scheme on the gensynth.local domain.
                // This is 100% standard and natively recognized by every Chromium child process (including jcef_helper),
                // avoiding all Mojo deserialization conflicts and custom protocol security sandboxing blocks.
                CefApp.getInstance().registerSchemeHandlerFactory("http", "gensynth.local",
                        new org.cef.callback.CefSchemeHandlerFactory() {
                            @Override
                            public org.cef.handler.CefResourceHandler create(org.cef.browser.CefBrowser browser,
                                    org.cef.browser.CefFrame frame, String schemeName,
                                    org.cef.network.CefRequest request) {
                                return new GensynthSchemeHandler();
                            }
                        });
            }

            @Override
            public void stateHasChanged(CefApp.CefAppState state) {
                logger.info("JCEF State: {}", state);
            }
        });

        return builder;
    }

    /**
     * Logs every setup step and, only when the browser has to be downloaded, shows the
     * first-run window with the progress.
     */
    private static final class SetupProgress implements IProgressHandler {
        private final Path dataHome;
        private EnumProgress lastState;
        private FirstRunWindow window;

        SetupProgress(Path dataHome) {
            this.dataHome = dataHome;
        }

        @Override
        public synchronized void handleProgress(EnumProgress state, float percent) {
            if (state != lastState) {
                logger.info("JCEF setup: {}", state);
                lastState = state;
            }
            if (window == null && JcefSetupStatus.isInstallStep(state) && !GraphicsEnvironment.isHeadless()) {
                window = FirstRunWindow.open(dataHome);
            }
            if (window != null) {
                window.update(JcefSetupStatus.of(state, percent));
            }
        }

        synchronized void close() {
            if (window != null) {
                window.close();
                window = null;
            }
        }
    }

    public static void dispose() {
        if (instance != null) {
            CefApp.getInstance().dispose();
        }
    }
}
