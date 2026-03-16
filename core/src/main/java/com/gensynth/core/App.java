package com.gensynth.core;

import com.gensynth.core.config.AppConfig;

/**
 * Punto de entrada principal de Gen-Synth Core.
 * Orquesta la inicialización y ejecución del sistema.
 */
public class App {

    private AppConfig config;

    private App() {
        this.config = new AppConfig();
    }

    /**
     * Inicializa la aplicación.
     */
    private void initialize() {
        System.out.println("Gen-Synth Core initializing...");
        System.out.println("WebSocket Server: " + config.getWebsocketHost() + ":" + config.getWebsocketPort());
    }

    /**
     * Inicia la aplicación.
     */
    private void start() {
        System.out.println("Gen-Synth Core started successfully!");
    }

    /**
     * Detiene la aplicación.
     */
    private void stop() {
        System.out.println("Gen-Synth Core stopped.");
    }

    public static void main(String[] args) {
        App app = new App();
        app.initialize();
        app.start();

        // Graceful shutdown
        Runtime.getRuntime().addShutdownHook(new Thread(app::stop));
    }
}
