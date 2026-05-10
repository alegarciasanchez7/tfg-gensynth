package com.gensynth.core.flow;

import com.gensynth.core.api.IFlowEngine;
import com.gensynth.core.config.AppConfig;
import com.gensynth.core.lifecycle.ILifecycleListener;

import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicLong;
import java.util.*;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Implementation of IFlowEngine using Virtual Threads.
 *
 * Key Design:
 * - Uses Executors.newVirtualThreadPerTaskExecutor() for data generation
 * - Manages Groups which contain multiple Flows
 * - Each Flow runs on its own virtual thread
 * - Virtual threads are ultra-lightweight (~100 bytes each)
 * - Scales to millions of concurrent flows without OS thread overhead
 *
 * Architecture:
 * Group (contains multiple Flows)
 *   └── Flow (contains multiple Variables)
 *        ├── Temperature Variable
 *        ├── Pressure Variable
 *        └── Humidity Variable
 */
public class FlowEngineImpl implements IFlowEngine, ILifecycleListener {

    private static final Logger logger = Logger.getLogger(FlowEngineImpl.class.getName());

    private final AppConfig config;

    // Virtual thread executor for data generation
    private ExecutorService dataGenerationExecutor;

    // Pipeline for event buffering
    private IPipeline pipeline;

    // Track active groups (groupId -> GroupContext)
    private final Map<String, GroupContext> activeGroups = new ConcurrentHashMap<>();

    // Registered groups (groupId -> Group)
    private final Map<String, Group> registeredGroups = new ConcurrentHashMap<>();

    // Current state
    private final AtomicReference<EngineState> state = new AtomicReference<>(EngineState.CREATED);

