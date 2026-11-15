package com.gensynth.core.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
import org.java_websocket.WebSocket;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;

import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * UPDATE_VARIABLE sends the UI only the variable that changed ({@code VARIABLE_CHANGED}), not
 * every variable again (issue #37); creating and deleting still send the whole list.
 */
public class VariableChangedBroadcastTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private UiBridgeWebSocketServer server;
    private WebSocket ui;

    @Before
    public void setUp() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-variable-changed-");
        server = new UiBridgeWebSocketServer(new InetSocketAddress("localhost", 0),
                new ConnectorCatalogService(), new JsonStateRepositoryImpl(tempDir.toString()),
                new PluginInstallerImpl(tempDir));
        ui = mock(WebSocket.class);
        when(ui.isOpen()).thenReturn(true);
        server.desktopSocket.set(ui);
        createVariable("v1", "speed");
        createVariable("v2", "other");
        clearInvocations(ui);
    }

    @After
    public void tearDown() {
        server.shutdown();
    }

    @Test
    public void updateSendsOnlyTheChangedVariable() throws Exception {
        server.onMessage(ui, command("UPDATE_VARIABLE", "cmd-update",
                "\"variableId\":\"v1\",\"name\":\"speed_kmh\",\"type\":\"numeric\",\"scope\":\"global\","
                        + "\"config\":{\"min\":0,\"max\":120}"));

        List<JsonNode> sent = sentMessages();
        assertFalse("no full list after an update", hasType(sent, "VARIABLE_UPDATE"));
        JsonNode changed = sent.stream().filter(m -> "VARIABLE_CHANGED".equals(m.path("type").asText()))
                .findFirst().orElseThrow().path("payload");
        assertEquals("v1", changed.path("id").asText());
        assertEquals("speed_kmh", changed.path("name").asText());
        // Same normalization as the list: lower-case scope
        assertEquals("global", changed.path("scope").asText());
        assertEquals(120, changed.path("config").path("max").asInt());
    }

    @Test
    public void temporalVariablesAreSentWithTheUiType() throws Exception {
        server.onMessage(ui, command("UPDATE_VARIABLE", "cmd-update-date",
                "\"variableId\":\"v1\",\"name\":\"when\",\"type\":\"temporal\",\"scope\":\"global\",\"config\":{}"));

        JsonNode changed = sentMessages().stream().filter(m -> "VARIABLE_CHANGED".equals(m.path("type").asText()))
                .findFirst().orElseThrow().path("payload");
        assertEquals("temporal", changed.path("type").asText());
    }

    @Test
    public void aRejectedUpdateSendsNoVariable() throws Exception {
        server.onMessage(ui, command("UPDATE_VARIABLE", "cmd-update-missing",
                "\"variableId\":\"nobody\",\"name\":\"x\",\"type\":\"numeric\",\"scope\":\"global\""));

        List<JsonNode> sent = sentMessages();
        assertFalse(hasType(sent, "VARIABLE_CHANGED"));
        assertTrue(hasType(sent, "ERROR"));
    }

    @Test
    public void createAndDeleteStillSendTheWholeList() throws Exception {
        server.onMessage(ui, command("DELETE_VARIABLE", "cmd-delete", "\"variableId\":\"v2\""));

        JsonNode list = sentMessages().stream().filter(m -> "VARIABLE_UPDATE".equals(m.path("type").asText()))
                .findFirst().orElseThrow().path("payload");
        assertEquals(1, list.size());
        assertEquals("v1", list.get(0).path("id").asText());
    }

    private void createVariable(String id, String name) {
        server.onMessage(ui, command("CREATE_VARIABLE", "cmd-create-" + id,
                "\"variableId\":\"" + id + "\",\"name\":\"" + name + "\",\"type\":\"numeric\",\"scope\":\"global\","
                        + "\"config\":{\"min\":0,\"max\":10}"));
    }

    private List<JsonNode> sentMessages() throws Exception {
        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(ui, atLeastOnce()).send(captor.capture());
        List<JsonNode> messages = new ArrayList<>();
        for (String raw : captor.getAllValues()) {
            messages.add(JSON.readTree(raw));
        }
        return messages;
    }

    private static boolean hasType(List<JsonNode> messages, String type) {
        return messages.stream().anyMatch(m -> type.equals(m.path("type").asText()));
    }

    private static String command(String type, String commandId, String payloadFields) {
        return "{\"type\":\"" + type + "\",\"commandId\":\"" + commandId
                + "\",\"protocolVersion\":\"1.0.0\",\"payload\":{" + payloadFields + "}}";
    }
}
