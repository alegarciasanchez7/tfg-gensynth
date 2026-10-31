package com.gensynth.core.ws.dispatch;

import com.gensynth.core.api.IFlowMessageHandler;
import com.gensynth.core.api.IGroupDispatcher;
import com.gensynth.core.model.SequentialOrder;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * Sequential output mode: the messages of every flow of the group go into one FIFO queue
 * and a single sender thread publishes them in that order. Messages of different ticks keep
 * tick order; inside a tick, the {@link SequentialOrder} decides:
 * <ul>
 *   <li>{@link SequentialOrder#FLOW}: the order of the group's flow list;</li>
 *   <li>{@link SequentialOrder#RANDOM}: a new random order on every tick;</li>
 *   <li>{@link SequentialOrder#GENERATED}: the flows generate at the same time, each on its
 *       own thread, and every message is queued as soon as it is ready. A flow still
 *       generating when its next tick arrives skips that tick.</li>
 * </ul>
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
    private final SequentialOrder order;
    private final Random random;
    private final BlockingQueue<PendingMessage> queue;
    /** Free places in the queue, taken when a message is due and given back when it leaves the queue. */
    private final Semaphore slots;
    /** Generation threads, only for {@link SequentialOrder#GENERATED}. */
    private final FlowWorkers workers;
    private final Thread sender;
    private volatile boolean closed;

    /** A generated message waiting to be published, with the group tick that generated it. */
    private record PendingMessage(FlowRuntime flow, String payload, long groupTick) {
    }

    /**
     * Creates a dispatcher that queues the messages in the order of the group's flow list.
     *
     * @param group         the group being dispatched
     * @param handler       generates and publishes the messages
     * @param queueCapacity maximum number of pending messages
     */
    public SequentialGroupDispatcher(GroupRuntime group, IFlowMessageHandler handler, int queueCapacity) {
        this(group, List.of(), handler, queueCapacity, SequentialOrder.FLOW, new Random());
    }

    /**
     * Creates the queue, the generation threads (for {@link SequentialOrder#GENERATED}) and
     * starts the sender thread.
     *
     * @param group         the group being dispatched
     * @param flows         flows that can send (those with a started connector)
     * @param handler       generates and publishes the messages
     * @param queueCapacity maximum number of pending messages
     * @param order         order of the messages due on the same tick
     * @param random        source of the random order; only used by the clock thread
     */
    public SequentialGroupDispatcher(GroupRuntime group, List<FlowRuntime> flows, IFlowMessageHandler handler,
                                     int queueCapacity, SequentialOrder order, Random random) {
        this.group = group;
        this.handler = handler;
        this.order = order == null ? SequentialOrder.FLOW : order;
        this.random = random;
        int capacity = Math.max(1, queueCapacity);
        this.queue = new ArrayBlockingQueue<>(capacity);
        this.slots = new Semaphore(capacity);
        this.workers = this.order == SequentialOrder.GENERATED ? new FlowWorkers(group, flows) : null;
        this.sender = new Thread(this::sendLoop, "gensynth-" + group.name + "-sender");
        this.sender.setDaemon(true);
        this.sender.start();
    }

    @Override
    public boolean dispatch(List<FlowRuntime> dueFlows, long groupTick) {
        if (closed || dueFlows.isEmpty()) {
            return false;
        }
        if (!slots.tryAcquire(dueFlows.size())) {
            for (FlowRuntime flow : dueFlows) {
                handler.onTickSkipped(group, flow);
            }
            return false;
        }
        if (order == SequentialOrder.GENERATED) {
            return dispatchAsGenerated(dueFlows, groupTick);
        }

        List<FlowRuntime> ordered = dueFlows;
        if (order == SequentialOrder.RANDOM) {
            ordered = new ArrayList<>(dueFlows);
            Collections.shuffle(ordered, random);
        }
        boolean generated = false;
        for (FlowRuntime flow : ordered) {
            generated |= generateAndQueue(flow, groupTick);
        }
        return generated;
    }

    /** Hands every due flow to its own thread; each message is queued when its generation ends. */
    private boolean dispatchAsGenerated(List<FlowRuntime> dueFlows, long groupTick) {
        boolean handedOff = false;
        for (FlowRuntime flow : dueFlows) {
            switch (workers.tryRun(flow, () -> generateAndQueue(flow, groupTick))) {
                case STARTED -> handedOff = true;
                case BUSY -> {
                    slots.release();
                    handler.onTickSkipped(group, flow);
                }
                case UNAVAILABLE -> slots.release();
            }
        }
        return handedOff;
    }

    /**
     * Generates the message of a flow and queues it, using a slot already taken for it.
     * The slot is given back when nothing is queued.
     */
    private boolean generateAndQueue(FlowRuntime flow, long groupTick) {
        String payload = closed ? null : handler.generate(group, flow);
        if (payload == null || closed) {
            slots.release();
            return false;
        }
        // The slot taken for this message guarantees a free place, so add() cannot fail
        queue.add(new PendingMessage(flow, payload, groupTick));
        return true;
    }

    private void sendLoop() {
        while (!closed) {
            try {
                PendingMessage message = queue.poll(POLL_TIMEOUT_MS, TimeUnit.MILLISECONDS);
                if (message != null) {
                    slots.release();
                    if (!closed) {
                        handler.publish(group, message.flow(), message.payload(), message.groupTick());
                    }
                }
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
        if (workers != null) {
            workers.shutdown();
        }
        // Dropped messages stay counted as generated but not sent
        queue.clear();
    }
}
