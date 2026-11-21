package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.databind.JsonNode;
import org.java_websocket.WebSocket;

import java.io.IOException;

/**
 * Functional interface for handling WebSocket and JCEF bridge commands.
 */
@FunctionalInterface
public interface CommandHandler {

    /**
     * Handles a specific command sent from the UI.
     *
     * @param conn The WebSocket connection (could be virtual DesktopBridgeSocket).
     * @param payload The JSON payload associated with the command.
     * @param commandId The unique identifier of the command.
     * @throws IOException if the command or its answer cannot be (de)serialized.
     */
    void handle(WebSocket conn, JsonNode payload, String commandId) throws IOException;
}
