package com.gensynth.core.ws.dispatch;

import com.gensynth.core.model.SequentialOrder;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.junit.After;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
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
        handler.blockedGenerations.values().forEach(CountDownLatch::countDown);
        if (dispatcher != null) {
            dispatcher.shutdown();
        }
    }

    @Test
    public void publishesInGenerationOrderFromASingleThread() throws Exception {
        dispatcher = new SequentialGroupDispatcher(group, handler, 100);

        assertTrue(dispatcher.dispatch(List.of(a, b, c), 0L));
        assertTrue(dispatcher.dispatch(List.of(a, b, c), 0L));
        assertTrue(dispatcher.dispatch(List.of(a, c), 0L));

        await("all messages published", () -> handler.published.size() == 8);
        assertEquals(List.of("A1", "B1", "C1", "A2", "B2", "C2", "A3", "C3"), handler.published);
        assertEquals(1, new HashSet<>(handler.publishThreads).size());
        assertEquals("gensynth-G-sender", handler.publishThreads.get(0));
    }

    @Test
    public void queuedMessagesKeepTheGroupTickThatGeneratedThem() throws Exception {
        dispatcher = new SequentialGroupDispatcher(group, handler, 100);

        assertTrue(dispatcher.dispatch(List.of(a, b), 3L));
        assertTrue(dispatcher.dispatch(List.of(a), 4L));

        await("all messages published", () -> handler.published.size() == 3);
        assertEquals(List.of(3L, 3L, 4L), handler.publishedTicks);
    }

    @Test
    public void fullQueueSkipsTheWholeTick() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        handler.blockedFlows.put("A", release);
        dispatcher = new SequentialGroupDispatcher(group, handler, 2);

        assertTrue(dispatcher.dispatch(List.of(a), 0L));
        await("sender takes A1 and blocks on it", () -> dispatcher.pendingMessages() == 0);
        assertTrue(dispatcher.dispatch(List.of(b, c), 0L));

        // Queue (capacity 2) is full: the next tick is skipped for every due flow
        assertFalse(dispatcher.dispatch(List.of(a, b), 0L));
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

        dispatcher.dispatch(List.of(a, b, c), 0L);
        await("sender takes A1", () -> dispatcher.pendingMessages() == 2);
        dispatcher.shutdown();
        release.countDown();
        Thread.sleep(250);

        assertEquals("only the message in progress is sent", List.of("A1"), handler.published);
        assertEquals("dropped messages are generated but not sent", 1, b.generated.get() - b.sent.get());
        assertFalse(dispatcher.dispatch(List.of(a), 0L));
    }

    @Test
    public void aMessageThatFailsToGenerateIsNotQueued() throws Exception {
        handler.failingFlows.add("A");
        dispatcher = new SequentialGroupDispatcher(group, handler, 100);

        assertFalse("nothing generated", dispatcher.dispatch(List.of(a), 0L));
        assertTrue(dispatcher.dispatch(List.of(a, b), 0L));

        await("the other flow is still sent", () -> handler.published.size() == 1);
        assertEquals(List.of("B1"), handler.published);
        assertEquals(0, handler.skipped("A"));
    }

    @Test
    public void aFailingPublishDoesNotStopTheSender() throws Exception {
        handler.failNextPublish = true;
        dispatcher = new SequentialGroupDispatcher(group, handler, 100);

        dispatcher.dispatch(List.of(a, b), 0L);

        await("the next message is still sent", () -> handler.published.size() == 1);
        assertEquals(List.of("B1"), handler.published);
    }

    // ============ Sequential order ============

    private SequentialGroupDispatcher dispatcher(SequentialOrder order, Random random, int capacity) {
        return new SequentialGroupDispatcher(group, List.of(a, b, c), handler, capacity, order, random);
    }

    @Test
    public void randomOrderShufflesEveryTickWithTheGivenRandom() throws Exception {
        dispatcher = dispatcher(SequentialOrder.RANDOM, new Random(42), 100);
        Random expected = new Random(42);
        List<String> expectedOrder = new ArrayList<>();
        for (int tick = 1; tick <= 5; tick++) {
            List<FlowRuntime> due = new ArrayList<>(List.of(a, b, c));
            Collections.shuffle(due, expected);
            for (FlowRuntime flow : due) {
                expectedOrder.add(flow.id + tick);
            }
            assertTrue(dispatcher.dispatch(List.of(a, b, c), tick));
        }

        await("all messages published", () -> handler.published.size() == 15);
        assertEquals(expectedOrder, handler.published);
        assertNotEquals("Five shuffles of three flows are not all in list order",
            List.of("A1", "B1", "C1", "A2", "B2", "C2", "A3", "B3", "C3", "A4", "B4", "C4", "A5", "B5", "C5"),
            handler.published);
    }

    @Test
    public void generatedOrderQueuesTheMessagesAsTheyAreReady() throws Exception {
        CountDownLatch slowA = new CountDownLatch(1);
        handler.blockedGenerations.put("A", slowA);
        dispatcher = dispatcher(SequentialOrder.GENERATED, new Random(), 100);

        assertTrue(dispatcher.dispatch(List.of(a, b, c), 1L));
        await("B and C published while A is still generating", () -> handler.published.size() == 2);
        slowA.countDown();

        await("A published last", () -> handler.published.size() == 3);
        assertEquals("A1", handler.published.get(2));
        assertEquals(1, new HashSet<>(handler.publishThreads).size());
        assertEquals("gensynth-G-sender", handler.publishThreads.get(0));
        assertFalse("Generation runs on the flows' own threads", handler.generateThreads.contains(Thread.currentThread().getName()));
    }

    @Test
    public void generatedOrderSkipsTheTickOfAFlowStillGenerating() throws Exception {
        CountDownLatch slowA = new CountDownLatch(1);
        handler.blockedGenerations.put("A", slowA);
        dispatcher = dispatcher(SequentialOrder.GENERATED, new Random(), 100);

        assertTrue(dispatcher.dispatch(List.of(a, b), 1L));
        await("B1 published", () -> handler.published.contains("B1"));
        assertTrue(dispatcher.dispatch(List.of(a, b), 2L));
        await("B2 published", () -> handler.published.contains("B2"));

        assertEquals(1, handler.skipped("A"));
        slowA.countDown();
        await("A1 published", () -> handler.published.contains("A1"));
        assertEquals(1, handler.generated("A"));
    }

    @Test
    public void generatedOrderFullQueueSkipsTheWholeTick() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        handler.blockedFlows.put("A", release);
        dispatcher = dispatcher(SequentialOrder.GENERATED, new Random(), 2);

        assertTrue(dispatcher.dispatch(List.of(a), 1L));
        await("sender busy with A1", () -> handler.generated("A") == 1 && dispatcher.pendingMessages() == 0);
        assertTrue(dispatcher.dispatch(List.of(b, c), 2L));
        await("B2 and C2 queued", () -> dispatcher.pendingMessages() == 2);

        assertFalse(dispatcher.dispatch(List.of(b), 3L));
        assertEquals(1, handler.skipped("B"));
        release.countDown();
        await("all queued messages published", () -> handler.published.size() == 3);
    }

    @Test
    public void aFailedGenerationGivesItsPlaceBack() throws Exception {
        handler.failingFlows.add("A");
        for (SequentialOrder order : List.of(SequentialOrder.FLOW, SequentialOrder.GENERATED)) {
            handler.published.clear();
            dispatcher = dispatcher(order, new Random(), 1);
            for (int tick = 1; tick <= 3; tick++) {
                dispatcher.dispatch(List.of(a), tick);
            }
            // With capacity 1, B can only be queued if A's failed generations freed their place
            final SequentialGroupDispatcher current = dispatcher;
            await(order + ": the place of A is free again", () -> current.dispatch(List.of(b), 9L));
            await(order + ": B published", () -> !handler.published.isEmpty());
            dispatcher.shutdown();
        }
    }

    @Test
    public void shutdownWhileGeneratingDropsTheMessage() throws Exception {
        CountDownLatch slowA = new CountDownLatch(1);
        handler.blockedGenerations.put("A", slowA);
        dispatcher = dispatcher(SequentialOrder.GENERATED, new Random(), 100);

        assertTrue(dispatcher.dispatch(List.of(a), 1L));
        await("A is generating", () -> !handler.generateThreads.isEmpty());
        dispatcher.shutdown();
        slowA.countDown();

        Thread.sleep(200);
        assertTrue(handler.published.isEmpty());
        assertEquals(0, dispatcher.pendingMessages());
    }
}
