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

    @Test
    public void importAndExportStateAcksIncludeFilePath() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-ws-test-file-path-");
        StateRepository repository = new JsonStateRepositoryImpl(tempDir.toString());
        UiBridgeWebSocketServer server = new UiBridgeWebSocketServer(
                new InetSocketAddress("localhost", 0),
                new ConnectorCatalogService(),
                repository,
                new PluginInstallerImpl(tempDir));
        WebSocket mockConn = mock(WebSocket.class);
        when(mockConn.isOpen()).thenReturn(true);

        String importCommand = """
                {
                  "type": "IMPORT_STATE",
                  "commandId": "cmd-import",
                  "protocolVersion": "1.0.0",
                  "payload": { "groups": [], "variables": [], "sourceFilePath": "/tmp/project.gsynth" }
                }
                """;
        server.onMessage(mockConn, importCommand);

        Path exportPath = tempDir.resolve("exported.gsynth");
        String exportCommand = "{\"type\":\"EXPORT_STATE\",\"commandId\":\"cmd-export\",\"protocolVersion\":\"1.0.0\","
                + "\"payload\":{\"filePath\":\"" + exportPath.toString().replace("\\", "\\\\") + "\"}}";
        server.onMessage(mockConn, exportCommand);

        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(mockConn, atLeastOnce()).send(captor.capture());

        ObjectMapper mapper = new ObjectMapper();
        JsonNode importAck = null;
        JsonNode exportAck = null;
        for (String msg : captor.getAllValues()) {
            JsonNode root = mapper.readTree(msg);
            if (!"CONNECTION_STATUS".equals(root.path("type").asText())) continue;
            if ("cmd-import".equals(root.path("commandId").asText())) importAck = root.path("payload");
            if ("cmd-export".equals(root.path("commandId").asText())) exportAck = root.path("payload");
        }

        assertNotNull("IMPORT_STATE should be acknowledged", importAck);
        assertEquals("state_imported", importAck.path("result").asText());
        assertEquals("/tmp/project.gsynth", importAck.path("filePath").asText());

        assertNotNull("EXPORT_STATE should be acknowledged", exportAck);
        assertEquals("state_exported", exportAck.path("result").asText());
        assertEquals(exportPath.toString(), exportAck.path("filePath").asText());
        assertTrue("Exported file should exist", Files.exists(exportPath));

        // The exported file must be a valid GenSynth project that can be loaded back
        JsonNode exported = com.gensynth.core.persistence.ProjectFileFormat.read(exportPath, mapper);
        assertEquals(com.gensynth.core.persistence.ProjectFileFormat.FORMAT_ID, exported.path("format").asText());
        assertEquals(com.gensynth.core.persistence.ProjectFileFormat.VERSION, exported.path("version").asText());
    }

    // ============ Tick settings ============

    private static UiBridgeWebSocketServer newServer(Path tempDir, StateRepository repository) {
        return new UiBridgeWebSocketServer(
                new InetSocketAddress("localhost", 0),
                new ConnectorCatalogService(),
                repository,
                new PluginInstallerImpl(tempDir));
    }

    private static List<JsonNode> sentMessages(WebSocket conn) throws Exception {
        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(conn, atLeastOnce()).send(captor.capture());
        ObjectMapper mapper = new ObjectMapper();
        List<JsonNode> messages = new java.util.ArrayList<>();
        for (String msg : captor.getAllValues()) {
            messages.add(mapper.readTree(msg));
        }
        return messages;
    }

    private static JsonNode findMessage(List<JsonNode> messages, String type, String commandId) {
        for (JsonNode message : messages) {
            if (type.equals(message.path("type").asText())
                    && (commandId == null || commandId.equals(message.path("commandId").asText()))) {
                return message;
            }
        }
        return null;
    }

    @Test
    public void updateSettingsAppliesPersistsAndBroadcasts() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-ws-test-settings-");
        StateRepository repository = new JsonStateRepositoryImpl(tempDir.toString());
        UiBridgeWebSocketServer server = newServer(tempDir, repository);
        WebSocket mockConn = mock(WebSocket.class);
        when(mockConn.isOpen()).thenReturn(true);

        server.onMessage(mockConn, """
                {
                  "type": "UPDATE_SETTINGS",
                  "commandId": "cmd-settings",
                  "protocolVersion": "1.0.0",
                  "payload": { "tick": { "mode": "FIXED_RATE", "value": 250, "unit": "MILLISECONDS" } }
                }
                """);

        com.gensynth.core.model.TickSettings expected = new com.gensynth.core.model.TickSettings(
                com.gensynth.core.model.TickSettings.Mode.FIXED_RATE, 250, com.gensynth.core.model.TickSettings.Unit.MILLISECONDS);
        assertEquals(expected, server.tickClock.getSettings());
        assertEquals(expected, repository.loadSettings().getTick());

        // Desktop socket is null and the mock is not a registered connection, so only the ack reaches it
        List<JsonNode> messages = sentMessages(mockConn);
        JsonNode ack = findMessage(messages, "CONNECTION_STATUS", "cmd-settings");
        assertNotNull("UPDATE_SETTINGS should be acknowledged", ack);
        assertEquals("settings_updated", ack.path("payload").path("result").asText());
        assertEquals(250, ack.path("payload").path("settings").path("tick").path("value").asInt());
        server.shutdown();
    }

    @Test
    public void updateSettingsRejectsInvalidTick() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-ws-test-settings-invalid-");
        UiBridgeWebSocketServer server = newServer(tempDir, new JsonStateRepositoryImpl(tempDir.toString()));
        WebSocket mockConn = mock(WebSocket.class);
        when(mockConn.isOpen()).thenReturn(true);

        server.onMessage(mockConn, "{\"type\":\"UPDATE_SETTINGS\",\"commandId\":\"cmd-bad\",\"protocolVersion\":\"1.0.0\","
                + "\"payload\":{\"tick\":{\"mode\":\"FIXED_RATE\",\"value\":0,\"unit\":\"SECONDS\"}}}");
        server.onMessage(mockConn, "{\"type\":\"UPDATE_SETTINGS\",\"commandId\":\"cmd-missing\",\"protocolVersion\":\"1.0.0\",\"payload\":{}}");

        List<JsonNode> messages = sentMessages(mockConn);
        JsonNode badError = findMessage(messages, "ERROR", "cmd-bad");
        assertNotNull(badError);
        assertEquals("INVALID_PAYLOAD", badError.path("payload").path("code").asText());
        assertNotNull(findMessage(messages, "ERROR", "cmd-missing"));
        assertEquals(com.gensynth.core.model.TickSettings.defaults(), server.tickClock.getSettings());
        server.shutdown();
    }

    @Test
    public void initialStateAndMetricsIncludeTickInformation() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-ws-test-initial-settings-");
        UiBridgeWebSocketServer server = newServer(tempDir, new JsonStateRepositoryImpl(tempDir.toString()));
        WebSocket mockConn = mock(WebSocket.class);
        when(mockConn.isOpen()).thenReturn(true);

        server.onMessage(mockConn, "{\"type\":\"GET_INITIAL_STATE\",\"commandId\":\"cmd-init\",\"protocolVersion\":\"1.0.0\"}");

        JsonNode initial = findMessage(sentMessages(mockConn), "INITIAL_STATE", "cmd-init");
        assertNotNull(initial);
        JsonNode tick = initial.path("payload").path("settings").path("tick");
        assertEquals("FIXED_RATE", tick.path("mode").asText());
        assertEquals(1, tick.path("value").asInt());
        assertEquals("SECONDS", tick.path("unit").asText());
        assertTrue(initial.path("payload").path("metrics").has("ticksPerSecond"));
        assertTrue(initial.path("payload").path("metrics").has("totalTicks"));
        server.shutdown();
    }

    @Test
    public void importStateAppliesSettingsAndExportWritesThem() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-ws-test-import-settings-");
        UiBridgeWebSocketServer server = newServer(tempDir, new JsonStateRepositoryImpl(tempDir.toString()));
        WebSocket mockConn = mock(WebSocket.class);
        when(mockConn.isOpen()).thenReturn(true);

        server.onMessage(mockConn, """
                {
                  "type": "IMPORT_STATE",
                  "commandId": "cmd-import-settings",
                  "protocolVersion": "1.0.0",
                  "payload": {
                    "groups": [], "variables": [],
                    "settings": { "tick": { "mode": "AS_FAST_AS_POSSIBLE", "value": 2, "unit": "MINUTES" } }
                  }
                }
                """);
        assertEquals(com.gensynth.core.model.TickSettings.Mode.AS_FAST_AS_POSSIBLE, server.tickClock.getSettings().getMode());
        assertEquals(2, server.tickClock.getSettings().getValue());

        Path exportPath = tempDir.resolve("with-settings.gsynth");
        server.onMessage(mockConn, "{\"type\":\"EXPORT_STATE\",\"commandId\":\"cmd-export-settings\",\"protocolVersion\":\"1.0.0\","
                + "\"payload\":{\"filePath\":\"" + exportPath.toString().replace("\\", "\\\\") + "\"}}");
        JsonNode exported = com.gensynth.core.persistence.ProjectFileFormat.read(exportPath, new ObjectMapper());
        assertEquals("1.1.0", exported.path("version").asText());
        assertEquals("AS_FAST_AS_POSSIBLE", exported.path("settings").path("tick").path("mode").asText());

        // An old 1.0.0 project without settings falls back to the defaults
        server.onMessage(mockConn, "{\"type\":\"IMPORT_STATE\",\"commandId\":\"cmd-import-old\",\"protocolVersion\":\"1.0.0\","
                + "\"payload\":{\"groups\":[],\"variables\":[]}}");
        assertEquals(com.gensynth.core.model.TickSettings.defaults(), server.tickClock.getSettings());
        server.shutdown();
    }

    @Test
    public void loadStateRestoresPersistedSettings() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-ws-test-load-settings-");
        StateRepository repository = new JsonStateRepositoryImpl(tempDir.toString());
        repository.saveSettings(new com.gensynth.core.model.ProjectSettings(new com.gensynth.core.model.TickSettings(
                com.gensynth.core.model.TickSettings.Mode.FIXED_RATE, 5, com.gensynth.core.model.TickSettings.Unit.SECONDS)));
        UiBridgeWebSocketServer server = newServer(tempDir, repository);

        server.onMessage(null, "{\"type\":\"LOAD_STATE\",\"commandId\":\"cmd-load\",\"protocolVersion\":\"1.0.0\",\"payload\":{}}");

        assertEquals(5, server.tickClock.getSettings().getValue());
        assertEquals(com.gensynth.core.model.TickSettings.Unit.SECONDS, server.tickClock.getSettings().getUnit());
        server.shutdown();
    }

    @Test
    public void tickClockRunsOnlyWhileSystemIsRunning() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-ws-test-clock-lifecycle-");
        UiBridgeWebSocketServer server = newServer(tempDir, new JsonStateRepositoryImpl(tempDir.toString()));
        assertFalse(server.tickClock.isRunning());

        server.onMessage(null, "{\"type\":\"START_SYSTEM\",\"commandId\":\"cmd-start\",\"protocolVersion\":\"1.0.0\",\"payload\":{}}");
        assertTrue(server.tickClock.isRunning());

        server.onMessage(null, "{\"type\":\"STOP_SYSTEM\",\"commandId\":\"cmd-stop\",\"protocolVersion\":\"1.0.0\",\"payload\":{}}");
        assertFalse(server.tickClock.isRunning());
        server.shutdown();
    }

    @Test
    public void tickClockDrivesRealMessageGenerationEndToEnd() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-ws-test-e2e-ticks-");
        StateRepository repository = new JsonStateRepositoryImpl(tempDir.toString());
        repository.saveGroups(List.of(new com.gensynth.core.model.GroupDefinition("g-e2e", "E2E", "", 1, "parallel")));
        UiBridgeWebSocketServer server = newServer(tempDir, repository);
        String outputDir = tempDir.resolve("out").toString().replace("\\", "\\\\");

        server.onMessage(null, "{\"type\":\"LOAD_STATE\",\"commandId\":\"c1\",\"protocolVersion\":\"1.0.0\",\"payload\":{}}");
        server.onMessage(null, "{\"type\":\"CREATE_FLOW\",\"commandId\":\"c2\",\"protocolVersion\":\"1.0.0\",\"payload\":{"
                + "\"groupId\":\"g-e2e\",\"flowId\":\"f-e2e\",\"name\":\"E2E\",\"technology\":\"file\",\"host\":\"localhost\","
                + "\"burst\":2,\"template\":\"{\\\"n\\\":{{n}}}\",\"connectorConfig\":{\"outputDir\":\"" + outputDir + "\"}}}");
        server.onMessage(null, "{\"type\":\"UPDATE_SETTINGS\",\"commandId\":\"c3\",\"protocolVersion\":\"1.0.0\","
                + "\"payload\":{\"tick\":{\"mode\":\"FIXED_RATE\",\"value\":20,\"unit\":\"MILLISECONDS\"}}}");

        server.onMessage(null, "{\"type\":\"START_SYSTEM\",\"commandId\":\"c4\",\"protocolVersion\":\"1.0.0\",\"payload\":{}}");
        long deadline = System.currentTimeMillis() + 3000;
        while (server.totalMessages.get() < 10 && System.currentTimeMillis() < deadline) {
            Thread.sleep(10);
        }
        server.onMessage(null, "{\"type\":\"STOP_SYSTEM\",\"commandId\":\"c5\",\"protocolVersion\":\"1.0.0\",\"payload\":{}}");

        assertTrue("expected messages driven by the tick clock, got " + server.totalMessages.get(),
                server.totalMessages.get() >= 10);
        assertEquals("every tick publishes the whole burst", 0, server.totalMessages.get() % 2);
        assertTrue(server.tickClock.getTickCount() >= 5);
        assertFalse(server.tickClock.isRunning());
        server.shutdown();
    }
}
