package com.gensynth.core.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.model.Variable;
import com.gensynth.core.persistence.NoOpStateRepository;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.java_websocket.WebSocket;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * UPDATE_GROUP_CONFIG, UPDATE_FLOW_CONFIG and CLONE_GROUP through the command router: rejected
 * updates, every flow field and the variables copied with a group.
 */
public class ConfigAndCloneCommandsTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private UiBridgeWebSocketServer server;
    private WebSocket conn;

    @Before
    public void setUp() throws Exception {
        server = UiBridgeWebSocketServer.createHeadless(new ConnectorCatalogService(), new NoOpStateRepository());
        server.stateCommandHandler.importProject(MAPPER.readTree("""
                {"groups": [
                  {"id": "g1", "name": "Sensors", "flows": [
                    {"id": "f1", "name": "Temperature", "technology": "file", "template": "{{t}}",
                     "connectorConfig": {"format": "txt"}}]},
                  {"id": "g2", "name": "Other", "flows": []}],
                 "variables": [
                  {"id": "t", "name": "t", "scope": "local", "flowId": "f1", "type": "numeric", "config": {}},
                  {"id": "shared", "name": "shared", "scope": "group", "groupId": "g1", "type": "numeric", "config": {}},
                  {"id": "global", "name": "global", "scope": "global", "type": "numeric", "config": {}}]}
                """), false);
        conn = mock(WebSocket.class);
        when(conn.isOpen()).thenReturn(true);
    }

    @After
    public void tearDown() {
        server.shutdown();
    }

    private void send(String type, String commandId, String payload) {
        server.onMessage(conn, "{\"type\":\"" + type + "\",\"commandId\":\"" + commandId
            + "\",\"protocolVersion\":\"1.0.0\",\"payload\":" + payload + "}");
    }

    private List<JsonNode> sent() throws Exception {
        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(conn, atLeastOnce()).send(captor.capture());
        List<JsonNode> messages = new ArrayList<>();
        for (String message : captor.getAllValues()) {
            messages.add(MAPPER.readTree(message));
        }
        return messages;
    }

    private String errorCode(String commandId) throws Exception {
        for (JsonNode message : sent()) {
            if ("ERROR".equals(message.path("type").asText()) && commandId.equals(message.path("commandId").asText())) {
                return message.path("payload").path("code").asText();
            }
        }
        return null;
    }

    @Test
    public void groupNamesMustBeNonBlankAndUnique() throws Exception {
        send("UPDATE_GROUP_CONFIG", "blank", "{\"groupId\":\"g1\",\"name\":\"  \"}");
        send("UPDATE_GROUP_CONFIG", "taken", "{\"groupId\":\"g1\",\"name\":\"other\"}");

        assertEquals("INVALID_PAYLOAD", errorCode("blank"));
        assertEquals("INVALID_PAYLOAD", errorCode("taken"));
        assertEquals("Sensors", server.groupsById.get("g1").name);
    }

    @Test
    public void groupUpdateAppliesEveryField() {
        send("UPDATE_GROUP_CONFIG", "ok", "{\"groupId\":\"g1\",\"name\":\"Renamed\",\"description\":\"d\","
            + "\"threads\":0,\"outputMode\":\"sequential\",\"enabled\":false}");

        GroupRuntime group = server.groupsById.get("g1");
        assertEquals("Renamed", group.name);
        assertEquals("d", group.description);
        assertEquals("threads are at least 1", 1, group.threads);
        assertEquals("sequential", group.outputMode);
        assertTrue(group.flows.stream().noneMatch(flow -> flow.enabled));
    }

    @Test
    public void flowUpdateAppliesEveryFieldAndRejectsUnknownConnectors() throws Exception {
        send("UPDATE_FLOW_CONFIG", "ok", "{\"groupId\":\"g1\",\"flowId\":\"f1\",\"host\":\"broker\",\"port\":1883,"
            + "\"topic\":\"t/1\",\"interval\":10,\"burst\":0,\"everyTicks\":3,\"template\":\"x\",\"format\":\"csv\"}");
        send("UPDATE_FLOW_CONFIG", "bad", "{\"groupId\":\"g1\",\"flowId\":\"f1\",\"technology\":\"nope\",\"host\":\"ignored\"}");

        FlowRuntime flow = server.groupsById.get("g1").flows.get(0);
        assertEquals("broker", flow.host);
        assertEquals(1883, flow.port);
        assertEquals("t/1", flow.topic);
        assertEquals("interval is at least 50", 50, flow.interval);
        assertEquals("burst is at least 1", 1, flow.burst);
        assertEquals(3, flow.everyTicks.get());
        assertEquals("x", flow.template);
        assertEquals("csv", flow.format);
        assertEquals("INVALID_PAYLOAD", errorCode("bad"));
        assertEquals("file", flow.technology);
    }

    @Test
    public void cloningAGroupCopiesItsFlowAndGroupVariables() {
        send("CLONE_GROUP", "c1", "{\"groupId\":\"g1\",\"count\":2}");

        assertEquals(4, server.groupsById.size());
        List<GroupRuntime> clones = server.groupsById.values().stream()
            .filter(group -> !group.id.equals("g1") && !group.id.equals("g2")).toList();
        for (GroupRuntime clone : clones) {
            String flowId = clone.flows.get(0).id;
            List<Variable> copies = server.variablesById.values().stream()
                .filter(variable -> clone.id.equals(variable.getGroupId())).toList();
            assertEquals(2, copies.size());
            Variable local = copies.stream().filter(variable -> "LOCAL".equals(variable.getScope())).findFirst().orElseThrow();
            assertEquals(flowId, local.getFlowId());
            assertNotNull(copies.stream().filter(variable -> "GROUP".equals(variable.getScope())).findFirst().orElse(null));
        }
        assertEquals("the global variable is not copied", 1,
            server.variablesById.values().stream().filter(variable -> "GLOBAL".equals(variable.getScope())).count());
    }
}
