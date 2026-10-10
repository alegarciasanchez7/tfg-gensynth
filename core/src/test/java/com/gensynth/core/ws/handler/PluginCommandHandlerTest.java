package com.gensynth.core.ws.handler;

import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import org.junit.After;
import org.junit.Test;
import org.mockito.ArgumentCaptor;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
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
