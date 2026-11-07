package com.gensynth.core.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.model.Variable;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.java_websocket.WebSocket;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;

import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * START_SYSTEM is all or nothing: when one group cannot start (here, an invalid time zone),
 * no group starts, no file is created and the error names the variable as the user sees it.
 */
public class StartValidationTest {

    private static final String VARIABLE_ID = "3d198b59-0000-4000-8000-000000000001";

    private UiBridgeWebSocketServer server;
    private GroupRuntime valid;
    private GroupRuntime invalid;
    private Path tempDir;

    @Before
    public void setUp() throws Exception {
        tempDir = Files.createTempDirectory("gensynth-start-validation-");
        server = new UiBridgeWebSocketServer(
                new InetSocketAddress("localhost", 0),
                new ConnectorCatalogService(),
                new JsonStateRepositoryImpl(tempDir.toString()),
                new PluginInstallerImpl(tempDir));

        valid = newGroup("g1", "Plant A", "f1");
        invalid = newGroup("g2", "Plant B", "f2");
        server.variablesById.put(VARIABLE_ID, new Variable(VARIABLE_ID, "date", "GROUP", "temporal", "",
                Map.of("timeZone", "Mars/Olympus"), null, invalid.id));
    }

    @After
    public void tearDown() {
        server.shutdown();
    }

    @Test
    public void anInvalidGroupStopsTheWholeStartAndNamesTheVariable() throws Exception {
        WebSocket conn = mock(WebSocket.class);
        when(conn.isOpen()).thenReturn(true);

        server.onMessage(conn, "{\"type\":\"START_SYSTEM\",\"commandId\":\"cmd-start\",\"protocolVersion\":\"1.0.0\",\"payload\":{}}");

        JsonNode error = lastError(conn);
        assertNotNull("START_SYSTEM must be rejected", error);
        String message = error.path("payload").path("message").asText();
        assertTrue(message, message.contains("variable 'date'"));
        assertTrue(message, message.contains("Mars/Olympus"));
        assertFalse(message, message.contains(VARIABLE_ID));

        assertFalse(server.systemRunning);
        assertNotEquals("running", valid.status);
        assertNotEquals("running", invalid.status);
        assertTrue(server.connectorByFlowId.isEmpty());
        assertFalse("no output file may be created", Files.exists(tempDir.resolve("Plant A")));
    }

    @Test
    public void theSystemStartsOnceTheVariableIsFixed() throws Exception {
        server.variablesById.put(VARIABLE_ID, new Variable(VARIABLE_ID, "date", "GROUP", "temporal", "",
                Map.of("timeZone", "Europe/Madrid"), null, invalid.id));

        server.onMessage(null, "{\"type\":\"START_SYSTEM\",\"commandId\":\"cmd-start\",\"protocolVersion\":\"1.0.0\",\"payload\":{}}");

        assertTrue(server.systemRunning);
        assertEquals("running", valid.status);
        assertEquals("running", invalid.status);
        server.onMessage(null, "{\"type\":\"STOP_SYSTEM\",\"commandId\":\"cmd-stop\",\"protocolVersion\":\"1.0.0\",\"payload\":{}}");
    }

    private GroupRuntime newGroup(String id, String name, String flowId) {
        GroupRuntime group = new GroupRuntime(id, name, "stopped", "", 1, "parallel", true);
        FlowRuntime flow = new FlowRuntime(flowId, "Sensor", "file", "disconnected", 0, 0, false, null,
                1000, 1, "", "", 0, "{}", "json", true, Map.of());
        flow.connectorConfig = Map.of("outputDir", tempDir.toString());
        group.flows.add(flow);
        server.groupsById.put(group.id, group);
        return group;
    }

    private static JsonNode lastError(WebSocket conn) throws Exception {
        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(conn, atLeastOnce()).send(captor.capture());
        ObjectMapper mapper = new ObjectMapper();
        JsonNode error = null;
        for (String sent : captor.getAllValues()) {
            JsonNode message = mapper.readTree(sent);
            if ("ERROR".equals(message.path("type").asText())) {
                error = message;
            }
        }
        return error;
    }
}
