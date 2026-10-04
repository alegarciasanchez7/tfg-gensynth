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

import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Tests the tick dispatch of FlowCommandHandler, calling onTick directly so the
 * result does not depend on clock timing.
 */
public class TickDispatchTest {

    private UiBridgeWebSocketServer server;
    private GroupRuntime group;
    private FlowRuntime flow;
    private ConnectorPlugin connector;

    @Before
    public void setUp() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-tick-dispatch-");
        server = new UiBridgeWebSocketServer(
            new InetSocketAddress("localhost", 0),
            new ConnectorCatalogService(),
            new JsonStateRepositoryImpl(tempDir.toString()),
            new PluginInstallerImpl(tempDir));

        group = new GroupRuntime("g1", "Group", "running", "", 1, "parallel", true);
        flow = new FlowRuntime("f1", "Flow", "file", "connected", 0, 0, false, null,
            1000, 3, "topic", "localhost", 0, "{\"value\":{{n}}}", "json", true, Map.of());
        group.flows.add(flow);
        server.groupsById.put(group.id, group);

        connector = mock(ConnectorPlugin.class);
        server.connectorByFlowId.put(flow.id, connector);
    }

    @After
    public void tearDown() {
        server.shutdown();
    }

    @Test
    public void runningGroupPublishesBurstOnEveryTick() {
        assertTrue(server.flowCommandHandler.onTick(1));
        verify(connector, times(3)).publish(eq("topic"), any(byte[].class), anyMap());

        assertTrue(server.flowCommandHandler.onTick(2));
        verify(connector, times(6)).publish(eq("topic"), any(byte[].class), anyMap());
        assertEquals(6, server.totalMessages.get());
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
    public void flowsOfSeveralGroupsPublishOnTheSameTick() {
        GroupRuntime other = new GroupRuntime("g2", "Other", "running", "", 1, "parallel", true);
        FlowRuntime otherFlow = new FlowRuntime("f2", "Flow 2", "file", "connected", 0, 0, false, null,
            1000, 2, "topic2", "localhost", 0, "{\"value\":{{n}}}", "json", true, Map.of());
        other.flows.add(otherFlow);
        server.groupsById.put(other.id, other);
        ConnectorPlugin otherConnector = mock(ConnectorPlugin.class);
        server.connectorByFlowId.put(otherFlow.id, otherConnector);

        assertTrue(server.flowCommandHandler.onTick(1));
        verify(connector, times(3)).publish(eq("topic"), any(byte[].class), anyMap());
        verify(otherConnector, times(2)).publish(eq("topic2"), any(byte[].class), anyMap());
    }

    @Test
    public void metricsTickReportsMeasuredFlowThroughput() {
        server.flowCommandHandler.onTick(1);
        server.flowCommandHandler.onTick(2);

        server.systemCommandHandler.emitMetricsTick();

        assertEquals(6, flow.throughput);
        assertEquals(0, flow.sentInWindow.get());
        Map<String, Object> metrics = server.systemCommandHandler.buildMetricsPayload(null);
        assertTrue(metrics.containsKey("ticksPerSecond"));
        assertTrue(metrics.containsKey("totalTicks"));
    }

    @Test
    public void publishErrorMarksFlowAsFailed() {
        doThrow(new IllegalStateException("broker down")).when(connector).publish(anyString(), any(byte[].class), anyMap());

        server.flowCommandHandler.onTick(1);

        assertTrue(flow.hasError);
        assertEquals("error", flow.connectionStatus);
        assertEquals("broker down", flow.errorMessage);
    }
}
