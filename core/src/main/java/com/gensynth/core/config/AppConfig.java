package com.gensynth.core.config;

/**
 * Configuración central de la aplicación.
 */
public class AppConfig {

    private static final String DEFAULT_WEBSOCKET_HOST = "localhost";
    private static final int DEFAULT_WEBSOCKET_PORT = 8080;

    private String websocketHost;
    private int websocketPort;

    public AppConfig() {
        this.websocketHost = DEFAULT_WEBSOCKET_HOST;
        this.websocketPort = DEFAULT_WEBSOCKET_PORT;
    }

    public String getWebsocketHost() {
        return websocketHost;
    }

    public void setWebsocketHost(String websocketHost) {
        this.websocketHost = websocketHost;
    }

    public int getWebsocketPort() {
        return websocketPort;
    }

    public void setWebsocketPort(int websocketPort) {
        this.websocketPort = websocketPort;
    }
}
