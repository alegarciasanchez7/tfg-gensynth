package com.gensynth.core.ws;

import com.gensynth.core.api.IGroupDispatcher;
import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.plugin.api.ConnectorSession;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Tests the tick dispatch of FlowCommandHandler, calling onTick directly so the result does
 * not depend on the clock timing. Publishing is asynchronous (dispatcher threads), so the
 * assertions on the connector use Mockito timeouts.
 */
public class TickDispatchTest {

    private static final long TIMEOUT_MS = 2000;

    private UiBridgeWebSocketServer server;
    private GroupRuntime group;
    private FlowRuntime flow;
    private ConnectorSession connector;

    private static FlowRuntime newFlow(String id, String topic, String template) {
        return new FlowRuntime(id, "Flow " + id, "file", "connected", 0, 0, false, null,
            1000, 1, topic, "localhost", 0, template, "json", true, Map.of());
    }

    @Before
    public void setUp() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-tick-dispatch-");
        server = new UiBridgeWebSocketServer(
            new InetSocketAddress("localhost", 0),
            new ConnectorCatalogService(),
            new JsonStateRepositoryImpl(tempDir.toString()),
            new PluginInstallerImpl(tempDir));

        group = new GroupRuntime("g1", "Group", "running", "", 1, "parallel", true);
        flow = newFlow("f1", "topic", "{\"value\":{{n}}}");
        // Real connectors created by startGroupInternal must write into the temp directory
        flow.connectorConfig = Map.of("outputDir", tempDir.toString());
        group.flows.add(flow);
        server.groupsById.put(group.id, group);

