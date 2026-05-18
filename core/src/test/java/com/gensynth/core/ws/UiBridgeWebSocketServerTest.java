package com.gensynth.core.ws;

import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
import com.gensynth.core.persistence.StateRepository;
import org.junit.Test;

import java.lang.reflect.Field;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import org.java_websocket.WebSocket;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.mockito.ArgumentCaptor;

public class UiBridgeWebSocketServerTest {

    @Test
    public void createFlowPersistsConnectorConfigFromPayload() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-ws-test-");
        StateRepository repository = new JsonStateRepositoryImpl(tempDir.toString());

        // Pre-create the group needed for the flow via repository
        repository.saveGroups(List.of(new com.gensynth.core.model.GroupDefinition("g-rabbit", "Rabbit Group", "Test Description", 1, "parallel")));

        UiBridgeWebSocketServer server = new UiBridgeWebSocketServer(
                new InetSocketAddress("localhost", 0),
                new ConnectorCatalogService(),
                repository,
                new PluginInstallerImpl(tempDir));

        String command = """
                {
                  "id": "cmd-create-flow-1",
                  "type": "CREATE_FLOW",
                  "protocolVersion": "1.0.0",
                  "payload": {
                    "groupId": "g-rabbit",
                    "name": "File Flow Test",
                    "technology": "file",
                    "host": "localhost",
                    "port": 9999,
                    "topic": "test.file",
                    "interval": 1000,
                    "burst": 1,
                    "template": "{\\\"value\\\":{{n}}}",
                    "connectorConfig": {
                      "outputDir": "./outputs-e2e",
                      "format": "txt",
                      "fileName": "flow_test_output"
                    }
                  }
                }
                """;

        // 1. Send LOAD_STATE to populate memory from repository
        server.onMessage(null, "{\"type\":\"LOAD_STATE\",\"commandId\":\"cmd-load\",\"protocolVersion\":\"1.0.0\",\"payload\":{}}");

        // 2. Send CREATE_FLOW command
        server.onMessage(null, command);

        Field groupsField = UiBridgeWebSocketServer.class.getDeclaredField("groupsById");
        groupsField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Object> groups = (Map<String, Object>) groupsField.get(server);

        Object groupRuntime = groups.get("g-rabbit");
        assertNotNull(groupRuntime);

        Field flowsField = groupRuntime.getClass().getDeclaredField("flows");
        flowsField.setAccessible(true);
        @SuppressWarnings("unchecked")
        List<Object> flows = (List<Object>) flowsField.get(groupRuntime);

        Object created = flows.stream().filter(flow -> {
            try {
                Field nameField = flow.getClass().getDeclaredField("name");
                nameField.setAccessible(true);
                return "File Flow Test".equals(nameField.get(flow));
            } catch (Exception e) {
                return false;
            }
        }).findFirst().orElse(null);

        assertNotNull("Expected created flow in runtime state", created);

        Field cfgField = created.getClass().getDeclaredField("connectorConfig");
        cfgField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Object> cfg = (Map<String, Object>) cfgField.get(created);

