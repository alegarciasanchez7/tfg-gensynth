package com.gensynth.core.ws.handler;

import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import org.junit.After;
import org.junit.Test;

import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class PluginCommandHandlerTest {

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
}
