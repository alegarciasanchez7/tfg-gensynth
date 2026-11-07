package com.gensynth.core.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Asks a GenSynth application that is already open to open a project in its window
 * (REQUEST_OPEN_PROJECT). Used by the {@code edit} command of the command line and by a second
 * launch of the application (a double click on a project file while it is open), so only one
 * window edits the projects.
 */
public final class OpenProjectClient {

    /** What happened with the request. */
    public enum Outcome {
        /** The open application received the project. */
        SENT,
        /** No GenSynth application answered: none is open. */
        NOT_RUNNING
    }

    private static final ObjectMapper JSON = new ObjectMapper();

    private OpenProjectClient() {
    }

    /**
     * @param host          host of the open application (see {@code AppConfig})
     * @param port          port of the open application
     * @param filePath      absolute path of the project file, or null for a new project
     * @param timeoutMillis how long to wait to connect, and then for the answer
     * @return whether the open application received the project
     * @throws IllegalStateException if the open application rejects it, with its reason (e.g.
     *                               an invalid project file, or no window in browser mode)
     */
    public static Outcome send(String host, int port, String filePath, long timeoutMillis) {
        if (!listening(host, port)) {
            return Outcome.NOT_RUNNING;
        }
        String commandId = "open-" + UUID.randomUUID();
        CompletableFuture<JsonNode> answer = new CompletableFuture<>();
        WebSocketClient client = new WebSocketClient(URI.create("ws://" + host + ":" + port)) {
            @Override
            public void onOpen(ServerHandshake handshake) {
                // The request is sent once the connection is up (below)
            }

            @Override
            public void onMessage(String message) {
                try {
                    JsonNode root = JSON.readTree(message);
                    String type = root.path("type").asText();
                    // Other messages (greetings, traces, broadcasts) also reach this connection
                    if (commandId.equals(root.path("commandId").asText())
                            && ("CONNECTION_STATUS".equals(type) || "ERROR".equals(type))) {
                        answer.complete(root);
                    }
                } catch (Exception ignored) {
                    // Not a message for this request
                }
            }

            @Override
            public void onClose(int code, String reason, boolean remote) {
                answer.completeExceptionally(new IllegalStateException("GenSynth closed the connection"));
            }

            @Override
            public void onError(Exception ex) {
                // A failed connection also ends in onClose
            }
        };
        try {
            if (!client.connectBlocking(timeoutMillis, TimeUnit.MILLISECONDS)) {
                return Outcome.NOT_RUNNING;
            }
            client.send(request(commandId, filePath));
            JsonNode response = answer.get(timeoutMillis, TimeUnit.MILLISECONDS);
            if ("ERROR".equals(response.path("type").asText())) {
                throw new IllegalStateException(explain(response.path("payload")));
            }
            return Outcome.SENT;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while asking GenSynth to open the project", e);
        } catch (TimeoutException e) {
            throw new IllegalStateException("GenSynth is open but did not answer", e);
        } catch (ExecutionException e) {
            throw new IllegalStateException(e.getCause().getMessage(), e.getCause());
        } finally {
            client.close();
        }
    }

    /**
     * A port that is listening accepts at once, so a short timeout is enough. It saves the wait
     * for a closed port on Windows, which retries for about two seconds before giving up.
     */
    private static boolean listening(String host, int port) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 300);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * @param error payload of the ERROR answer
     * @return why the open application rejected the request, for the user
     */
    static String explain(JsonNode error) {
        if ("UNSUPPORTED_COMMAND".equals(error.path("code").asText())) {
            // An older version that cannot open projects sent from outside
            return "The open GenSynth window is an older version: close it and try again";
        }
        return error.path("message").asText("GenSynth rejected the project");
    }

    private static String request(String commandId, String filePath) {
        Map<String, Object> payload = new LinkedHashMap<>();
        if (filePath != null) {
            payload.put("filePath", filePath);
        }
        Map<String, Object> command = new LinkedHashMap<>();
        command.put("type", "REQUEST_OPEN_PROJECT");
        command.put("commandId", commandId);
        command.put("protocolVersion", "1.0.0");
        command.put("payload", payload);
        try {
            return JSON.writeValueAsString(command);
        } catch (Exception e) {
            throw new IllegalStateException("Cannot build the request", e);
        }
    }
}
