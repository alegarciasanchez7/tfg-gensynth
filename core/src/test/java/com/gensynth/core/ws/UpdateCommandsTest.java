package com.gensynth.core.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.api.IUpdateService;
import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
import com.gensynth.core.update.UpdateCheck;
import com.gensynth.core.ws.handler.UpdateCommandHandler;
import org.java_websocket.WebSocket;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

/**
 * Tests the update commands with a fake update service: nothing is downloaded or installed.
 */
public class UpdateCommandsTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private UiBridgeWebSocketServer server;
    private UpdateCommandHandler handler;
    private FakeUpdateService service;
    private WebSocket conn;

    /** Update service whose answers each test chooses. */
    private static final class FakeUpdateService implements IUpdateService {
        volatile String reason;
        volatile UpdateCheck check = new UpdateCheck("0.5.2", "0.5.3", true, "https://github.com/x", "GenSynth-installer-0.5.3.deb",
            "https://github.com/x.deb", 100, "https://github.com/sums");
        volatile IOException checkError;
        volatile CountDownLatch blockDownload;
        final AtomicInteger checks = new AtomicInteger();
        final AtomicReference<Path> installed = new AtomicReference<>();

        @Override
        public String currentVersion() {
            return "0.5.2";
        }

        @Override
        public String unsupportedReason() {
            return reason;
        }

        @Override
        public UpdateCheck check() throws IOException {
            checks.incrementAndGet();
            if (checkError != null) {
                throw checkError;
            }
            return check;
        }

        @Override
        public Path download(UpdateCheck update, DownloadProgress progress) throws InterruptedException {
            progress.onProgress(50, 100);
            CountDownLatch latch = blockDownload;
            if (latch != null && !latch.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("download never released");
            }
            if (Thread.currentThread().isInterrupted()) {
                throw new InterruptedException("cancelled");
            }
            progress.onProgress(100, 100);
            progress.onVerifying();
            return Path.of("installer.deb");
        }

        @Override
        public void install(Path installer) {
            installed.set(installer);
        }

        @Override
        public boolean closesAppToInstall() {
            return false;
        }
    }

    @Before
    public void setUp() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-ws-test-updates-");
        server = new UiBridgeWebSocketServer(new InetSocketAddress("localhost", 0), new ConnectorCatalogService(),
            new JsonStateRepositoryImpl(tempDir.toString()), new PluginInstallerImpl(tempDir));
        conn = mock(WebSocket.class);
        when(conn.isOpen()).thenReturn(true);
        // Broadcasts reach the desktop socket too: use the same mock to capture them
        server.desktopSocket = conn;
        service = new FakeUpdateService();
        handler = new UpdateCommandHandler(server.bridgeContext, service, Executors.newSingleThreadExecutor());
    }

    @After
    public void tearDown() {
        handler.shutdown();
        server.shutdown();
    }

    private List<JsonNode> messages() throws Exception {
        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(conn, atLeast(0)).send(captor.capture());
        List<JsonNode> result = new ArrayList<>();
        for (String message : captor.getAllValues()) {
            result.add(MAPPER.readTree(message));
        }
        return result;
    }

    private JsonNode await(String type, String commandId) throws Exception {
        long deadline = System.currentTimeMillis() + 3000;
        while (System.currentTimeMillis() < deadline) {
            for (JsonNode message : messages()) {
                if (type.equals(message.path("type").asText())
                        && (commandId == null || commandId.equals(message.path("commandId").asText()))) {
                    return message;
                }
            }
            Thread.sleep(10);
        }
        throw new AssertionError("No " + type + " for " + commandId);
    }

    private List<String> phases() throws Exception {
        List<String> phases = new ArrayList<>();
        for (JsonNode message : messages()) {
            if ("UPDATE_STATUS".equals(message.path("type").asText())) {
                phases.add(message.path("payload").path("phase").asText());
            }
        }
        return phases;
    }

    private void install(String commandId, String version) {
        handler.handleInstallUpdate(conn, MAPPER.createObjectNode().put("version", version), commandId);
    }

    private void awaitPhase(String phase) throws Exception {
        long deadline = System.currentTimeMillis() + 3000;
        while (!phases().contains(phase)) {
            if (System.currentTimeMillis() > deadline) {
                throw new AssertionError("No phase " + phase + " in " + phases());
            }
            Thread.sleep(10);
        }
    }

    @Test
    public void anUnsupportedInstallationAnswersWithoutCheckingTheNetwork() throws Exception {
        service.reason = "Updates are only available in the installed application.";

        handler.handleCheckForUpdates(conn, "c1");
        install("c2", "0.5.3");

        JsonNode ack = await("CONNECTION_STATUS", "c1").path("payload");
        assertFalse(ack.path("supported").asBoolean());
        assertFalse(ack.path("available").asBoolean());
        assertEquals(service.reason, ack.path("reason").asText());
        assertEquals("UPDATE_NOT_SUPPORTED", await("ERROR", "c2").path("payload").path("code").asText());
        assertEquals(0, service.checks.get());
    }

    @Test
    public void checkReportsTheLatestReleaseOrTheError() throws Exception {
        handler.handleCheckForUpdates(conn, "c1");
        JsonNode ack = await("CONNECTION_STATUS", "c1").path("payload");
        assertTrue(ack.path("supported").asBoolean());
        assertTrue(ack.path("available").asBoolean());
        assertEquals("0.5.3", ack.path("latestVersion").asText());

        service.checkError = new IOException("offline");
        handler.handleCheckForUpdates(conn, "c2");
        JsonNode error = await("ERROR", "c2").path("payload");
        assertEquals("UPDATE_CHECK_FAILED", error.path("code").asText());
        assertNull("A check never installs", service.installed.get());
    }

    @Test
    public void installDownloadsVerifiesAndInstallsTheAcceptedVersion() throws Exception {
        install("c1", "0.5.3");

        assertEquals("update_started", await("CONNECTION_STATUS", "c1").path("payload").path("result").asText());
        awaitPhase("installing");
        assertEquals(List.of("downloading", "downloading", "downloading", "verifying", "installing"), phases());
        assertEquals(Path.of("installer.deb"), service.installed.get());
    }

    @Test
    public void aVersionThatIsNoLongerTheLatestIsNotInstalled() throws Exception {
        install("c1", "0.5.4");

        awaitPhase("failed");
        assertNull(service.installed.get());
    }

    @Test
    public void onlyOneUpdateRunsAtATimeAndItCanBeCancelledWhileDownloading() throws Exception {
        service.blockDownload = new CountDownLatch(1);
        install("c1", "0.5.3");
        awaitPhase("downloading");

        install("c2", "0.5.3");
        assertEquals("UPDATE_IN_PROGRESS", await("ERROR", "c2").path("payload").path("code").asText());

        handler.handleCancelUpdate(conn, "c3");
        assertTrue(await("CONNECTION_STATUS", "c3").path("payload").path("cancelled").asBoolean());
        awaitPhase("cancelled");
        Thread.sleep(200);
        assertNull("A cancelled update installs nothing", service.installed.get());
        assertFalse(phases().contains("installing"));

        // The next update can start again
        service.blockDownload = null;
        install("c4", "0.5.3");
        awaitPhase("installing");
    }
}
