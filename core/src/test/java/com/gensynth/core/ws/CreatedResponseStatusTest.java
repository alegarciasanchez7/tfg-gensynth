package com.gensynth.core.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
import org.java_websocket.WebSocket;
import org.junit.Before;
import org.junit.Test;

import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The CREATE_* responses carry the created entity, which the UI maps directly: the generic
 * {@code status: "ok"} must never overwrite the entity's own status (a new group is "stopped").
 */
public class CreatedResponseStatusTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final List<JsonNode> sent = new ArrayList<>();
    private UiBridgeWebSocketServer server;
    private WebSocket conn;
    private int commandCounter;

    @Before
    public void setUp() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-created-");
        server = new UiBridgeWebSocketServer(
                new InetSocketAddress("localhost", 0),
                new ConnectorCatalogService(),
                new JsonStateRepositoryImpl(tempDir.toString()),
                new PluginInstallerImpl(tempDir));
        conn = mock(WebSocket.class);
        when(conn.isOpen()).thenReturn(true);
        doAnswer(invocation -> {
            sent.add(mapper.readTree(invocation.<String>getArgument(0)));
            return null;
        }).when(conn).send(anyString());
    }

    @Test
    public void groupCreatedResponseKeepsTheGroupStatus() throws Exception {
        JsonNode payload = send("CREATE_GROUP", Map.of("groupId", "g1", "name", "Plant", "clientRequestId", "tmp-1"));

        assertEquals("stopped", payload.path("status").asText());
        assertEquals("group_created", payload.path("result").asText());
        assertEquals("g1", payload.path("id").asText());
        assertEquals("Plant", payload.path("name").asText());
        assertEquals("tmp-1", payload.path("clientRequestId").asText());
    }

    @Test
    public void flowCreatedResponseIsOk() throws Exception {
        send("CREATE_GROUP", Map.of("groupId", "g1", "name", "Plant"));

        JsonNode payload = send("CREATE_FLOW", Map.of("groupId", "g1", "name", "Sensor", "technology", "file"));

        assertEquals("ok", payload.path("status").asText());
        assertEquals("flow_created", payload.path("result").asText());
        assertEquals("Sensor", payload.path("name").asText());
    }

    @Test
    public void variableCreatedResponseIsOk() throws Exception {
        JsonNode payload = send("CREATE_VARIABLE", Map.of("name", "temp", "type", "numeric", "scope", "global"));

        assertEquals("ok", payload.path("status").asText());
        assertEquals("variable_created", payload.path("result").asText());
        assertEquals("temp", payload.path("name").asText());
    }

    /** Sends a command and returns the payload of the CONNECTION_STATUS response it produced. */
    private JsonNode send(String type, Map<String, Object> payload) throws Exception {
        sent.clear();
        String commandId = "cmd-" + (++commandCounter);
        Map<String, Object> command = new LinkedHashMap<>();
        command.put("type", type);
        command.put("commandId", commandId);
        command.put("protocolVersion", "1.0.0");
        command.put("payload", payload);
        server.onMessage(conn, mapper.writeValueAsString(command));
        for (JsonNode message : sent) {
            if ("CONNECTION_STATUS".equals(message.path("type").asText())
                    && commandId.equals(message.path("commandId").asText())) {
                return message.path("payload");
            }
        }
        throw new AssertionError("No CONNECTION_STATUS response for " + type + ": " + sent);
    }
}
