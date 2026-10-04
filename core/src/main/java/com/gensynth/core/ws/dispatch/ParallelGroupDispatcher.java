package com.gensynth.core.ws.dispatch;

import com.gensynth.core.api.IFlowMessageHandler;
import com.gensynth.core.api.IGroupDispatcher;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Parallel output mode: every flow of the group is an independent process with its own
 * thread. On a due tick the flow generates and sends its message on that thread, without
 * waiting for the other flows.
 *
 * Backpressure: a flow has at most one message in progress. If it is still busy when its
 * next tick arrives, that tick is skipped for the flow (nothing is generated), so a slow
 * connector can never build an unbounded backlog.
 */
public class ParallelGroupDispatcher implements IGroupDispatcher {

    private final GroupRuntime group;
    private final IFlowMessageHandler handler;
    private final Map<String, Worker> workersByFlowId = new LinkedHashMap<>();
    private volatile boolean closed;

    private static final class Worker {
        private final ExecutorService executor;
        private final AtomicBoolean busy = new AtomicBoolean();

        private Worker(ExecutorService executor) {
            this.executor = executor;
        }
    }

    /**
     * Creates one worker thread per flow.
     *
     * @param group   the group being dispatched
     * @param flows   flows that can send (those with a started connector)
     * @param handler generates and publishes the messages
     */
    public ParallelGroupDispatcher(GroupRuntime group, List<FlowRuntime> flows, IFlowMessageHandler handler) {
        this.group = group;
        this.handler = handler;
        for (FlowRuntime flow : flows) {
            String threadName = "gensynth-" + group.name + "-" + flow.name;
            ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
                Thread thread = new Thread(runnable, threadName);
                thread.setDaemon(true);
                return thread;
            });
            workersByFlowId.put(flow.id, new Worker(executor));
        }
    }

    @Override
    public boolean dispatch(List<FlowRuntime> dueFlows) {
        if (closed) {
            return false;
        }
        boolean handedOff = false;
        for (FlowRuntime flow : dueFlows) {
            Worker worker = workersByFlowId.get(flow.id);
            if (worker == null) {
                continue;
            }
            if (!worker.busy.compareAndSet(false, true)) {
                handler.onTickSkipped(group, flow);
                continue;
            }
            try {
                worker.executor.execute(() -> sendOne(worker, flow));
                handedOff = true;
            } catch (RejectedExecutionException e) {
                // Shut down concurrently
                worker.busy.set(false);
            }
        }
        return handedOff;
    }

    private void sendOne(Worker worker, FlowRuntime flow) {
        try {
            if (closed) {
                return;
            }
            String payload = handler.generate(group, flow);
            if (payload != null && !closed) {
                handler.publish(group, flow, payload);
            }
        } finally {
            worker.busy.set(false);
        }
    }

    @Override
    public void shutdown() {
        closed = true;
        for (Worker worker : workersByFlowId.values()) {
            // No interrupt: interrupting a publish can break the connector (e.g. a RabbitMQ channel)
            worker.executor.shutdown();
        }
    }
}
