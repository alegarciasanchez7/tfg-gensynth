package com.gensynth.core.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * E2E Smoke harness for WebSocket bridge validation.
 * Run this to generate evidence of commandId correlation and trace events.
 */
public class SmokeHarness {

    private static final String SERVER_URL = "ws://localhost:8765";
    private static final ObjectMapper mapper = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        System.out.println("Starting Smoke Harness...");
        
        List<String> evidence = new ArrayList<>();
        evidence.add("--- GEN-SYNTH WS SMOKE TEST EVIDENCE ---");
        evidence.add("Timestamp: " + java.time.Instant.now());

        BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        
        WebSocketClient client = new WebSocketClient(new URI(SERVER_URL)) {
            @Override
            public void onOpen(ServerHandshake handshakedata) {
                System.out.println("Connected to server");
            }

            @Override
            public void onMessage(String message) {
                messages.offer(message);
            }

            @Override
            public void onClose(int code, String reason, boolean remote) {
                System.out.println("Disconnected: " + reason);
            }

            @Override
            public void onError(Exception ex) {
                System.err.println("Error: " + ex.getMessage());
            }
        };

        if (!client.connectBlocking(5, TimeUnit.SECONDS)) {
            System.err.println("Could not connect to server at " + SERVER_URL);
            System.exit(1);
        }

        // Test command with commandId
        String commandId = "smoke-cmd-" + UUID.randomUUID().toString().substring(0, 8);
        String command = "{\"type\":\"GET_INITIAL_STATE\",\"commandId\":\"" + commandId + "\",\"protocolVersion\":\"1.0.0\"}";
        
        System.out.println("Sending command: " + commandId);
        client.send(command);

        long deadline = System.currentTimeMillis() + 5000;
        boolean foundResponse = false;
        boolean foundStartTrace = false;
        boolean foundEndTrace = false;

        while (System.currentTimeMillis() < deadline) {
            String msg = messages.poll(1, TimeUnit.SECONDS);
            if (msg == null) continue;

            JsonNode root = mapper.readTree(msg);
            String type = root.path("type").asText();
            String correlatedId = root.path("commandId").asText(null);
            
            evidence.add("Received: " + type + " (commandId: " + correlatedId + ")");

            if (commandId.equals(correlatedId)) {
                if ("INITIAL_STATE".equals(type)) foundResponse = true;
            }
            
            if ("TRACE_EVENT".equals(type)) {
                JsonNode payload = root.path("payload");
                if (commandId.equals(payload.path("commandId").asText())) {
                    String traceType = payload.path("type").asText();
                    if ("START".equals(traceType)) foundStartTrace = true;
                    if ("END".equals(traceType)) foundEndTrace = true;
                }
            }
            
            if (foundResponse && foundStartTrace && foundEndTrace) break;
        }

        evidence.add("--- Results ---");
        evidence.add("Response received: " + foundResponse);
        evidence.add("Start trace received: " + foundStartTrace);
        evidence.add("End trace received: " + foundEndTrace);

        Path evidencePath = Paths.get("SMOKE_EVIDENCE.txt");
        Files.write(evidencePath, evidence);
        System.out.println("Smoke test complete. Evidence saved to " + evidencePath.toAbsolutePath());
        
        client.close();
    }
}
