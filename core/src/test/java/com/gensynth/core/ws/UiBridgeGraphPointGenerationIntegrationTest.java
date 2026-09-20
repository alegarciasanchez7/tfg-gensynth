package com.gensynth.core.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.flow.TemplateEngine;
import com.gensynth.core.model.GroupDefinition;
import com.gensynth.core.model.Variable;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
import com.gensynth.core.persistence.StateRepository;
import org.java_websocket.WebSocket;
import org.junit.Before;
import org.junit.Test;

import java.lang.reflect.Field;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

/**
 * End-to-end integration tests verifying that Point variables and Graph Route configurations
 * received from the User Interface (via WebSocket UI Bridge commands) are correctly stored,
 * deserialized, and evaluated into generated data payloads.
 */
public class UiBridgeGraphPointGenerationIntegrationTest {

    private UiBridgeWebSocketServer server;
    private StateRepository repository;
    private ObjectMapper objectMapper;

    @Before
    public void setUp() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-ws-graph-test-");
        repository = new JsonStateRepositoryImpl(tempDir.toString());
        objectMapper = new ObjectMapper();

        // Initialize group definition
        repository.saveGroups(List.of(new GroupDefinition("g-monitoring", "Elderly Monitoring", "Test Group", 1, "parallel")));

        server = new UiBridgeWebSocketServer(
                new InetSocketAddress("localhost", 0),
                new ConnectorCatalogService(),
                repository,
                new PluginInstallerImpl(tempDir)
        );

        // Load initial state
        server.onMessage(null, "{\"type\":\"LOAD_STATE\",\"commandId\":\"cmd-load\",\"protocolVersion\":\"1.0.0\",\"payload\":{}}");
    }

    @Test
    public void testUiBridgeGraphRoutePointVariableCreationAndGeneration() throws Exception {
        WebSocket mockConn = mock(WebSocket.class);
        when(mockConn.isOpen()).thenReturn(true);

        // 1. Send CREATE_VARIABLE from UI with Graph Route geospatial config (including localized comma string "0,9")
        String createVarCommand = """
                {
                  "id": "cmd-create-var-point",
                  "type": "CREATE_VARIABLE",
                  "protocolVersion": "1.0.0",
                  "payload": {
                    "variableId": "var-position-1",
                    "name": "position",
                    "type": "point",
                    "scope": "local",
                    "flowId": "f-monitor-1",
                    "groupId": "g-monitoring",
                    "config": {
                      "coordinateSystem": "GEOSPATIAL",
                      "geospatialFormat": "DECIMAL_DEGREES",
                      "pattern": "GRAPH_ROUTE",
                      "graphNavigationMode": "RANDOM_NEIGHBOR",
                      "graphStopProbability": "0,9",
                      "graphStopTicks": "5",
                      "graphInterpolationSteps": "3",
                      "graphPreventCycles": true,
                      "graphNodes": [
                        { "id": "node-reception", "name": "Hospital Reception", "lat": 36.5386, "lon": -6.2020, "alt": 0.0 },
                        { "id": "node-room101", "name": "Patient Room 101", "lat": 36.5390, "lon": -6.2015, "alt": 0.0 }
                      ],
                      "graphEdges": [
                        { "id": "edge-hosp-1", "fromNodeId": "node-reception", "toNodeId": "node-room101", "bidirectional": true }
                      ]
                    }
                  }
                }
                """;
        server.onMessage(mockConn, createVarCommand);

        // Verify variable was parsed and stored in WebSocket server variablesById
        Field varsField = UiBridgeWebSocketServer.class.getDeclaredField("variablesById");
        varsField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Variable> variables = (Map<String, Variable>) varsField.get(server);

        Variable positionVar = variables.get("var-position-1");
        assertNotNull("Position variable should exist in runtime state", positionVar);
        assertEquals("position", positionVar.getName());
        assertEquals("point", positionVar.getType());

        // 2. Evaluate template containing sub-property placeholders received from UI Message Format
        TemplateEngine templateEngine = new TemplateEngine();
        String messageFormatTemplate = """
                {
                  "resident_id": "OLDMAN-001",
                  "location_name": "{{local.position.nodeName}}",
                  "target_name": "{{local.position.targetNodeName}}",
                  "step_in_edge": {{local.position.stepInEdge}},
                  "total_steps": {{local.position.totalEdgeSteps}},
                  "is_paused": {{local.position.isPaused}},
                  "latitude": {{local.position.latitude}},
                  "longitude": {{local.position.longitude}}
                }
                """;

        String evaluatedResult = templateEngine.evaluate(messageFormatTemplate, 1L, variables, "f-monitor-1", "g-monitoring");
        assertNotNull(evaluatedResult);

        JsonNode root = objectMapper.readTree(evaluatedResult);
        assertEquals("OLDMAN-001", root.path("resident_id").asText());
        assertEquals("Hospital Reception", root.path("location_name").asText());
        assertEquals(3, root.path("total_steps").asInt());
        assertEquals(36.5386, root.path("latitude").asDouble(), 0.001);
        assertEquals(-6.2020, root.path("longitude").asDouble(), 0.001);
    }

    @Test
    public void testFullPointVariableTemplateEvaluationProducesValidJson() throws Exception {
        WebSocket mockConn = mock(WebSocket.class);
        when(mockConn.isOpen()).thenReturn(true);

        String createVarCommand = """
                {
                  "id": "cmd-create-var-cartesian",
                  "type": "CREATE_VARIABLE",
                  "protocolVersion": "1.0.0",
                  "payload": {
                    "variableId": "var-cart-1",
                    "name": "cartesian_pos",
                    "type": "point",
                    "scope": "local",
                    "flowId": "f-monitor-2",
                    "groupId": "g-monitoring",
                    "config": {
                      "coordinateSystem": "CARTESIAN_2D",
                      "pattern": "FIXED_POINT",
                      "fixedPoint": { "x": 120.5, "y": 450.0, "z": 0.0 }
                    }
                  }
                }
                """;
        server.onMessage(mockConn, createVarCommand);

        Field varsField = UiBridgeWebSocketServer.class.getDeclaredField("variablesById");
        varsField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Variable> variables = (Map<String, Variable>) varsField.get(server);

        TemplateEngine templateEngine = new TemplateEngine();

        // Test 1: Full variable placeholder {{local.cartesian_pos}} (no sub-property)
        String fullPointTemplate = "{\"position\": {{local.cartesian_pos}}}";
        String fullResult = templateEngine.evaluate(fullPointTemplate, 1L, variables, "f-monitor-2", "g-monitoring");

        JsonNode fullJson = objectMapper.readTree(fullResult);
        assertTrue("Output should be valid JSON containing position object", fullJson.has("position"));
        assertEquals(120.5, fullJson.path("position").path("x").asDouble(), 0.001);
        assertEquals(450.0, fullJson.path("position").path("y").asDouble(), 0.001);

        // Test 2: Specific sub-property {{local.cartesian_pos.x}}
        String subPropTemplate = "{\"x_val\": {{local.cartesian_pos.x}}, \"y_val\": {{local.cartesian_pos.y}}}";
        String subPropResult = templateEngine.evaluate(subPropTemplate, 1L, variables, "f-monitor-2", "g-monitoring");

        JsonNode subPropJson = objectMapper.readTree(subPropResult);
        assertEquals(120.5, subPropJson.path("x_val").asDouble(), 0.001);
        assertEquals(450.0, subPropJson.path("y_val").asDouble(), 0.001);
    }
}

