package com.gensynth.core.ws.dispatch;

import com.gensynth.core.api.IFlowMessageHandler;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Test double for {@link IFlowMessageHandler}: records generated/published messages and the
 * publishing thread, and can block publishing of chosen flows until released.
 */
class FakeMessageHandler implements IFlowMessageHandler {

    final List<String> published = new CopyOnWriteArrayList<>();
    final List<String> publishThreads = new CopyOnWriteArrayList<>();
    final Map<String, AtomicInteger> generatedByFlow = new ConcurrentHashMap<>();
    final Map<String, AtomicInteger> skippedByFlow = new ConcurrentHashMap<>();
    final Map<String, CountDownLatch> blockedFlows = new ConcurrentHashMap<>();
    /** Flows whose message generation fails (generate returns null, like a broken template). */
    final Set<String> failingFlows = ConcurrentHashMap.newKeySet();
    volatile boolean failNextPublish;

    @Override
    public String generate(GroupRuntime group, FlowRuntime flow) {
        if (failingFlows.contains(flow.id)) {
            return null;
        }
        int n = generatedByFlow.computeIfAbsent(flow.id, id -> new AtomicInteger()).incrementAndGet();
        flow.generated.incrementAndGet();
        return flow.id + n;
    }

    @Override
    public void publish(GroupRuntime group, FlowRuntime flow, String payload) {
        CountDownLatch latch = blockedFlows.get(flow.id);
        if (latch != null) {
            try {
                latch.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        if (failNextPublish) {
            failNextPublish = false;
            throw new IllegalStateException("boom");
        }
        publishThreads.add(Thread.currentThread().getName());
        published.add(payload);
        flow.recordSent(System.nanoTime());
    }

    @Override
    public void onTickSkipped(GroupRuntime group, FlowRuntime flow) {
        skippedByFlow.computeIfAbsent(flow.id, id -> new AtomicInteger()).incrementAndGet();
    }

    int generated(String flowId) {
        AtomicInteger count = generatedByFlow.get(flowId);
        return count == null ? 0 : count.get();
    }

    int skipped(String flowId) {
        AtomicInteger count = skippedByFlow.get(flowId);
        return count == null ? 0 : count.get();
    }

    static void await(String message, java.util.function.BooleanSupplier condition) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 3000;
        while (!condition.getAsBoolean()) {
            if (System.currentTimeMillis() > deadline) {
                throw new AssertionError(message);
            }
            Thread.sleep(5);
        }
    }

    static FlowRuntime flow(String id) {
        return new FlowRuntime(id, id, "file", "connected", 0, 0, false, null,
            1000, 1, "t", "localhost", 0, "{}", "json", true, Map.of());
    }

    static GroupRuntime group(String outputMode, FlowRuntime... flows) {
        GroupRuntime group = new GroupRuntime("g", "G", "running", "", 1, outputMode, true);
        group.flows.addAll(List.of(flows));
        return group;
    }
}
