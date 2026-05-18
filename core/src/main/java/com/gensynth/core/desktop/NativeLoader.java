package com.gensynth.core.desktop;

import com.gensynth.core.desktop.scheme.GensynthSchemeHandler;
import me.friwi.jcefmaven.CefAppBuilder;
import me.friwi.jcefmaven.CefInitializationException;
import me.friwi.jcefmaven.MavenCefAppHandlerAdapter;
import me.friwi.jcefmaven.UnsupportedPlatformException;
import org.cef.CefApp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;

/**
 * Orchestrates the initialization of native JCEF (Chromium) components.
 */
public class NativeLoader {
    private static final Logger logger = LoggerFactory.getLogger(NativeLoader.class);
    private static final String JCEF_DIR = "jcef-bundle";

    private static CefApp instance;

    /**
     * Initializes the JCEF environment.
     * 
     * @return The initialized CefApp instance.
     */
    public static synchronized CefApp initialize() throws Exception {
        if (instance != null)
            return instance;

        logger.info("Initializing Multiplatform JCEF Environment...");

        File installDir = new File(JCEF_DIR);
        if (!installDir.exists()) {
            logger.info("JCEF bundle not found. Downloading native binaries for current platform...");
        }

        try {
            CefAppBuilder builder = new CefAppBuilder();
            
            // Disable native Chromium log spam (Mojo deserialization errors, console noise, etc.)
            builder.getCefSettings().log_severity = org.cef.CefSettings.LogSeverity.LOGSEVERITY_DISABLE;
            
            // Use standard windowed rendering (windowless = false) on all platforms for peak native GPU performance.
            // Under Linux Wayland/GNOME, we resolve window reparenting/blank screen glitches by forcing Chromium to
            // run on the X11/XWayland server (matching Java Swing's AWT windowing backend).
            boolean isLinux = System.getProperty("os.name").toLowerCase().contains("linux");
            builder.getCefSettings().windowless_rendering_enabled = false;
            
            // Optimize for stability:
            builder.addJcefArgs("--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer");
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

            // Build and initialize
            instance = builder.build();

            logger.info("JCEF Environment initialized successfully.");
            return instance;

        } catch (CefInitializationException | UnsupportedPlatformException | IOException | InterruptedException e) {
            logger.error("Failed to initialize JCEF: {}", e.getMessage());
            throw e;
        }
    }

    public static void dispose() {
        if (instance != null) {
            CefApp.getInstance().dispose();
        }
    }
}
