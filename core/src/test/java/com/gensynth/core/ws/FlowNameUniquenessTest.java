package com.gensynth.core.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
import com.gensynth.core.ws.handler.StateCommandHandler;
import com.gensynth.core.ws.runtime.GroupRuntime;
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
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Flow names are unique inside a group (trimmed, ignoring case): with file output, two flows with
 * the same name would write to the same file.
 */
public class FlowNameUniquenessTest {

    private static final String GROUP_ID = "g1";

    private final ObjectMapper mapper = new ObjectMapper();
    private final List<JsonNode> sent = new ArrayList<>();
    private UiBridgeWebSocketServer server;
    private WebSocket conn;
    private int commandCounter;

    @Before
    public void setUp() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-flow-names-");
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

        assertNull(send("CREATE_GROUP", Map.of("groupId", GROUP_ID, "name", "Plant")));
    }

    @Test
    public void createFlowRejectsANameTakenInTheGroup() throws Exception {
        assertNull(createFlow("Sensor", false));

        JsonNode error = createFlow("  sensor ", false);

        assertNotNull("a repeated name must be rejected", error);
        assertEquals("INVALID_PAYLOAD", error.path("code").asText());
        assertEquals("A flow named \"sensor\" already exists in this group", error.path("message").asText());
        assertEquals("DUPLICATE_FLOW_NAME", error.path("details").path("reason").asText());
        assertEquals(List.of("Sensor"), flowNames(GROUP_ID));
    }

    @Test
    public void createFlowAllowsTheSameNameInAnotherGroup() throws Exception {
        assertNull(send("CREATE_GROUP", Map.of("groupId", "g2", "name", "Other")));
        assertNull(createFlow("Sensor", false));

        assertNull(send("CREATE_FLOW", flowPayload("g2", "Sensor", false)));

        assertEquals(List.of("Sensor"), flowNames("g2"));
    }

    @Test
    public void createFlowWithAutoRenameMakesTheNameUnique() throws Exception {
        assertNull(createFlow("Sensor", false));

        assertNull(createFlow("Sensor", true));
        assertNull(createFlow("sensor", true));

        assertEquals(List.of("Sensor", "Sensor (2)", "sensor (3)"), flowNames(GROUP_ID));
        JsonNode created = lastOfType("CONNECTION_STATUS");
        assertEquals("sensor (3)", created.path("payload").path("name").asText());
    }

    @Test
    public void updateFlowConfigRejectsRenamingToATakenName() throws Exception {
        createFlow("Sensor", false);
        createFlow("Pump", false);
        String pumpId = flowId("Pump");

        JsonNode error = send("UPDATE_FLOW_CONFIG", Map.of("groupId", GROUP_ID, "flowId", pumpId, "name", "SENSOR"));

        assertNotNull(error);
        assertEquals("INVALID_PAYLOAD", error.path("code").asText());
        assertEquals("A flow named \"SENSOR\" already exists in this group", error.path("message").asText());
        assertEquals(List.of("Sensor", "Pump"), flowNames(GROUP_ID));
    }

    @Test
    public void updateFlowConfigAcceptsItsOwnNameAndCaseChanges() throws Exception {
        createFlow("Sensor", false);
        String id = flowId("Sensor");

        assertNull(send("UPDATE_FLOW_CONFIG", Map.of("groupId", GROUP_ID, "flowId", id, "name", "Sensor", "template", "{}")));
        assertNull(send("UPDATE_FLOW_CONFIG", Map.of("groupId", GROUP_ID, "flowId", id, "name", " SENSOR ")));

        assertEquals(List.of("SENSOR"), flowNames(GROUP_ID));
        JsonNode error = send("UPDATE_FLOW_CONFIG", Map.of("groupId", GROUP_ID, "flowId", id, "name", "   "));
        assertNotNull("a blank name must be rejected", error);
        assertEquals("Flow name cannot be empty", error.path("message").asText());
    }

    @Test
    public void cloneFlowRenamesCollidingNamesInsteadOfFailing() throws Exception {
        createFlow("Sensor", false);
        String id = flowId("Sensor");

        assertNull(send("CLONE_FLOW", Map.of("groupId", GROUP_ID, "flowId", id, "count", 2)));
        // Cloning again with the default pattern repeats "Sensor (Clone 1)" and "Sensor (Clone 2)"
        assertNull(send("CLONE_FLOW", Map.of("groupId", GROUP_ID, "flowId", id, "count", 2)));
        // A pattern without ${index} gives the same name to every clone
        assertNull(send("CLONE_FLOW", Map.of("groupId", GROUP_ID, "flowId", id, "count", 2, "namingPattern", "${name}")));

        assertEquals(List.of(
                "Sensor", "Sensor (Clone 1)", "Sensor (Clone 2)",
                "Sensor (Clone 1) (2)", "Sensor (Clone 2) (2)",
                "Sensor (2)", "Sensor (3)"), flowNames(GROUP_ID));
    }

    @Test
    public void cloneGroupKeepsFlowNamesAndMakesTheGroupNameUnique() throws Exception {
        createFlow("Sensor", false);
        createFlow("Pump", false);

        assertNull(send("CLONE_GROUP", Map.of("groupId", GROUP_ID, "count", 1)));
        assertNull(send("CLONE_GROUP", Map.of("groupId", GROUP_ID, "count", 1)));

        List<String> groupNames = new ArrayList<>();
        for (Map<String, Object> group : server.toGroupsPayload()) {
            groupNames.add(String.valueOf(group.get("name")));
            if (!GROUP_ID.equals(group.get("id"))) {
                assertEquals(List.of("Sensor", "Pump"), flowNames(String.valueOf(group.get("id"))));
            }
        }
        groupNames.sort(null);
        assertEquals(List.of("Plant", "Plant (Clone 1)", "Plant (Clone 1) (2)"), groupNames);
    }

    @Test
    public void importStateKeepsLoadingProjectsWithRepeatedFlowNames() throws Exception {
        Map<String, Object> flowA = new LinkedHashMap<>();
        flowA.put("id", "f-a");
        flowA.put("name", "Sensor");
        flowA.put("technology", "file");
        Map<String, Object> flowB = new LinkedHashMap<>(flowA);
        flowB.put("id", "f-b");
        flowB.put("name", "sensor");
        Map<String, Object> group = new LinkedHashMap<>();
        group.put("id", "legacy");
        group.put("name", "Legacy");
        group.put("flows", List.of(flowA, flowB));

        JsonNode error = send("IMPORT_STATE", Map.of("groups", List.of(group), "variables", List.of()));

        assertNull("old projects with repeated names must still load", error);
        assertEquals(2, flowNames("legacy").size());
        assertTrue(flowNames("legacy").containsAll(List.of("Sensor", "sensor")));

        GroupRuntime runtime = new GroupRuntime("legacy", "Legacy", "stopped", "", 1, "parallel", true);
        runtime.flows.add(new com.gensynth.core.ws.runtime.FlowRuntime("f-a", "Sensor", "file", "disconnected",
                0, 0, false, null, 1000, 1, "", "", 0, "{}", "json", true, Map.of()));
        runtime.flows.add(new com.gensynth.core.ws.runtime.FlowRuntime("f-b", "sensor", "file", "disconnected",
                0, 0, false, null, 1000, 1, "", "", 0, "{}", "json", true, Map.of()));
        List<String> warnings = StateCommandHandler.duplicateNameWarnings(List.of(runtime));
        assertEquals(1, warnings.size());
        assertTrue(warnings.get(0).contains("'Legacy'"));
    }

    // ── helpers ──────────────────────────────────────────────────

    private JsonNode createFlow(String name, boolean autoRename) throws Exception {
        return send("CREATE_FLOW", flowPayload(GROUP_ID, name, autoRename));
    }

    private static Map<String, Object> flowPayload(String groupId, String name, boolean autoRename) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("groupId", groupId);
        payload.put("name", name);
        payload.put("technology", "file");
        if (autoRename) {
            payload.put("autoRename", true);
        }
        return payload;
    }

    /** Sends a command and returns the ERROR it produced, or {@code null} if none. */
    private JsonNode send(String type, Map<String, Object> payload) throws Exception {
        sent.clear();
        Map<String, Object> command = new LinkedHashMap<>();
        command.put("type", type);
        command.put("commandId", "cmd-" + (++commandCounter));
        command.put("protocolVersion", "1.0.0");
        command.put("payload", payload);
        server.onMessage(conn, mapper.writeValueAsString(command));
        JsonNode error = lastOfType("ERROR");
        return error != null ? error.path("payload") : null;
    }

    private JsonNode lastOfType(String type) {
        JsonNode found = null;
        for (JsonNode message : sent) {
            if (type.equals(message.path("type").asText())) {
                found = message;
            }
        }
        return found;
    }

    @SuppressWarnings("unchecked")
    private List<String> flowNames(String groupId) {
        List<String> names = new ArrayList<>();
        for (Map<String, Object> group : server.toGroupsPayload()) {
            if (groupId.equals(group.get("id"))) {
                for (Map<String, Object> flow : (List<Map<String, Object>>) group.get("flows")) {
                    names.add(String.valueOf(flow.get("name")));
                }
            }
        }
        return names;
    }

    @SuppressWarnings("unchecked")
    private String flowId(String name) {
        for (Map<String, Object> group : server.toGroupsPayload()) {
            for (Map<String, Object> flow : (List<Map<String, Object>>) group.get("flows")) {
                if (name.equals(flow.get("name"))) {
                    return String.valueOf(flow.get("id"));
                }
            }
        }
        throw new AssertionError("Flow not found: " + name);
    }
}
