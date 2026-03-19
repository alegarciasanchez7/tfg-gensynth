package com.gensynth.core.flow;

import com.gensynth.core.api.IFlowEngine;
import com.gensynth.core.config.AppConfig;
import com.gensynth.core.lifecycle.ILifecycleListener;

import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.*;

/**
 * Implementation of IFlowEngine using Virtual Threads.
 *
 * Key Design:
 * - Uses Executors.newVirtualThreadPerTaskExecutor() for data generation
 * - Each virtual device runs on its own virtual thread
 * - Virtual threads are ultra-lightweight (~100 bytes each)
 * - Scales to millions of concurrent devices without OS thread overhead
 * - Independent from LifecycleManager's thread pool (no contention)
 *
 * Architecture:
 * LifecycleManager (2 threads) -> coordinates
 * FlowEngine (virtual threads) -> generates data
 * Pipeline (ring buffer) -> buffers data
 * Connectors -> sends to brokers
 */
public class FlowEngineImpl implements IFlowEngine, ILifecycleListener {

    private final AppConfig config;

    // Virtual thread executor for data generation
    // Using virtual threads allows millions of concurrent device simulations
    private ExecutorService dataGenerationExecutor;

    // Track active flows (flowId -> status)
    private final Map<String, FlowStatus> activeFlows = new ConcurrentHashMap<>();

    // Current state
    private final AtomicReference<EngineState> state = new AtomicReference<>(EngineState.CREATED);

    // Counter for generated events (metrics)
    private final AtomicInteger generatedEventCount = new AtomicInteger(0);

    /**
     * Constructor with AppConfig.
     */
    public FlowEngineImpl(AppConfig config) {
        if (config == null) {
            throw new IllegalArgumentException("AppConfig cannot be null");
        }
        this.config = config;
    }

    /**
     * Constructor with default AppConfig.
     */
    public FlowEngineImpl() {
        this(new AppConfig());
    }

    @Override
    public void onInitialize() throws Exception {
        // Create virtual thread executor for data generation
        if (config.useVirtualThreads()) {
            this.dataGenerationExecutor = Executors.newVirtualThreadPerTaskExecutor();
        } else {
            // Fallback to ThreadPoolExecutor if virtual threads disabled
            int coreSize = Math.max(2, Runtime.getRuntime().availableProcessors());
            int maxSize = coreSize * 2;
            this.dataGenerationExecutor = new ThreadPoolExecutor(
                coreSize, maxSize, 60, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(),
                createThreadFactory(),
                new ThreadPoolExecutor.CallerRunsPolicy()
            );
        }
        state.set(EngineState.INITIALIZED);
    }

    @Override
    public void onStart() throws Exception {
        // FlowEngine is ready to execute flows
        state.set(EngineState.RUNNING);
    }

    @Override
    public void onStop() throws Exception {
        // Shutdown data generation executor
        if (dataGenerationExecutor != null && !dataGenerationExecutor.isShutdown()) {
            dataGenerationExecutor.shutdown();
            if (!dataGenerationExecutor.awaitTermination(30, TimeUnit.SECONDS)) {
                dataGenerationExecutor.shutdownNow();
            }
        }
        state.set(EngineState.STOPPED);
    }

    @Override
    public void executeFlow(String flowId) {
        if (!canExecuteFlow()) {
            throw new IllegalStateException(
                String.format("FlowEngine is not running, current state: %s", state.get())
            );
        }

        if (activeFlows.containsKey(flowId)) {
            throw new IllegalStateException(String.format("Flow %s is already running", flowId));
        }

        // Create flow status tracker
        FlowStatus status = new FlowStatus();
        activeFlows.put(flowId, status);

        // Submit data generation tasks to virtual thread executor
        int deviceCount = config.getDeviceCount();
        long interval = config.getSimulationInterval();

        for (int i = 0; i < deviceCount; i++) {
            dataGenerationExecutor.submit(() -> {
                while (status.isRunning()) {
                    try {
                        // Sleep for configured interval
                        Thread.sleep(interval);

                        // Generate data point (placeholder for now)
                        // When Pipeline is implemented, events will be submitted there
                        generatedEventCount.incrementAndGet();

                    } catch (InterruptedException e) {
                        // Flow was stopped, exit gracefully
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            });
        }
    }

    @Override
    public void stopFlow(String flowId) {
        FlowStatus status = activeFlows.get(flowId);
        if (status == null) {
            throw new IllegalStateException(String.format("Flow %s is not running", flowId));
        }

        // Signal flow to stop
        status.stop();

        // Remove from active flows
        activeFlows.remove(flowId);
    }

    @Override
    public void pauseFlow(String flowId) {
        FlowStatus status = activeFlows.get(flowId);
        if (status == null) {
            throw new IllegalStateException(String.format("Flow %s is not running", flowId));
        }

        // Pause data generation for this flow
        status.pause();
    }

    /**
     * Get the number of events generated so far.
     * Useful for metrics and monitoring.
     */
    public int getGeneratedEventCount() {
        return generatedEventCount.get();
    }

    /**
     * Get number of active flows.
     */
    public int getActiveFlowCount() {
        return activeFlows.size();
    }

    /**
     * Check if engine can execute flows.
     */
    private boolean canExecuteFlow() {
        return state.get() == EngineState.RUNNING;
    }

    /**
     * Create thread factory for traditional thread pool fallback.
     */
    private ThreadFactory createThreadFactory() {
        return new ThreadFactory() {
            private final AtomicInteger count = new AtomicInteger(0);

            @Override
            public Thread newThread(Runnable r) {
                Thread t = new Thread(r);
                t.setName(String.format("gen-synth-flow-%d", count.incrementAndGet()));
                t.setDaemon(false);
                return t;
            }
        };
    }

    /**
     * Internal enum for engine states.
     */
    private enum EngineState {
        CREATED, INITIALIZED, RUNNING, STOPPED
    }

    /**
     * Internal class to track flow execution status.
     */
    private static class FlowStatus {
        private volatile boolean running = true;
        private volatile boolean paused = false;

        FlowStatus() {
        }

        boolean isRunning() {
            return running && !paused;
        }

        void pause() {
            paused = true;
        }

        void stop() {
            running = false;
        }
    }

}
