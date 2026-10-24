package com.gensynth.core.desktop.bridge;

import org.cef.callback.CefQueryCallback;
import org.junit.Test;

import javax.swing.SwingUtilities;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Only one save, load or folder dialog may be open at a time: a request that arrives while one
 * is open (as when the UI sends the same command again) must not open a second dialog.
 */
public class GensynthMessageRouterTest {

    private static final String LOAD = "{\"type\":\"LOAD_STATE\",\"commandId\":\"cmd_1\",\"payload\":{}}";

    @Test
    public void aSecondDialogRequestIsRejectedWhileTheFirstIsOpen() throws Exception {
        GensynthMessageRouter router = new GensynthMessageRouter(null);
        CountDownLatch dialogOpen = new CountDownLatch(1);
        CountDownLatch closeDialog = new CountDownLatch(1);
        AtomicInteger dialogsShown = new AtomicInteger();

        CefQueryCallback first = mock(CefQueryCallback.class);
        assertTrue(router.runFileDialog(LOAD, first, () -> {
            dialogsShown.incrementAndGet();
            dialogOpen.countDown();
            awaitQuietly(closeDialog);
        }));
        assertTrue(dialogOpen.await(5, TimeUnit.SECONDS));

        CefQueryCallback second = mock(CefQueryCallback.class);
        assertTrue(router.runFileDialog(LOAD, second, dialogsShown::incrementAndGet));
        verify(second).failure(409, "A file dialog is already open");

        closeDialog.countDown();
        SwingUtilities.invokeAndWait(() -> { });
        assertEquals(1, dialogsShown.get());
        verify(first, never()).failure(anyInt(), anyString());

        // Once the dialog is closed, the next request opens one again
        CefQueryCallback third = mock(CefQueryCallback.class);
        router.runFileDialog(LOAD, third, dialogsShown::incrementAndGet);
        SwingUtilities.invokeAndWait(() -> { });
        assertEquals(2, dialogsShown.get());
        verify(third, never()).failure(anyInt(), anyString());
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
