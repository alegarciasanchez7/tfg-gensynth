package com.gensynth.core.ws;

import com.gensynth.core.connectors.file.FileConnectorPlugin;
import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * Starting a group whose File Output flows map to the same file: the first flow connects, the
 * second one is marked as failed with a clear message, and STOP/START never leaves a file taken.
 * Locked flows open no connector, so they never take a file an enabled flow needs.
 */
public class FileTargetConflictTest {

    private UiBridgeWebSocketServer server;
    private GroupRuntime group;
    private FlowRuntime first;
    private FlowRuntime second;
    private Path tempDir;

    @Before
    public void setUp() throws Exception {
        tempDir = Files.createTempDirectory("gensynth-file-conflict-");
        server = new UiBridgeWebSocketServer(
                new InetSocketAddress("localhost", 0),
                new ConnectorCatalogService(),
                new JsonStateRepositoryImpl(tempDir.toString()),
                new PluginInstallerImpl(tempDir));

        group = new GroupRuntime("g1", "Plant", "stopped", "", 1, "parallel", true);
        first = newFlow("f1", "Sensor 1");
        second = newFlow("f2", "Sensor_1");
        group.flows.add(first);
        group.flows.add(second);
        server.groupsById.put(group.id, group);
    }

    @After
    public void tearDown() {
        synchronized (server.stateLock) {
            server.flowCommandHandler.stopGroupInternal(group);
        }
        server.shutdown();
    }

    @Test
    public void theSecondFlowOnTheSameFileFailsWithAClearMessage() {
        start();

        assertConnected(first);
        assertFileInUse(second);
    }

    @Test
    public void stopAndStartDoNotLeaveTheFileTaken() {
        start();
        stop();
        assertTrue("STOP must close every session", server.connectorByFlowId.isEmpty());

        start();
        assertConnected(first);
        assertFileInUse(second);

        // Restarting a running group (as when resuming) must reopen the first flow as well
        start();
        assertConnected(first);
        assertFileInUse(second);
    }

    @Test
    public void renamingTheFlowAfterAStopLetsBothFlowsStart() {
        start();
        stop();

        second.name = "Sensor 2";
        start();

        assertConnected(first);
        assertConnected(second);
    }

    @Test
    public void aLockedFlowDoesNotTakeTheFileOfAnEnabledOne() {
        first.enabled = false;
        start();

        assertEquals("disconnected", first.connectionStatus);
        assertFalse(first.hasError);
        assertFalse(server.connectorByFlowId.containsKey(first.id));
        assertConnected(second);
    }

    @Test
    public void aLockedGroupOpensNoConnectorAndCreatesNoFile() {
        group.enabled = false;
        first.enabled = false;
        second.enabled = false;
        start();

        assertTrue(server.connectorByFlowId.isEmpty());
        assertFalse(Files.exists(tempDir.resolve("Plant")));
    }

    @Test
    public void unlockingAFlowWhileRunningOpensItsConnector() {
        second.name = "Sensor 2";
        first.enabled = false;
        start();
        assertFalse(server.connectorByFlowId.containsKey(first.id));

        first.enabled = true;
        synchronized (server.stateLock) {
            server.flowCommandHandler.openSessionsOfUnlockedFlows(group, List.of(first));
        }

        assertConnected(first);
        assertConnected(second);
        assertNotNull("the dispatcher must be rebuilt with the new flow", group.dispatcher);
    }

    @Test
    public void unlockingAFlowOnATakenFileWhileRunningReportsTheConflict() {
        second.enabled = false;
        start();
        assertConnected(first);

        second.enabled = true;
        synchronized (server.stateLock) {
            server.flowCommandHandler.openSessionsOfUnlockedFlows(group, List.of(second));
        }

        assertConnected(first);
        assertFileInUse(second);
    }

    private FlowRuntime newFlow(String id, String name) {
        FlowRuntime flow = new FlowRuntime(id, name, "file", "disconnected", 0, 0, false, null,
                1000, 1, "", "", 0, "{}", "json", true, Map.of());
        flow.connectorConfig = Map.of("outputDir", tempDir.toString());
        return flow;
    }

    private void start() {
        synchronized (server.stateLock) {
            server.flowCommandHandler.startGroupInternal(group);
        }
    }

    private void stop() {
        synchronized (server.stateLock) {
            server.flowCommandHandler.stopGroupInternal(group);
        }
    }

    private void assertConnected(FlowRuntime flow) {
        assertEquals(flow.errorMessage, "connected", flow.connectionStatus);
        assertFalse(flow.hasError);
        assertNull(flow.errorMessage);
        assertTrue(server.connectorByFlowId.containsKey(flow.id));
    }

    private void assertFileInUse(FlowRuntime flow) {
        Path file = tempDir.resolve("Plant").resolve("Sensor_1.json").toAbsolutePath().normalize();
        assertEquals("error", flow.connectionStatus);
        assertTrue(flow.hasError);
        assertEquals(FileConnectorPlugin.fileInUseMessage(file), flow.errorMessage);
        assertFalse(server.connectorByFlowId.containsKey(flow.id));
    }
}
