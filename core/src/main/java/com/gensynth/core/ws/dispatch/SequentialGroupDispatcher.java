package com.gensynth.core.ws.dispatch;

import com.gensynth.core.api.IFlowMessageHandler;
import com.gensynth.core.api.IGroupDispatcher;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Sequential output mode: the messages of every flow of the group go into one FIFO queue,
 * in generation order (tick order, then flow order inside the group), and a single sender
 * thread publishes them in that order.
 *
 * Backpressure: the queue is bounded. If it cannot hold every message due on a tick, the
 * whole tick is skipped for the group (all or nothing, so later flows are not starved).
 */
public class SequentialGroupDispatcher implements IGroupDispatcher {

    /** Default queue capacity, in messages. */
    public static final int DEFAULT_QUEUE_CAPACITY = 10_000;

    private static final Logger logger = LoggerFactory.getLogger(SequentialGroupDispatcher.class);
    private static final long POLL_TIMEOUT_MS = 100;

    private final GroupRuntime group;
    private final IFlowMessageHandler handler;
    private final BlockingQueue<PendingMessage> queue;
    private final Thread sender;
    private volatile boolean closed;

    private record PendingMessage(FlowRuntime flow, String payload) {
    }

    /**
     * Creates the queue and starts the sender thread.
     *
     * @param group         the group being dispatched
     * @param handler       generates and publishes the messages
     * @param queueCapacity maximum number of pending messages
     */
    public SequentialGroupDispatcher(GroupRuntime group, IFlowMessageHandler handler, int queueCapacity) {
        this.group = group;
        this.handler = handler;
        this.queue = new ArrayBlockingQueue<>(Math.max(1, queueCapacity));
        this.sender = new Thread(this::sendLoop, "gensynth-" + group.name + "-sender");
        this.sender.setDaemon(true);
        this.sender.start();
    }

    @Override
    public boolean dispatch(List<FlowRuntime> dueFlows) {
        if (closed || dueFlows.isEmpty()) {
            return false;
        }
        if (queue.remainingCapacity() < dueFlows.size()) {
            for (FlowRuntime flow : dueFlows) {
                handler.onTickSkipped(group, flow);
            }
            return false;
        }

        boolean generated = false;
        for (FlowRuntime flow : dueFlows) {
            String payload = handler.generate(group, flow);
            if (payload == null) {
                continue;
            }
            // Single producer (the clock thread), so the capacity checked above is still available:
            // add() would only throw if that invariant were broken, and the clock logs it
            queue.add(new PendingMessage(flow, payload));
            generated = true;
        }
        return generated;
    }

    private void sendLoop() {
        while (!closed) {
            try {
                PendingMessage message = queue.poll(POLL_TIMEOUT_MS, TimeUnit.MILLISECONDS);
                if (message == null || closed) {
                    continue;
                }
                handler.publish(group, message.flow(), message.payload());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (RuntimeException e) {
                // Keep the sender alive whatever happens to a single message
                logger.warn("Sequential sender of group '{}' failed to publish: {}", group.name, e.getMessage(), e);
            }
        }
    }

    /**
     * @return number of messages waiting in the queue
     */
    public int pendingMessages() {
        return queue.size();
    }

    @Override
    public void shutdown() {
        closed = true;
        // Dropped messages stay counted as generated but not sent
        queue.clear();
    }
}
