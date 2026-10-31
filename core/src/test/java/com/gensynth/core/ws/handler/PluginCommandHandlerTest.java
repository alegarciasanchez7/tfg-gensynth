package com.gensynth.core.ws.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.api.IPluginInstaller;
import com.gensynth.core.connectors.plugin.PluginInstallResult;
import com.gensynth.core.connectors.plugin.PluginValidationResult;
import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import org.java_websocket.WebSocket;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;

import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

public class PluginCommandHandlerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String JAR_BASE64 = Base64.getEncoder().encodeToString(new byte[] {1, 2, 3});

    private final BridgeContext ctx = mock(BridgeContext.class);
    private final UiBridgeWebSocketServer server = mock(UiBridgeWebSocketServer.class);
    private final IPluginInstaller installer = mock(IPluginInstaller.class);
    private final ScheduledExecutorService scheduler = mock(ScheduledExecutorService.class);
    private final WebSocket conn = mock(WebSocket.class);
    private PluginCommandHandler handler;

    @Before
    public void setUp() {
        when(ctx.getServer()).thenReturn(server);
        when(ctx.getPluginInstaller()).thenReturn(installer);
        when(ctx.getScheduler()).thenReturn(scheduler);
        // The real field check, so a missing field sends INVALID_PAYLOAD to the (mocked) client
        doCallRealMethod().when(server).requireTextField(any(), any(), any(), anyString(), anyString(), anyString());
        handler = new PluginCommandHandler(ctx);
    }

    private static JsonNode jarPayload(String jarBase64) {
        return MAPPER.valueToTree(Map.of("jarBase64", jarBase64, "pluginName", "mqtt.jar", "pluginVersion", "1.0.0"));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> sentPayload(String type) {
        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(server).sendMessage(eq(conn), eq(type), eq("c1"), payload.capture());
        return (Map<String, Object>) payload.getValue();
    }

    @Test
    public void validateSendsTheResultOfTheInstaller() {
        when(installer.validate(any(), eq("mqtt.jar"), eq("1.0.0"))).thenReturn(new PluginValidationResult.Builder()
            .pluginId("mqtt").displayName("MQTT").pluginVersion("1.0.0").apiVersion("1.0").fieldCount(3).build());

        handler.handleValidatePlugin(conn, jarPayload(JAR_BASE64), "c1");

        Map<String, Object> result = sentPayload("PLUGIN_VALIDATION_RESULT");
        assertEquals(true, result.get("valid"));
        assertEquals("mqtt", result.get("pluginId"));
        assertEquals(3, result.get("fieldCount"));
        verify(server).logToBackend(eq("info"), eq("PLUGINS"), startsWith("Plugin validation passed"), eq("c1"));
    }

    @Test
    public void aFailedValidationIsLoggedAsAWarning() {
        when(installer.validate(any(), anyString(), anyString())).thenReturn(PluginValidationResult.failure("blocked API"));

        handler.handleValidatePlugin(conn, jarPayload(JAR_BASE64), "c1");

        assertEquals(false, sentPayload("PLUGIN_VALIDATION_RESULT").get("valid"));
        verify(server).logToBackend(eq("warn"), eq("PLUGINS"), startsWith("Plugin validation failed"), eq("c1"));
    }

    @Test
    public void invalidBase64IsRejectedBeforeTheInstaller() {
        handler.handleValidatePlugin(conn, jarPayload("not base64!"), "c1");
        handler.handleInstallPlugin(conn, jarPayload("not base64!"), "c2");

        verify(server).sendError(eq(conn), eq("c1"), eq("INVALID_PAYLOAD"), anyString(), anyMap());
        verify(server).sendError(eq(conn), eq("c2"), eq("INVALID_PAYLOAD"), anyString(), anyMap());
        verifyNoInteractions(installer);
    }

    @Test
    public void missingFieldsAreRejectedBeforeTheInstaller() {
        JsonNode empty = MAPPER.createObjectNode();

        handler.handleValidatePlugin(conn, empty, "c1");
        handler.handleInstallPlugin(conn, empty, "c2");
        handler.handleUninstallPlugin(conn, empty, "c3");

        // One error per missing field
        verify(server, times(3)).sendError(eq(conn), eq("c1"), eq("INVALID_PAYLOAD"), anyString(), anyMap());
        verify(server, times(3)).sendError(eq(conn), eq("c2"), eq("INVALID_PAYLOAD"), anyString(), anyMap());
        verify(server, times(2)).sendError(eq(conn), eq("c3"), eq("INVALID_PAYLOAD"), anyString(), anyMap());
        verifyNoInteractions(installer);
    }

    @Test
    public void successfulInstallSavesTheStateAndSchedulesTheRestart() {
        WebSocket open = mock(WebSocket.class);
        WebSocket closed = mock(WebSocket.class);
        when(open.isOpen()).thenReturn(true);
        when(server.getConnections()).thenReturn(List.of(open, closed));
        when(installer.install(any(), eq("mqtt.jar"), eq("1.0.0")))
            .thenReturn(PluginInstallResult.success("installed", "mqtt"));

        handler.handleInstallPlugin(conn, jarPayload(JAR_BASE64), "c1");

        Map<String, Object> result = sentPayload("PLUGIN_INSTALL_RESULT");
        assertEquals("ok", result.get("status"));
        assertEquals(true, result.get("restartRequired"));
        verify(server).persistState();
        verify(server).sendMessage(eq(open), eq("RESTART_REQUIRED"), isNull(), any());
        verify(server, never()).sendMessage(eq(closed), anyString(), any(), any());
        verify(scheduler).schedule(any(Runnable.class), eq(3L), eq(TimeUnit.SECONDS));
    }

    @Test
    public void failedInstallReportsTheErrorWithoutRestarting() {
        when(installer.install(any(), anyString(), anyString())).thenReturn(PluginInstallResult.failure("duplicated"));

        handler.handleInstallPlugin(conn, jarPayload(JAR_BASE64), "c1");

        Map<String, Object> result = sentPayload("PLUGIN_INSTALL_RESULT");
        assertEquals("error", result.get("status"));
        assertEquals("duplicated", result.get("message"));
        verify(server).logToBackend(eq("error"), eq("PLUGINS"), eq("Plugin install failed: duplicated"), eq("c1"));
        verify(server, never()).persistState();
        verify(scheduler, never()).schedule(any(Runnable.class), anyLong(), any());
    }

    @Test
    public void uninstallRestartsOnlyWhenItSucceeds() {
        when(server.getConnections()).thenReturn(List.of());
        when(installer.uninstall("mqtt", "1.0.0")).thenReturn(PluginInstallResult.success("removed", "mqtt"));
        when(installer.uninstall("kafka", "1.0.0")).thenReturn(PluginInstallResult.failure("not installed"));

        handler.handleUninstallPlugin(conn, MAPPER.valueToTree(Map.of("pluginId", "mqtt", "pluginVersion", "1.0.0")), "c1");
        handler.handleUninstallPlugin(conn, MAPPER.valueToTree(Map.of("pluginId", "kafka", "pluginVersion", "1.0.0")), "c2");

        verify(server).persistState();
        verify(scheduler).schedule(any(Runnable.class), eq(3L), eq(TimeUnit.SECONDS));
        verify(server).logToBackend(eq("error"), eq("PLUGINS"), eq("Plugin uninstall failed: not installed"), eq("c2"));
    }

    @After
    public void clearInterruptStatus() {
        // Never leak an interrupt into the next test
        Thread.interrupted();
    }

    @Test
    public void restartInterruptedWhileStoppingTheServerKeepsTheInterruptStatus() throws Exception {
        BridgeContext ctx = mock(BridgeContext.class);
        UiBridgeWebSocketServer server = mock(UiBridgeWebSocketServer.class);
        when(ctx.getServer()).thenReturn(server);
        // Throwing here also guarantees the real restart (which exits the JVM) is never reached
        doThrow(new InterruptedException("stop interrupted")).when(server).stop(1000);

        new PluginCommandHandler(ctx).restartAfterPluginInstall();

        assertTrue("the interrupt must be restored for the caller", Thread.currentThread().isInterrupted());
    }

    @Test
    public void restartRunsOnItsOwnThreadSoShuttingTheSchedulerDownCannotInterruptIt() throws Exception {
        BridgeContext ctx = mock(BridgeContext.class);
        UiBridgeWebSocketServer server = mock(UiBridgeWebSocketServer.class);
        ScheduledExecutorService scheduler = mock(ScheduledExecutorService.class);
        when(ctx.getServer()).thenReturn(server);
        when(ctx.getScheduler()).thenReturn(scheduler);
        CompletableFuture<String> restartThread = new CompletableFuture<>();
        // Stops the restart before the real one (which exits the JVM), recording where it ran
        doAnswer(invocation -> {
            restartThread.complete(Thread.currentThread().getName());
            throw new InterruptedException("stop the test here");
        }).when(server).stop(1000);

        new PluginCommandHandler(ctx).scheduleRestart();

        ArgumentCaptor<Runnable> scheduled = ArgumentCaptor.forClass(Runnable.class);
        verify(scheduler).schedule(scheduled.capture(), eq(3L), eq(TimeUnit.SECONDS));
        scheduled.getValue().run();
        assertEquals(PluginCommandHandler.RESTART_THREAD_NAME, restartThread.get(5, TimeUnit.SECONDS));
    }
}
