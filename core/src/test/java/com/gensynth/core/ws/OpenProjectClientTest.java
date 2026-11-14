package com.gensynth.core.ws;

import com.gensynth.core.api.IOpenWindowClient;
import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
import org.java_websocket.WebSocket;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.mockito.ArgumentCaptor;

import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

/**
 * Asks a real, running server to open a project, as the {@code edit} command and a second
 * launch of the application do.
 */
public class OpenProjectClientTest {

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    private UiBridgeWebSocketServer server;
    private Path project;

    @Before
    public void startServer() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        Path stateDir = temp.newFolder("state").toPath();
        server = new UiBridgeWebSocketServer(new InetSocketAddress("127.0.0.1", 0), new ConnectorCatalogService(),
            new JsonStateRepositoryImpl(stateDir.toString()), new PluginInstallerImpl(stateDir)) {
            @Override
            public void onStart() {
                super.onStart();
                started.countDown();
            }
        };
        server.start();
        assertTrue("The server should start", started.await(5, TimeUnit.SECONDS));
        project = Files.writeString(temp.getRoot().toPath().resolve("plant.gsynth"),
            "{\"format\":\"gensynth-project\",\"version\":\"1.0.0\",\"groups\":[],\"variables\":[]}");
    }

    @After
    public void stopServer() {
        server.shutdown();
    }

    private IOpenWindowClient.Outcome send(String filePath) {
        return new OpenProjectClient("127.0.0.1", server.getPort(), 3000).requestOpen(filePath);
    }

    /** The OPEN_PROJECT_REQUESTED messages the window received. */
    private static java.util.List<String> openRequests(WebSocket window) {
        ArgumentCaptor<String> sent = ArgumentCaptor.forClass(String.class);
        verify(window, atLeast(0)).send(sent.capture());
        return sent.getAllValues().stream().filter(m -> m.contains("\"type\":\"OPEN_PROJECT_REQUESTED\"")).toList();
    }

    @Test
    public void theOpenWindowReceivesTheProjectAndComesToTheFront() {
        AtomicInteger raised = new AtomicInteger();
        server.setWindowActivator(raised::incrementAndGet);
        WebSocket window = mock(WebSocket.class);
        when(window.isOpen()).thenReturn(true);
        server.desktopSocket = window;

        assertEquals(IOpenWindowClient.Outcome.SENT, send(project.toString()));

        java.util.List<String> requests = openRequests(window);
        assertEquals(1, requests.size());
        assertTrue(requests.get(0), requests.get(0).contains("plant.gsynth"));
        assertEquals(1, raised.get());
    }

    @Test
    public void aNewProjectIsSentWithoutPath() {
        server.setWindowActivator(() -> { });
        WebSocket window = mock(WebSocket.class);
        when(window.isOpen()).thenReturn(true);
        server.desktopSocket = window;

        assertEquals(IOpenWindowClient.Outcome.SENT, send(null));

        java.util.List<String> requests = openRequests(window);
        assertEquals(1, requests.size());
        assertTrue(requests.get(0), requests.get(0).contains("\"payload\":{}"));
    }

    @Test
    public void aWindowWhoseUiIsStillLoadingGetsTheProjectLater() {
        server.setWindowActivator(() -> { });

        assertEquals(IOpenWindowClient.Outcome.SENT, send(project.toString()));

        assertEquals(project.toString(), server.takePendingOpenProject());
    }

    @Test
    public void invalidFilesAndEnginesWithoutWindowAreRejected() throws Exception {
        IllegalStateException noWindow = assertThrows(IllegalStateException.class, () -> send(project.toString()));
        assertTrue(noWindow.getMessage(), noWindow.getMessage().contains("without its window"));

        server.setWindowActivator(() -> { });
        Path broken = Files.writeString(temp.getRoot().toPath().resolve("broken.gsynth"), "{ not json");
        IllegalStateException invalid = assertThrows(IllegalStateException.class, () -> send(broken.toString()));
        assertTrue(invalid.getMessage(), invalid.getMessage().contains("Not a GenSynth project file"));
        assertNull("nothing waits for the window", server.takePendingOpenProject());
    }

    @Test
    public void anOlderVersionThatCannotOpenProjectsIsExplained() throws Exception {
        com.fasterxml.jackson.databind.ObjectMapper json = new com.fasterxml.jackson.databind.ObjectMapper();

        assertEquals("The open GenSynth window is an older version: close it and try again", OpenProjectClient.explain(
            json.readTree("{\"code\":\"UNSUPPORTED_COMMAND\",\"message\":\"Unsupported command: REQUEST_OPEN_PROJECT\"}")));
        assertEquals("Not a project", OpenProjectClient.explain(
            json.readTree("{\"code\":\"INVALID_PROJECT_FILE\",\"message\":\"Not a project\"}")));
    }

    @Test
    public void nothingListeningMeansNoApplicationIsOpen() throws Exception {
        int freePort;
        try (ServerSocket socket = new ServerSocket(0)) {
            freePort = socket.getLocalPort();
        }

        assertEquals(IOpenWindowClient.Outcome.NOT_RUNNING,
            new OpenProjectClient("127.0.0.1", freePort, 2000).requestOpen(project.toString()));
    }
}
