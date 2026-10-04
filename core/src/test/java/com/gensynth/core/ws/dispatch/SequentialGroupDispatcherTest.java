package com.gensynth.core.ws.dispatch;

import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.junit.After;
import org.junit.Test;

import java.util.HashSet;
import java.util.List;
import java.util.concurrent.CountDownLatch;

import static com.gensynth.core.ws.dispatch.FakeMessageHandler.await;
import static org.junit.Assert.*;

public class SequentialGroupDispatcherTest {

    private final FakeMessageHandler handler = new FakeMessageHandler();
    private final FlowRuntime a = FakeMessageHandler.flow("A");
    private final FlowRuntime b = FakeMessageHandler.flow("B");
    private final FlowRuntime c = FakeMessageHandler.flow("C");
    private final GroupRuntime group = FakeMessageHandler.group("sequential", a, b, c);
    private SequentialGroupDispatcher dispatcher;

    @After
    public void tearDown() {
        handler.blockedFlows.values().forEach(CountDownLatch::countDown);
        if (dispatcher != null) {
            dispatcher.shutdown();
        }
    }

    @Test
    public void publishesInGenerationOrderFromASingleThread() throws Exception {
        dispatcher = new SequentialGroupDispatcher(group, handler, 100);

        assertTrue(dispatcher.dispatch(List.of(a, b, c)));
        assertTrue(dispatcher.dispatch(List.of(a, b, c)));
        assertTrue(dispatcher.dispatch(List.of(a, c)));

        await("all messages published", () -> handler.published.size() == 8);
        assertEquals(List.of("A1", "B1", "C1", "A2", "B2", "C2", "A3", "C3"), handler.published);
        assertEquals(1, new HashSet<>(handler.publishThreads).size());
        assertEquals("gensynth-G-sender", handler.publishThreads.get(0));
    }

    @Test
    public void fullQueueSkipsTheWholeTick() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        handler.blockedFlows.put("A", release);
        dispatcher = new SequentialGroupDispatcher(group, handler, 2);

        assertTrue(dispatcher.dispatch(List.of(a)));
        await("sender takes A1 and blocks on it", () -> dispatcher.pendingMessages() == 0);
        assertTrue(dispatcher.dispatch(List.of(b, c)));

        // Queue (capacity 2) is full: the next tick is skipped for every due flow
        assertFalse(dispatcher.dispatch(List.of(a, b)));
        assertEquals(1, handler.skipped("A"));
        assertEquals(1, handler.skipped("B"));
        assertEquals(1, handler.generated("A"));

        release.countDown();
        await("queued messages are sent", () -> handler.published.size() == 3);
        assertEquals(List.of("A1", "B1", "C1"), handler.published);
    }

    @Test
    public void shutdownDropsPendingMessages() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        handler.blockedFlows.put("A", release);
        dispatcher = new SequentialGroupDispatcher(group, handler, 100);

        dispatcher.dispatch(List.of(a, b, c));
        await("sender takes A1", () -> dispatcher.pendingMessages() == 2);
        dispatcher.shutdown();
        release.countDown();
        Thread.sleep(250);

        assertEquals("only the message in progress is sent", List.of("A1"), handler.published);
        assertEquals("dropped messages are generated but not sent", 1, b.generated.get() - b.sent.get());
        assertFalse(dispatcher.dispatch(List.of(a)));
    }

    @Test
    public void aFailingPublishDoesNotStopTheSender() throws Exception {
        handler.failNextPublish = true;
        dispatcher = new SequentialGroupDispatcher(group, handler, 100);

        dispatcher.dispatch(List.of(a, b));

        await("the next message is still sent", () -> handler.published.size() == 1);
        assertEquals(List.of("B1"), handler.published);
    }
}