    // Counter for generated events (metrics)
    private final AtomicLong generatedEventCount = new AtomicLong(0);

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
            logger.info("FlowEngine initialized with virtual threads");
        } else {
            // Fallback to ThreadPoolExecutor
            int coreSize = Math.max(2, Runtime.getRuntime().availableProcessors());
            int maxSize = coreSize * 2;
            this.dataGenerationExecutor = new ThreadPoolExecutor(
                coreSize, maxSize, 60, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(),
                createThreadFactory(),
                new ThreadPoolExecutor.CallerRunsPolicy()
            );
            logger.info("FlowEngine initialized with traditional thread pool");
        }
        // Initialize pipeline for event buffering
        this.pipeline = new MockPipeline();
        logger.info("FlowEngine initialized with MockPipeline");
        state.set(EngineState.INITIALIZED);
    }

    @Override
    public void onStart() throws Exception {
        state.set(EngineState.RUNNING);
        logger.info("FlowEngine started");
    }

    @Override
    public void onStop() throws Exception {
        // Stop all active groups
        List<String> groupIds = new ArrayList<>(activeGroups.keySet());
        for (String groupId : groupIds) {
            try {
                stopGroup(groupId);
            } catch (Exception e) {
                logger.log(Level.WARNING, "Error stopping group: " + groupId, e);
            }
        }

        // Shutdown executor
        if (dataGenerationExecutor != null && !dataGenerationExecutor.isShutdown()) {
            dataGenerationExecutor.shutdown();
            if (!dataGenerationExecutor.awaitTermination(30, TimeUnit.SECONDS)) {
                dataGenerationExecutor.shutdownNow();
            }
        }
        state.set(EngineState.STOPPED);
        logger.info("FlowEngine stopped");
    }

    // ============ Group Management ============

    /**
     * Register a group with the engine.
     * The group won't start until executeFlow() is called on its ID.
     */
    public void addGroup(Group group) {
        if (group == null) {
            throw new IllegalArgumentException("group cannot be null");
        }
        String groupId = group.getGroupId();
        registeredGroups.put(groupId, group);
        logger.info(String.format("Group %s added with %d flows",
            groupId, group.getFlowCount()));
    }

    /**
     * Get a registered group by ID.
     */
    public Optional<Group> getGroup(String groupId) {
        return Optional.ofNullable(registeredGroups.get(groupId));
    }

    /**
     * Remove a group from the engine.
     */
    public void removeGroup(String groupId) {
        registeredGroups.remove(groupId);
        logger.info(String.format("Group %s removed", groupId));
    }

    /**
     * Get number of registered groups.
     */
    public int getGroupCount() {
        return registeredGroups.size();
    }

    /**
     * Get number of active (running) groups.
     */
    public int getActiveGroupCount() {
        return activeGroups.size();
    }

    // ============ Execution Control (IFlowEngine Interface) ============

    @Override
    public void executeFlow(String groupId) {
        // IFlowEngine.executeFlow() now executes a Group
        executeGroup(groupId);
    }

    /**
     * Execute (start) a group - all its enabled flows will run.
     * Each flow in the group will run on its own virtual thread.
     */
    public void executeGroup(String groupId) {
        if (!canExecute()) {
            throw new IllegalStateException(
                String.format("FlowEngine is not running, current state: %s", state.get())
            );
        }

        if (activeGroups.containsKey(groupId)) {
            throw new IllegalStateException(String.format("Group %s is already running", groupId));
        }

        // Get registered group
        Group group = registeredGroups.get(groupId);
        if (group == null) {
            throw new IllegalStateException(
                String.format("Group %s not found. Add it first with addGroup()", groupId));
        }

        // Create context and mark as active
        GroupContext context = new GroupContext(group);
        activeGroups.put(groupId, context);
        long interval = config.getSimulationInterval();

        // Submit data generation task for each flow
        for (Flow flow : group.getFlows()) {
            dataGenerationExecutor.submit(() -> {
                try {
                    runFlowDataGeneration(flow, context, interval);
                } catch (Throwable e) {
                    logger.log(Level.SEVERE, "Error in flow thread for " + flow.getFlowId(), e);
                    group.recordError();
                }
            });
        }

        logger.info(String.format("Group %s started with %d flows",
            groupId, group.getFlowCount()));
    }

    /**
     * Data generation loop for a single flow within a group.
     */
    private void runFlowDataGeneration(Flow flow, GroupContext context, long interval) {
        while (context.isRunning()) {
            try {
                // Check pause state
                if (context.isPaused()) {
                    Thread.sleep(100);
                    continue;
                }

                // Check if group is enabled
                if (!context.group.isEnabled()) {
                    Thread.sleep(100);
                    continue;
                }

                // Check if flow is enabled
                if (!flow.isEnabled()) {
                    Thread.sleep(100);
                    continue;
                }

                // Generate events from all variables in the flow
                List<DataEvent> events = flow.generateEvents();

                // Submit events to pipeline and record metrics
                for (DataEvent event : events) {
                    if (pipeline != null && !pipeline.isFull()) {
                        pipeline.submit(event);
                    }
                }

                // Record metrics
                generatedEventCount.addAndGet(events.size());
                context.group.recordEventsSent(events.size());

                // Sleep for configured interval
                Thread.sleep(interval);

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                logger.log(Level.SEVERE, "Error in data generation for " + flow.getFlowId(), e);
                context.group.recordError();
                break;
            }
        }

        logger.fine("Flow " + flow.getFlowId() + " stopped");
    }

    @Override
    public void stopFlow(String groupId) {
        // IFlowEngine.stopFlow() now stops a Group
        stopGroup(groupId);
    }

    /**
     * Stop (pause all flows in) a group.
     */
    public void stopGroup(String groupId) {
        GroupContext context = activeGroups.get(groupId);
        if (context == null) {
            throw new IllegalStateException(String.format("Group %s is not running", groupId));
        }

        context.stop();
        activeGroups.remove(groupId);

        logger.info(String.format("Group %s stopped", groupId));
    }

    @Override
    public void pauseFlow(String groupId) {
        // IFlowEngine.pauseFlow() now pauses a Group
        pauseGroup(groupId);
    }

    /**
     * Pause a group (all its flows).
     */
    public void pauseGroup(String groupId) {
        GroupContext context = activeGroups.get(groupId);
        if (context == null) {
            throw new IllegalStateException(String.format("Group %s is not running", groupId));
        }

        context.pause();
        logger.info(String.format("Group %s paused", groupId));
    }

    /**
     * Resume a paused group.
     */
    public void resumeGroup(String groupId) {
        GroupContext context = activeGroups.get(groupId);
        if (context == null) {
            throw new IllegalStateException(String.format("Group %s is not running", groupId));
        }

        context.resume();
        logger.info(String.format("Group %s resumed", groupId));
    }

    // ============ Metrics ============

    /**
     * Get total events generated since engine start.
     */
    public long getGeneratedEventCount() {
        return generatedEventCount.get();
    }

    /**
     * Get number of active (running) flows (alias for getActiveGroupCount for compatibility).
     * @deprecated Use getActiveGroupCount() instead. Each "group" now represents a collection of flows.
     */
    @Deprecated
    public int getActiveFlowCount() {
        return (int) activeGroups.values().stream()
            .map(ctx -> ctx.group.getFlowCount())
            .reduce(0, Integer::sum);
    }

    // ============ Private Helpers ============

    /**
     * Check if engine can execute groups.
     */
    private boolean canExecute() {
        return state.get() == EngineState.RUNNING;
    }

    /**
     * Create thread factory for traditional thread pool fallback.
     */
    private ThreadFactory createThreadFactory() {
        return new ThreadFactory() {
            private final AtomicLong count = new AtomicLong(0);

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
     * Internal class to track group execution context.
     * Contains state and configuration for a running group.
     */
    private static class GroupContext {
        private final Group group;
        private volatile boolean running = true;
        private volatile boolean paused = false;

        GroupContext(Group group) {
            this.group = group;
        }

        boolean isRunning() {
            return running;
        }

        boolean isPaused() {
            return paused;
        }

        void pause() {
            paused = true;
        }

        void resume() {
            paused = false;
        }

        void stop() {
            running = false;
        }
    }

}
