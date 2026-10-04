package com.gensynth.core.ws;

import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.connectors.spi.ConnectorPlugin;
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
    private ConnectorPlugin connector;

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

        connector = mock(ConnectorPlugin.class);
        server.connectorByFlowId.put(flow.id, connector);
        group.dispatcher = server.flowCommandHandler.createDispatcher(group);
    }

    @After
    public void tearDown() {
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

        verify(connector, times(2)).publish(eq("topic"), any(byte[].class), anyMap());
        assertEquals(2, flow.generated.get());
        assertEquals(0, flow.failed.get());
        assertEquals(2, server.totalMessages.get());
    }

    @Test
    public void everyTicksSendsOnlyOnDueTicks() throws Exception {
        flow.everyTicks = 3;
        for (long tick = 1; tick <= 7; tick++) {
            server.flowCommandHandler.onTick(tick);
            Thread.sleep(20); // let the worker finish so no tick is skipped as busy
        }
        // Due on ticks 1, 4 and 7 (counted from the group's first tick)
        awaitSent(flow, 3);
    }

    @Test
    public void groupStartedLateStillSendsOnItsFirstTick() throws Exception {
        flow.everyTicks = 5;
        assertTrue(server.flowCommandHandler.onTick(42));
        awaitSent(flow, 1);
        assertEquals(42, group.startTick);
    }

    @Test
    public void pausedGroupIsSkipped() {
        group.status = "paused";
        assertFalse(server.flowCommandHandler.onTick(1));
        verify(connector, never()).publish(anyString(), any(byte[].class), anyMap());
    }

    @Test
    public void disabledFlowIsSkipped() {
        flow.enabled = false;
        assertFalse(server.flowCommandHandler.onTick(1));
        verify(connector, never()).publish(anyString(), any(byte[].class), anyMap());
    }

    @Test
    public void groupWithoutDispatcherIsSkipped() {
        group.dispatcher.shutdown();
        group.dispatcher = null;
        assertFalse(server.flowCommandHandler.onTick(1));
    }

    @Test
    public void sequenceNumbersAreUniqueAcrossParallelFlows() throws Exception {
        FlowRuntime other = newFlow("f2", "topic2", "{\"value\":{{n}}}");
        group.flows.add(other);
        ConnectorPlugin otherConnector = mock(ConnectorPlugin.class);
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
        verify(connector, times(5)).publish(anyString(), first.capture(), anyMap());
        verify(otherConnector, times(5)).publish(anyString(), second.capture(), anyMap());
        Set<String> payloads = new HashSet<>();
        for (List<byte[]> captured : List.of(first.getAllValues(), second.getAllValues())) {
            for (byte[] bytes : captured) {
                payloads.add(new String(bytes, StandardCharsets.UTF_8));
            }
        }
        assertEquals("{{n}} must be unique across flows", 10, payloads.size());
    }

    @Test
    public void publishErrorCountsAsFailed() throws Exception {
        doThrow(new IllegalStateException("broker down")).when(connector).publish(anyString(), any(byte[].class), anyMap());

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
    public void countersResetOnStartButNotOnResume() {
        flow.sent.set(7);
        flow.generated.set(9);

        group.status = "paused";
        synchronized (server.stateLock) {
            server.flowCommandHandler.startGroupInternal(group);
        }
        assertEquals("resume keeps counters", 7, flow.sent.get());

        synchronized (server.stateLock) {
            server.flowCommandHandler.stopGroupInternal(group);
            server.flowCommandHandler.startGroupInternal(group);
        }
        assertEquals("start from stopped resets counters", 0, flow.sent.get());
        assertEquals(0, flow.generated.get());
    }

    @Test
    public void pauseStopsSendingAndDropsTheDispatcher() {
        synchronized (server.stateLock) {
            server.flowCommandHandler.pauseGroupInternal(group);
        }
        assertEquals("paused", group.status);
        assertNull(group.dispatcher);
        assertFalse(server.flowCommandHandler.onTick(1));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> flowEntry(Map<String, Object> payload) {
        List<Map<String, Object>> flows = (List<Map<String, Object>>) payload.get("flows");
        assertEquals(1, flows.size());
        return flows.get(0);
    }
}
