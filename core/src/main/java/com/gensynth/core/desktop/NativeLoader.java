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
            
            // Optimize for stability on Windows: Disable GPU acceleration to avoid dxil.dll errors
            builder.getCefSettings().windowless_rendering_enabled = false;
            builder.addJcefArgs("--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer");

            // Configure the installation directory (cross-platform)
            builder.setInstallDir(installDir);

            // Use a custom handler to register schemes and log events
            builder.setAppHandler(new MavenCefAppHandlerAdapter() {
                @Override
                public void onRegisterCustomSchemes(org.cef.callback.CefSchemeRegistrar registrar) {
                    // 1. We MUST register the scheme name as 'standard' and 'local' before
                    // initialization
                    registrar.addCustomScheme("gensynth", true, false, false, false, false, false, false);
                }

                @Override
                public void onContextInitialized() {
                    // 2. Register the factory once the engine is ready
                    CefApp.getInstance().registerSchemeHandlerFactory("gensynth", "app",
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
