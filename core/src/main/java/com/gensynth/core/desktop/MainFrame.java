package com.gensynth.core.desktop;

import com.gensynth.core.desktop.bridge.GensynthMessageRouter;
import org.cef.CefApp;
import org.cef.CefClient;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.browser.CefMessageRouter;
import org.cef.handler.CefLoadHandlerAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.swing.*;
import java.awt.*;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;

/**
 * Main window of the Gen-Synth Desktop application.
 * Hosts the Chromium browser component.
 */
public class MainFrame extends JFrame {
    private static final Logger logger = LoggerFactory.getLogger(MainFrame.class);
    
    private final CefClient client;
    private final CefBrowser browser;
    private final Component browserUI;
    private final CefMessageRouter messageRouter;

    @SuppressWarnings("deprecation")
    public MainFrame(String title, String initialUrl, CefApp cefApp) {
        super(title);

        logger.info("Creating MainFrame for URL: {}", initialUrl);

        // 1. Create a client instance to handle browser events
        this.client = cefApp.createClient();

        // 2. Configure the Message Router (The Bridge)
        CefMessageRouter.CefMessageRouterConfig config = new CefMessageRouter.CefMessageRouterConfig();
        // These keys must match what we inject in JavaScript
        config.jsQueryFunction = "cefQuery";
        config.jsCancelFunction = "cefQueryCancel";
        this.messageRouter = CefMessageRouter.create(config);
        this.messageRouter.addHandler(new GensynthMessageRouter(this), true);
        this.client.addMessageRouter(this.messageRouter);
        
        // Log all browser console and JavaScript messages to Java SLF4J logger
        this.client.addDisplayHandler(new org.cef.handler.CefDisplayHandlerAdapter() {
            @Override
            public boolean onConsoleMessage(CefBrowser browser, org.cef.CefSettings.LogSeverity level, String message, String source, int line) {
                logger.info("[BROWSER CONSOLE] [{}] {} [source: {}, line: {}]", level, message, source, line);
                return false;
            }
        });

        // 3. Inject the javaBridge object into the UI
        setupBridgeInjection();

        // 4. Create the browser instance (Windowed Rendering)
        this.browser = client.createBrowser(initialUrl, false, false);
        this.browserUI = browser.getUIComponent();

        // 3. Configure the Window layout
        configureLayout();

        // 4. Handle Window events
        addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent e) {
                logger.info("Closing MainFrame...");
                // In Phase 3, we will add a check for unsaved changes via the bridge
                dispose();
                System.exit(0);
            }
        });
    }

    private void setupBridgeInjection() {
        this.client.addLoadHandler(new CefLoadHandlerAdapter() {
            @Override
            public void onLoadStart(CefBrowser browser, CefFrame frame, org.cef.network.CefRequest.TransitionType transitionType) {
                if (frame.isMain()) {
                    logger.info("[BRIDGE] Injecting javaBridge object into UI...");
                    // This script creates the window.javaBridge object expected by React
                    String script = 
                        "window.javaBridge = {" +
                        "  sendToCore: function(msg) { " +
                        "    window.cefQuery({ request: msg, onSuccess: function(r){}, onFailure: function(e,m){} }); " +
                        "  }," +
                        "  postMessage: function(msg) {" +
                        "    return new Promise((resolve, reject) => {" +
                        "      window.cefQuery({" +
                        "        request: msg," +
                        "        onSuccess: function(response) {" +
                        "          try { resolve(JSON.parse(response)); } catch(e) { resolve(response); }" +
                        "        }," +
                        "        onFailure: function(code, msg) {" +
                        "          reject(new Error(msg));" +
                        "        }" +
                        "      });" +
                        "    });" +
                        "  }," +
                        "  registerCallback: function(name, cb) { " +
                        "    if(!window._gensynthCallbacks) window._gensynthCallbacks = {}; " +
                        "    window._gensynthCallbacks[name] = cb; " +
                        "  }" +
                        "};" +
                        "window.onGensynthMessage = function(msg) { " +
                        "  if(window._gensynthCallbacks && window._gensynthCallbacks['onCoreMessage']) { " +
                        "    window._gensynthCallbacks['onCoreMessage'](msg); " +
                        "  } " +
                        "};";
                    browser.executeJavaScript(script, frame.getURL(), 0);
                }
            }
        });
    }

    private void configureLayout() {
        setLayout(new BorderLayout());
        
        // Add the browser component to the center of the frame
        add(browserUI, BorderLayout.CENTER);

        // Window Icon
        try {
            java.net.URL iconURL = getClass().getResource("/img/logo_azul.png");
            if (iconURL != null) {
                setIconImage(new ImageIcon(iconURL).getImage());
            }
        } catch (Exception e) {
            logger.warn("Could not load window icon: {}", e.getMessage());
        }

        // Window properties
        setSize(1280, 800);
        setMinimumSize(new Dimension(800, 600));
        setLocationRelativeTo(null);
        
        // In Phase 4, we will add a custom icon and title bar styling
        setDefaultCloseOperation(JFrame.DO_NOTHING_ON_CLOSE);
    }

    public void showWindow() {
        SwingUtilities.invokeLater(() -> {
            setVisible(true);
            logger.info("Gen-Synth Main Window is now visible.");
        });
    }
}
