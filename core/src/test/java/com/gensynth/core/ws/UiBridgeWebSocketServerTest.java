package com.gensynth.core.ws;

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

public class UiBridgeWebSocketServerTest {

    @Test
    public void createFlowPersistsConnectorConfigFromPayload() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-ws-test-");
        StateRepository repository = new JsonStateRepositoryImpl(tempDir.toString());

        UiBridgeWebSocketServer server = new UiBridgeWebSocketServer(
            new InetSocketAddress("localhost", 0),
            new ConnectorCatalogService(),
            repository
        );

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

        // conn can be null for command handling in tests
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
}