        connector = mock(ConnectorSession.class);
        server.connectorByFlowId.put(flow.id, connector);
        group.dispatcher = server.flowCommandHandler.createDispatcher(group);
    }

    @After
    public void tearDown() throws Exception {
        if (group.dispatcher != null) {
            group.dispatcher.shutdown();
        }
        server.shutdown();
    }

    private void awaitSent(FlowRuntime target, long expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + TIMEOUT_MS;
        while (target.sent.get() < expected && System.currentTimeMillis() < deadline) {
            Thread.sleep(5);
        }
        assertEquals(expected, target.sent.get());
    }

    @Test
    public void runningGroupSendsOneMessagePerTick() throws Exception {
        assertTrue(server.flowCommandHandler.onTick(1));
        awaitSent(flow, 1);
        Thread.sleep(20); // the worker clears its busy flag right after recording the send
        assertTrue(server.flowCommandHandler.onTick(2));
        awaitSent(flow, 2);

        verify(connector, times(2)).send(any(byte[].class), anyMap());
        assertEquals(2, flow.generated.get());
        assertEquals(0, flow.failed.get());
        assertEquals(2, server.totalMessages.get());
    }

    @Test
    public void everyTicksSendsOnlyOnDueTicks() throws Exception {
        flow.everyTicks.set(3);
        for (long tick = 1; tick <= 7; tick++) {
            server.flowCommandHandler.onTick(tick);
            Thread.sleep(20); // let the worker finish so no tick is skipped as busy
        }
        // Due on ticks 1, 4 and 7 (counted from the group's first tick)
        awaitSent(flow, 3);
    }

    @Test
    public void groupStartedLateStillSendsOnItsFirstTick() throws Exception {
        flow.everyTicks.set(5);
        assertTrue(server.flowCommandHandler.onTick(42));
        awaitSent(flow, 1);
        assertEquals(42, group.startTick);
    }

    @Test
    public void pausedGroupIsSkipped() throws Exception {
        group.status = "paused";
        assertFalse(server.flowCommandHandler.onTick(1));
        verify(connector, never()).send(any(byte[].class), anyMap());
    }

    @Test
    public void disabledFlowIsSkipped() throws Exception {
        flow.enabled = false;
        assertFalse(server.flowCommandHandler.onTick(1));
        verify(connector, never()).send(any(byte[].class), anyMap());
    }

    @Test
    public void groupWithoutDispatcherIsSkipped() throws Exception {
        group.dispatcher.shutdown();
        group.dispatcher = null;
        assertFalse(server.flowCommandHandler.onTick(1));
    }

    @Test
    public void sequenceNumbersAreUniqueAcrossParallelFlows() throws Exception {
        FlowRuntime other = newFlow("f2", "topic2", "{\"value\":{{n}}}");
        group.flows.add(other);
        ConnectorSession otherConnector = mock(ConnectorSession.class);
        server.connectorByFlowId.put(other.id, otherConnector);
        group.dispatcher.shutdown();
        group.dispatcher = server.flowCommandHandler.createDispatcher(group);

        for (long tick = 1; tick <= 5; tick++) {
            server.flowCommandHandler.onTick(tick);
            Thread.sleep(20);
        }
        awaitSent(flow, 5);
        awaitSent(other, 5);

        ArgumentCaptor<byte[]> first = ArgumentCaptor.forClass(byte[].class);
        ArgumentCaptor<byte[]> second = ArgumentCaptor.forClass(byte[].class);
        verify(connector, times(5)).send(first.capture(), anyMap());
        verify(otherConnector, times(5)).send(second.capture(), anyMap());
        Set<String> payloads = new HashSet<>();
        for (List<byte[]> captured : List.of(first.getAllValues(), second.getAllValues())) {
            for (byte[] bytes : captured) {
                payloads.add(new String(bytes, StandardCharsets.UTF_8));
            }
        }
        assertEquals("{{n}} must be unique across flows", 10, payloads.size());
    }

    @Test
    public void flowNameBuiltInSendsTheNameOfEachFlow() throws Exception {
        flow.template = "{\"id\":\"{{flow.name}}\"}";

        assertTrue(server.flowCommandHandler.onTick(1));
        awaitSent(flow, 1);

        ArgumentCaptor<byte[]> payload = ArgumentCaptor.forClass(byte[].class);
        verify(connector).send(payload.capture(), anyMap());
        assertEquals("{\"id\":\"Flow f1\"}", new String(payload.getValue(), StandardCharsets.UTF_8));
    }

    @Test
    public void publishErrorCountsAsFailed() throws Exception {
        doThrow(new IllegalStateException("broker down")).when(connector).send(any(byte[].class), anyMap());

        server.flowCommandHandler.onTick(1);

        long deadline = System.currentTimeMillis() + TIMEOUT_MS;
        while (flow.failed.get() < 1 && System.currentTimeMillis() < deadline) {
            Thread.sleep(5);
        }
        assertEquals(1, flow.failed.get());
        assertEquals(0, flow.sent.get());
        assertEquals(1, flow.generated.get());
        assertTrue(flow.hasError);
        assertEquals("error", flow.connectionStatus);
    }

    @Test
    public void flowsMetricsReportRateAndKeepCountersAfterStop() throws Exception {
        server.flowCommandHandler.onTick(1);
        awaitSent(flow, 1);

        server.systemCommandHandler.emitMetricsTick();
        Map<String, Object> entry = flowEntry(server.systemCommandHandler.buildFlowsMetricsPayload());
        assertEquals("f1", entry.get("flowId"));
        assertEquals("g1", entry.get("groupId"));
        assertEquals(1L, entry.get("generated"));
        assertEquals(1L, entry.get("sent"));
        assertEquals(0L, entry.get("failed"));
        assertTrue((Double) entry.get("throughput") > 0);

        synchronized (server.stateLock) {
            server.flowCommandHandler.stopGroupInternal(group);
        }
        server.systemCommandHandler.emitMetricsTick();
        entry = flowEntry(server.systemCommandHandler.buildFlowsMetricsPayload());
        assertEquals(0.0, (Double) entry.get("throughput"), 0.0);
        assertEquals("counters are kept after stop", 1L, entry.get("sent"));
        assertNull(group.dispatcher);
    }

    @Test
    public void countersResetOnStartButNotOnResume() throws Exception {
        flow.sent.set(7);
        flow.generated.set(9);
        flow.dropped.set(2);

        group.status = "paused";
        synchronized (server.stateLock) {
            server.flowCommandHandler.startGroupInternal(group);
        }
        assertEquals("resume keeps counters", 7, flow.sent.get());
        assertEquals("resume keeps the dropped counter", 2, flow.dropped.get());

        synchronized (server.stateLock) {
            server.flowCommandHandler.stopGroupInternal(group);
            server.flowCommandHandler.startGroupInternal(group);
        }
        assertEquals("start from stopped resets counters", 0, flow.sent.get());
        assertEquals(0, flow.generated.get());
        assertEquals(0, flow.dropped.get());
    }

    @Test
    public void pauseStopsSendingAndDropsTheDispatcher() throws Exception {
        synchronized (server.stateLock) {
            server.flowCommandHandler.pauseGroupInternal(group);
        }
        assertEquals("paused", group.status);
        assertNull(group.dispatcher);
        assertFalse(server.flowCommandHandler.onTick(1));
    }

    private void awaitDropped(FlowRuntime target, long expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + TIMEOUT_MS;
        while (target.dropped.get() < expected && System.currentTimeMillis() < deadline) {
            Thread.sleep(5);
        }
        assertEquals(expected, target.dropped.get());
    }

    @Test
    public void fullLossGeneratesButNeverSends() throws Exception {
        flow.lossPercent = 100;

        assertTrue("a dropped message still counts as generated", server.flowCommandHandler.onTick(1));
        awaitDropped(flow, 1);

        assertEquals(1, flow.generated.get());
        assertEquals(0, flow.sent.get());
        assertEquals(0, flow.failed.get());
        verify(connector, never()).send(any(byte[].class), anyMap());
        assertEquals(1L, flowEntry(server.systemCommandHandler.buildFlowsMetricsPayload()).get("dropped"));
    }

    @Test
    public void outageDropsTheLastTicksOfEveryPeriod() throws Exception {
        flow.outageEveryTicks.set(4);
        flow.outageDurationTicks.set(2);
        for (long tick = 1; tick <= 8; tick++) {
            server.flowCommandHandler.onTick(tick);
            Thread.sleep(20); // let the worker finish so no tick is skipped as busy
        }
        // Group ticks 0-7: 2, 3, 6 and 7 are in the outage
        awaitSent(flow, 4);
        awaitDropped(flow, 4);
        assertEquals(8, flow.generated.get());
        verify(connector, times(4)).send(any(byte[].class), anyMap());
    }

    @Test
    public void updateFlowConfigAppliesEventLossLive() throws Exception {
        server.onMessage(null, "{\"type\":\"UPDATE_FLOW_CONFIG\",\"commandId\":\"u1\",\"protocolVersion\":\"1.0.0\","
            + "\"payload\":{\"groupId\":\"g1\",\"flowId\":\"f1\",\"lossPercent\":100,"
            + "\"outageEveryTicks\":6,\"outageDurationTicks\":2}}");

        assertEquals(100.0, flow.lossPercent, 0.0);
        assertEquals(6, flow.outageEveryTicks.get());
        assertEquals(2, flow.outageDurationTicks.get());
        assertNotNull("the group keeps running with its dispatcher", group.dispatcher);

        server.flowCommandHandler.onTick(1);
        awaitDropped(flow, 1);
        verify(connector, never()).send(any(byte[].class), anyMap());

        // Out-of-range values are clamped
        server.onMessage(null, "{\"type\":\"UPDATE_FLOW_CONFIG\",\"commandId\":\"u2\",\"protocolVersion\":\"1.0.0\","
            + "\"payload\":{\"groupId\":\"g1\",\"flowId\":\"f1\",\"lossPercent\":-5,\"outageEveryTicks\":-1}}");
        assertEquals(0.0, flow.lossPercent, 0.0);
        assertEquals(0, flow.outageEveryTicks.get());
        assertEquals("missing fields are kept", 2, flow.outageDurationTicks.get());
    }

    @Test
    public void clonesKeepTheEventLossSettings() throws Exception {
        flow.everyTicks.set(2);
        flow.lossPercent = 30;
        flow.outageEveryTicks.set(10);
        flow.outageDurationTicks.set(3);

        server.onMessage(null, "{\"type\":\"CLONE_FLOW\",\"commandId\":\"c1\",\"protocolVersion\":\"1.0.0\","
            + "\"payload\":{\"groupId\":\"g1\",\"flowId\":\"f1\",\"count\":1}}");
        assertEquals(2, group.flows.size());
        assertSameSendSettings(group.flows.get(1));

        server.onMessage(null, "{\"type\":\"CLONE_GROUP\",\"commandId\":\"c2\",\"protocolVersion\":\"1.0.0\","
            + "\"payload\":{\"groupId\":\"g1\",\"count\":1}}");
        GroupRuntime groupClone = server.groupsById.values().stream()
            .filter(candidate -> !candidate.id.equals("g1")).findFirst().orElseThrow();
        assertEquals(2, groupClone.flows.size());
        groupClone.flows.forEach(TickDispatchTest::assertSameSendSettings);
    }

    private static void assertSameSendSettings(FlowRuntime clone) {
        assertEquals(2, clone.everyTicks.get());
        assertEquals(30.0, clone.lossPercent, 0.0);
        assertEquals(10, clone.outageEveryTicks.get());
        assertEquals(3, clone.outageDurationTicks.get());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> flowEntry(Map<String, Object> payload) {
        List<Map<String, Object>> flows = (List<Map<String, Object>>) payload.get("flows");
        assertEquals(1, flows.size());
        return flows.get(0);
    }

    @Test
    public void invalidConnectorConfigurationMarksTheFlowAsFailedWithoutConnecting() {
        flow.connectorConfig = Map.of("format", "pdf");
        server.connectorByFlowId.clear();
        group.status = "stopped";

        synchronized (server.stateLock) {
            server.flowCommandHandler.startGroupInternal(group);
        }

        assertTrue(flow.hasError);
        assertEquals("error", flow.connectionStatus);
        assertTrue(flow.errorMessage, flow.errorMessage.startsWith("Invalid connector configuration: File format must be one of"));
        assertFalse(server.connectorByFlowId.containsKey(flow.id));
    }

    @Test
    public void reorderingARunningGroupChangesTheOrderOfTheNextTick() throws Exception {
        GroupRuntime sequential = new GroupRuntime("g2", "Ordered", "running", "", 1, "sequential", true);
        for (String id : List.of("a", "b", "c")) {
            FlowRuntime orderedFlow = newFlow(id, "topic", "{}");
            sequential.flows.add(orderedFlow);
            server.connectorByFlowId.put(id, mock(ConnectorSession.class));
        }
        List<List<String>> dueOrders = new java.util.concurrent.CopyOnWriteArrayList<>();
        sequential.dispatcher = new IGroupDispatcher() {
            @Override
            public boolean dispatch(List<FlowRuntime> dueFlows, long groupTick) {
                dueOrders.add(dueFlows.stream().map(f -> f.id).toList());
                return true;
            }

            @Override
            public void shutdown() {
            }
        };
        server.groupsById.put(sequential.id, sequential);

        server.flowCommandHandler.onTick(1);
        server.onMessage(null, "{\"type\":\"UPDATE_GROUP_CONFIG\",\"commandId\":\"reorder\",\"protocolVersion\":\"1.0.0\","
            + "\"payload\":{\"groupId\":\"g2\",\"flowIds\":[\"c\",\"a\",\"b\"]}}");
        server.flowCommandHandler.onTick(2);

        assertEquals(List.of(List.of("a", "b", "c"), List.of("c", "a", "b")), dueOrders);
    }
}