        assertEquals("./outputs-e2e", cfg.get("outputDir"));
        assertEquals("txt", cfg.get("format"));
        assertEquals("flow_test_output", cfg.get("fileName"));
    }

    @Test
    public void handleCommandCorrelatesCommandIdInResponse() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-ws-test-initial-");
        StateRepository repository = new JsonStateRepositoryImpl(tempDir.toString());
        
        UiBridgeWebSocketServer server = new UiBridgeWebSocketServer(
                new InetSocketAddress("localhost", 0),
                new ConnectorCatalogService(),
                repository,
                new PluginInstallerImpl(tempDir));
        WebSocket mockConn = mock(WebSocket.class);
        when(mockConn.isOpen()).thenReturn(true);

        String commandId = "test-command-id-123";
        String command = "{\"type\":\"GET_INITIAL_STATE\",\"commandId\":\"" + commandId
                + "\",\"protocolVersion\":\"1.0.0\"}";

        server.onMessage(mockConn, command);

        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        // Should send TRACE_EVENT (START), INITIAL_STATE, TRACE_EVENT (END)
        verify(mockConn, atLeastOnce()).send(captor.capture());

        List<String> sentMessages = captor.getAllValues();
        boolean foundInitialStateWithCommandId = false;
        boolean foundStartTrace = false;
        boolean foundEndTrace = false;

        ObjectMapper mapper = new ObjectMapper();
        for (String msg : sentMessages) {
            JsonNode root = mapper.readTree(msg);
            String type = root.path("type").asText();
            if ("INITIAL_STATE".equals(type)) {
                if (commandId.equals(root.path("commandId").asText())) {
                    foundInitialStateWithCommandId = true;
                }
            } else if ("TRACE_EVENT".equals(type)) {
                JsonNode payload = root.path("payload");
                if (commandId.equals(payload.path("commandId").asText())) {
                    if ("START".equals(payload.path("type").asText()))
                        foundStartTrace = true;
                    if ("END".equals(payload.path("type").asText()))
                        foundEndTrace = true;
                }
            }
        }

        assertTrue("INITIAL_STATE should have correlated commandId", foundInitialStateWithCommandId);
        assertTrue("Should have sent START trace", foundStartTrace);
        assertTrue("Should have sent END trace", foundEndTrace);
    }

    @Test
    public void variableUpdateAndAutoRecoveryWorksCorrectly() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-ws-test-var-");
        StateRepository repository = new JsonStateRepositoryImpl(tempDir.toString());

        UiBridgeWebSocketServer server = new UiBridgeWebSocketServer(
                new InetSocketAddress("localhost", 0),
                new ConnectorCatalogService(),
                repository,
                new PluginInstallerImpl(tempDir));

        WebSocket mockConn = mock(WebSocket.class);
        when(mockConn.isOpen()).thenReturn(true);

        // 1. CREATE_VARIABLE with config
        String createCmd = """
                {
                  "id": "cmd-create-var-1",
                  "type": "CREATE_VARIABLE",
                  "protocolVersion": "1.0.0",
                  "payload": {
                    "variableId": "var-numeric-1",
                    "name": "numeric_test",
                    "type": "numeric",
                    "scope": "global",
                    "config": {
                      "min": 5,
                      "max": 25,
                      "precision": "INTEGER"
                    }
                  }
                }
                """;
        server.onMessage(mockConn, createCmd);

        Field varsField = UiBridgeWebSocketServer.class.getDeclaredField("variablesById");
        varsField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, com.gensynth.core.model.Variable> variables = (Map<String, com.gensynth.core.model.Variable>) varsField.get(server);

        com.gensynth.core.model.Variable createdVar = variables.get("var-numeric-1");
        assertNotNull(createdVar);
        assertEquals("numeric_test", createdVar.getName());
        assertEquals("numeric", createdVar.getType());
        assertEquals(5, ((Number) createdVar.getConfig().get("min")).intValue());
        assertEquals(25, ((Number) createdVar.getConfig().get("max")).intValue());

        // 2. UPDATE_VARIABLE with new config
        String updateCmd = """
                {
                  "id": "cmd-update-var-1",
                  "type": "UPDATE_VARIABLE",
                  "protocolVersion": "1.0.0",
                  "payload": {
                    "variableId": "var-numeric-1",
                    "name": "numeric_test_updated",
                    "type": "numeric",
                    "scope": "global",
                    "config": {
                      "min": 10,
                      "max": 50,
                      "precision": "INTEGER"
                    }
                  }
                }
                """;
        server.onMessage(mockConn, updateCmd);

        com.gensynth.core.model.Variable updatedVar = variables.get("var-numeric-1");
        assertNotNull(updatedVar);
        assertEquals("numeric_test_updated", updatedVar.getName());
        assertEquals(10, ((Number) updatedVar.getConfig().get("min")).intValue());
        assertEquals(50, ((Number) updatedVar.getConfig().get("max")).intValue());

        // 3. Test Auto-recovery of legacy payload (config is empty, but defaultValue is json string)
        java.util.Map<String, Object> legacyPayload = new java.util.HashMap<>();
        legacyPayload.put("id", "var-legacy-1");
        legacyPayload.put("name", "legacy_var");
        legacyPayload.put("type", "numeric");
        legacyPayload.put("scope", "GLOBAL");
        legacyPayload.put("defaultValue", "{\"min\":12,\"max\":99}");
        legacyPayload.put("config", java.util.Map.of());

        com.gensynth.core.model.Variable legacyVar = com.gensynth.core.model.Variable.fromPayload(legacyPayload);
        assertNotNull(legacyVar);
        assertNotNull(legacyVar.getConfig());
        assertEquals(12, ((Number) legacyVar.getConfig().get("min")).intValue());
        assertEquals(99, ((Number) legacyVar.getConfig().get("max")).intValue());
    }
}
