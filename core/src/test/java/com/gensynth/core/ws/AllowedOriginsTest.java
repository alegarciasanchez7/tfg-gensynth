package com.gensynth.core.ws;

import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.*;

public class AllowedOriginsTest {

    @Test
    public void acceptsTheGenSynthUiAndClientsWithoutAnOrigin() {
        assertTrue(AllowedOrigins.isAllowed("http://gensynth.local"));
        assertTrue("Development server", AllowedOrigins.isAllowed("http://localhost:5173"));
        assertTrue(AllowedOrigins.isAllowed("http://127.0.0.1:5199"));
        assertTrue(AllowedOrigins.isAllowed("http://[::1]:5173"));
        assertTrue("Not a browser", AllowedOrigins.isAllowed(null));
        assertTrue("Not a browser", AllowedOrigins.isAllowed(""));
    }

    @Test
    public void rejectsEveryOtherWebPage() {
        assertFalse(AllowedOrigins.isAllowed("https://evil.example.org"));
        assertFalse("Look-alike host", AllowedOrigins.isAllowed("http://localhost.evil.example.org"));
        assertFalse("Look-alike host", AllowedOrigins.isAllowed("http://gensynth.local.evil.example.org"));
        assertFalse("Sandboxed frames and local files", AllowedOrigins.isAllowed("null"));
        assertFalse(AllowedOrigins.isAllowed("file:///home/user/page.html"));
        assertFalse(AllowedOrigins.isAllowed("http://user@localhost"));
        assertFalse(AllowedOrigins.isAllowed("not a url"));
    }

    // ============ Real connections ============

    private UiBridgeWebSocketServer server;

    @Before
    public void startServer() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-ws-test-origin-");
        CountDownLatch started = new CountDownLatch(1);
        server = new UiBridgeWebSocketServer(new InetSocketAddress("127.0.0.1", 0), new ConnectorCatalogService(),
            new JsonStateRepositoryImpl(tempDir.toString()), new PluginInstallerImpl(tempDir)) {
            @Override
            public void onStart() {
                super.onStart();
                started.countDown();
            }
        };
        server.start();
        assertTrue("The server should start", started.await(5, TimeUnit.SECONDS));
    }

    @After
    public void stopServer() {
        server.shutdown();
    }

    private boolean connects(Map<String, String> headers) throws Exception {
        WebSocketClient client = new WebSocketClient(URI.create("ws://127.0.0.1:" + server.getPort()), headers) {
            // Only whether the connection opens matters: the messages are not needed
            @Override
            public void onOpen(ServerHandshake handshake) {
                // Nothing to do: connects() checks isOpen()
            }

            @Override
            public void onMessage(String message) {
                // The Core's greetings are not needed by these tests
            }

            @Override
            public void onClose(int code, String reason, boolean remote) {
                // A rejected handshake closes the connection: connects() returns false
            }

            @Override
            public void onError(Exception ex) {
                // A rejected handshake is reported here: connects() returns false
            }
        };
        try {
            return client.connectBlocking(3, TimeUnit.SECONDS) && client.isOpen();
        } finally {
            client.closeBlocking();
        }
    }

    @Test
    public void aWebPageOnAnotherSiteCannotConnect() throws Exception {
        assertFalse(connects(Map.of("Origin", "https://evil.example.org")));
        assertEquals(0, server.getConnections().size());
    }

    @Test
    public void theUiAndOtherLocalClientsConnect() throws Exception {
        assertTrue(connects(Map.of("Origin", "http://gensynth.local")));
        assertTrue(connects(Map.of("Origin", "http://localhost:5173")));
        assertTrue("A client that is not a browser sends no Origin", connects(Map.of()));
    }
}
