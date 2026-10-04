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

public class ParallelGroupDispatcherTest {

    private final FakeMessageHandler handler = new FakeMessageHandler();
    private final FlowRuntime a = FakeMessageHandler.flow("A");
    private final FlowRuntime b = FakeMessageHandler.flow("B");
    private final GroupRuntime group = FakeMessageHandler.group("parallel", a, b);
    private ParallelGroupDispatcher dispatcher;

    @After
    public void tearDown() {
        handler.blockedFlows.values().forEach(CountDownLatch::countDown);
        if (dispatcher != null) {
            dispatcher.shutdown();
        }
    }

    @Test
    public void eachFlowSendsOnItsOwnThread() throws Exception {
        dispatcher = new ParallelGroupDispatcher(group, List.of(a, b), handler);

        assertTrue(dispatcher.dispatch(List.of(a, b)));

        await("both flows should publish", () -> handler.published.size() == 2);
        assertEquals(2, new HashSet<>(handler.publishThreads).size());
        assertTrue(handler.publishThreads.stream().allMatch(name -> name.startsWith("gensynth-G-")));
    }

    @Test
    public void busyFlowSkipsTicksWithoutBlockingTheOthers() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        handler.blockedFlows.put("A", release);
        dispatcher = new ParallelGroupDispatcher(group, List.of(a, b), handler);

        for (int tick = 0; tick < 5; tick++) {
            dispatcher.dispatch(List.of(a, b));
            int expected = tick + 1;
            await("B keeps sending while A is blocked", () -> b.sent.get() == expected);
            Thread.sleep(20); // the worker clears its busy flag right after recording the send
        }

        assertEquals("A generated only the message that is still in progress", 1, handler.generated("A"));
        assertEquals(4, handler.skipped("A"));
        assertEquals(0, a.sent.get());

        release.countDown();
        await("A finishes its message", () -> a.sent.get() == 1);
        Thread.sleep(20);
        dispatcher.dispatch(List.of(a));
        await("A accepts ticks again", () -> a.sent.get() == 2);
    }

    @Test
    public void flowsWithoutWorkerAreIgnored() {
        dispatcher = new ParallelGroupDispatcher(group, List.of(a), handler);
        assertFalse(dispatcher.dispatch(List.of(b)));
    }

    @Test
    public void nothingIsSentAfterShutdown() throws Exception {
        dispatcher = new ParallelGroupDispatcher(group, List.of(a, b), handler);
        dispatcher.shutdown();

        assertFalse(dispatcher.dispatch(List.of(a, b)));
        Thread.sleep(50);
        assertTrue(handler.published.isEmpty());
    }
}
