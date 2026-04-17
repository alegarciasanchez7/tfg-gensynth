package com.gensynth.core;

import com.gensynth.core.config.AppConfig;
import com.gensynth.core.ws.UiBridgeWebSocketServer;

import java.util.concurrent.CountDownLatch;

/**
 * Punto de entrada principal de Gen-Synth Core.
 * Orquesta la inicialización y ejecución del sistema.
 */
public class App {

    private AppConfig config;
    private UiBridgeWebSocketServer webSocketServer;
    private final CountDownLatch shutdownLatch;

    private App() {
        this.config = new AppConfig();
        this.shutdownLatch = new CountDownLatch(1);
    }

    /**
     * Inicializa la aplicación.
     */
    private void initialize() {
        System.out.println("Gen-Synth Core initializing...");
        System.out.println("WebSocket Server: " + config.getWebsocketHost() + ":" + config.getWebsocketPort());
        this.webSocketServer = new UiBridgeWebSocketServer(config.getWebsocketHost(), config.getWebsocketPort());
    }

    /**
     * Inicia la aplicación.
     */
    private void start() {
        webSocketServer.start();
        System.out.println("Gen-Synth Core started successfully!");
    }

    /**
     * Detiene la aplicación.
     */
    private void stop() {
        if (webSocketServer != null) {
            webSocketServer.shutdown();
        }
        System.out.println("Gen-Synth Core stopped.");
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
        App app = new App();
        Runtime.getRuntime().addShutdownHook(new Thread(app::stop));

        app.initialize();
        app.start();
        app.awaitShutdown();
    }
}
