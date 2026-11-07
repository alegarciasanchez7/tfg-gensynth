package com.gensynth.core.ws;

import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
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

    private OpenProjectClient.Outcome send(String filePath) {
        return OpenProjectClient.send("127.0.0.1", server.getPort(), filePath, 3000);
    }

    @Test
    public void theOpenWindowReceivesTheProjectAndComesToTheFront() {
        AtomicInteger raised = new AtomicInteger();
        server.setWindowActivator(raised::incrementAndGet);
        DesktopBridgeSocket window = mock(DesktopBridgeSocket.class);
        when(window.isOpen()).thenReturn(true);
        server.desktopSocket = window;

        assertEquals(OpenProjectClient.Outcome.SENT, send(project.toString()));

        ArgumentCaptor<String> pushed = ArgumentCaptor.forClass(String.class);
        verify(window).push(pushed.capture());
        assertTrue(pushed.getValue(), pushed.getValue().contains("\"type\":\"OPEN_PROJECT_REQUESTED\""));
        assertTrue(pushed.getValue(), pushed.getValue().contains("plant.gsynth"));
        // Pushed, never sent as the answer of a UI command
        verify(window, never()).send(anyString());
        assertEquals(1, raised.get());
    }

    @Test
    public void aNewProjectIsSentWithoutPath() {
        server.setWindowActivator(() -> { });
        DesktopBridgeSocket window = mock(DesktopBridgeSocket.class);
        when(window.isOpen()).thenReturn(true);
        server.desktopSocket = window;

        assertEquals(OpenProjectClient.Outcome.SENT, send(null));

        ArgumentCaptor<String> pushed = ArgumentCaptor.forClass(String.class);
        verify(window).push(pushed.capture());
        assertTrue(pushed.getValue(), pushed.getValue().contains("\"payload\":{}"));
    }

    @Test
    public void aWindowWhoseUiIsStillLoadingGetsTheProjectLater() {
        server.setWindowActivator(() -> { });

        assertEquals(OpenProjectClient.Outcome.SENT, send(project.toString()));

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

        assertEquals(OpenProjectClient.Outcome.NOT_RUNNING,
            OpenProjectClient.send("127.0.0.1", freePort, project.toString(), 2000));
    }
}
