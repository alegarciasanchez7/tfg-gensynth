package com.gensynth.core.ws.dispatch;

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
 * One worker thread per flow, each running at most one task at a time. Shared by the
 * dispatchers that generate on the flows' own threads.
 */
final class FlowWorkers {

    private final Map<String, Worker> workersByFlowId = new LinkedHashMap<>();

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
     * @param group the group the flows belong to (used to name the threads)
     * @param flows flows that get a worker
     */
    FlowWorkers(GroupRuntime group, List<FlowRuntime> flows) {
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

    /** Outcome of {@link #tryRun}. */
    enum RunResult {
        /** The task was handed to the flow's worker. */
        STARTED,
        /** The flow's worker is still running a previous task. */
        BUSY,
        /** The flow has no worker, or the workers were shut down. */
        UNAVAILABLE
    }

    /**
     * Runs the task on the flow's worker if it is idle.
     *
     * @param flow the flow
     * @param task work to run on the flow's thread
     * @return whether the task was started, or why not
     */
    RunResult tryRun(FlowRuntime flow, Runnable task) {
        Worker worker = workersByFlowId.get(flow.id);
        if (worker == null) {
            return RunResult.UNAVAILABLE;
        }
        if (!worker.busy.compareAndSet(false, true)) {
            return RunResult.BUSY;
        }
        try {
            worker.executor.execute(() -> {
                try {
                    task.run();
                } finally {
                    worker.busy.set(false);
                }
            });
            return RunResult.STARTED;
        } catch (RejectedExecutionException e) {
            // Shut down concurrently
            worker.busy.set(false);
            return RunResult.UNAVAILABLE;
        }
    }

    /**
     * Stops accepting tasks. Running tasks finish; they are not interrupted, because
     * interrupting a publish can break the connector (e.g. a RabbitMQ channel).
     */
    void shutdown() {
        for (Worker worker : workersByFlowId.values()) {
            worker.executor.shutdown();
        }
    }
}
