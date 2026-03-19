package com.gensynth.core.lifecycle;

import com.gensynth.core.config.AppConfig;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Implementation of ILifecycleManager with optimizations for performance and safety.
 * This class manages the lifecycle states of the Gen-Synth application, ensuring proper state transitions,
 * thread management, and listener notifications.
 *
 * Thread Pool Configuration:
 * - Uses AppConfig to determine pool size (conservative defaults for secondary app)
 * - Avoids dynamic sizing based on availableProcessors() to prevent contention with main application
 * - Allows explicit configuration via application.yml/json
 */
public class LifecycleManagerImpl implements ILifecycleManager {

    // Constants for thread management
    private static final long SHUTDOWN_TIMEOUT_SECONDS = 30;
    private static final String THREAD_POOL_NAME_FORMAT = "gen-synth-lifecycle-%d";

    // Configuration
    private final AppConfig config;

    // State management with AtomicReference (lock-free reads)
    private final AtomicReference<LifecycleState> state = new AtomicReference<>(LifecycleState.CREATED);

    // RWLock for state transitions (prevent race conditions during state changes)
    private final Object stateLock = new Object();

    // Thread pool for application tasks
    private ExecutorService executor;

    // Listeners list (CopyOnWriteArrayList = safe iteration + modifications)
    private final List<ILifecycleListener> listeners = new CopyOnWriteArrayList<>();

    // Track initialization to prevent double-initialization
    private volatile boolean initialized = false;

    /**
     * Constructor with AppConfig.
     * Allows explicit configuration of thread pool size.
     */
    public LifecycleManagerImpl(AppConfig config) {
        if (config == null) {
            throw new IllegalArgumentException("AppConfig cannot be null");
        }
        this.config = config;
    }

    /**
     * Constructor with default AppConfig.
     * Uses conservative defaults (2 core, 4 max) to avoid contention with main application.
     */
    public LifecycleManagerImpl() {
        this(new AppConfig());
    }

    @Override
    public LifecycleState getState() {
        return state.get();
    }

    @Override
    public boolean isInState(LifecycleState state) {
        return this.state.get() == state;
    }

    @Override
    public void initialize() throws Exception {
        // Lock to prevent concurrent initialization
        synchronized (stateLock) {
            LifecycleState currentState = state.get();

            // Validate state transition
            if (!currentState.canTransitionTo(LifecycleState.INITIALIZED)) {
                throw new IllegalStateException(
                    String.format("Cannot transition from %s to INITIALIZED",
                        currentState.getDisplayName())
                );
            }

            // Prevent double initialization
            if (initialized) {
                return;
            }

            try {
                // Step 1: Create thread pool (uses config instead of availableProcessors)
                this.executor = createThreadPool();

                // Step 2: Call onInitialize() for all listeners
                callListenersSequentially(listeners, ILifecycleListener::onInitialize, "initialize");

                // Step 3: Update state
                state.set(LifecycleState.INITIALIZED);
                initialized = true;

            } catch (Exception e) {
                // Cleanup thread pool on failure
                if (executor != null && !executor.isShutdown()) {
                    executor.shutdown();
                }
                throw e;
            }
        }
    }

    @Override
    public void start() throws Exception {
        synchronized (stateLock) {
            LifecycleState currentState = state.get();

            // Validate state transition
            if (!currentState.canTransitionTo(LifecycleState.RUNNING)) {
                throw new IllegalStateException(
                    String.format("Cannot transition from %s to RUNNING",
                        currentState.getDisplayName())
                );
            }

            try {
                // Call onStart() for all listeners
                callListenersSequentially(listeners, ILifecycleListener::onStart, "start");

                // Update state
                state.set(LifecycleState.RUNNING);

            } catch (Exception e) {
                // If start fails, go back to INITIALIZED
                state.set(LifecycleState.INITIALIZED);
                throw e;
            }
        }
    }

    @Override
    public void stop() throws Exception {
        synchronized (stateLock) {
            LifecycleState currentState = state.get();

            // Terminal state: idempotent behavior
            if (currentState == LifecycleState.STOPPED) {
                return;
            }

            // Can stop from RUNNING or INITIALIZED
            if (!currentState.canTransitionTo(LifecycleState.STOPPED)) {
                throw new IllegalStateException(
                    String.format("Cannot stop from state: %s",
                        currentState.getDisplayName())
                );
            }

            try {
                // Step 1: Call onStop() for all listeners (collect errors)
                callListenersSequentially(listeners, ILifecycleListener::onStop, "stop");

                // Step 2: Shutdown executor with timeout
                if (executor != null && !executor.isShutdown()) {
                    executor.shutdown();
                    if (!executor.awaitTermination(SHUTDOWN_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                        // Force shutdown if timeout
                        executor.shutdownNow();
                    }
                }

                // Step 3: Update state
                state.set(LifecycleState.STOPPED);

            } catch (Exception e) {
                // Even on error, try to update state
                state.set(LifecycleState.STOPPED);
                throw e;
            }
        }
    }

    @Override
    public void addLifecycleListener(ILifecycleListener listener) {
        if (listener == null) {
            throw new IllegalArgumentException("Listener cannot be null");
        }
        listeners.add(listener);
    }

    @Override
    public void removeLifecycleListener(ILifecycleListener listener) {
        listeners.remove(listener);
    }

    @Override
    public ExecutorService getExecutor() {
        if (executor == null || executor.isShutdown()) {
            throw new IllegalStateException("Executor not available. Call initialize() first.");
        }
        return executor;
    }

    @Override
    public boolean awaitTermination(long timeoutSeconds) throws InterruptedException {
        if (executor == null) {
            return true;  // No executor, nothing to wait for
        }
        return executor.awaitTermination(timeoutSeconds, TimeUnit.SECONDS);
    }

    // ============ Private Helper Methods ============

    /**
     * Create thread pool with optimized settings.
     *
     * Key Design Decision:
     * - Uses AppConfig thread pool sizes instead of availableProcessors()
     * - Prevents contention with main application (Gen-Synth is secondary)
     * - Conservative defaults: 2 core, 4 max threads
     * - Configurable via application.yml for deployment flexibility
     *
     * Configuration:
     * - Core threads = config.getThreadPoolCoreSize() (default: 2)
     * - Max threads = config.getThreadPoolMaxSize() (default: 4)
     * - Queue: LinkedBlockingQueue (unbounded, good for variable load)
     * - Thread factory: Named threads for easy debugging
     * - Rejection policy: CallerRunsPolicy (avoid losing tasks)
     * - Keep-alive: Threads removed after config.getThreadPoolKeepAliveSeconds() (default: 60s)
     */
    private ExecutorService createThreadPool() {
        ThreadFactory threadFactory = new ThreadFactory() {
            private final AtomicInteger count = new AtomicInteger(0);

            @Override
            public Thread newThread(Runnable r) {
                Thread t = new Thread(r);
                t.setName(String.format(THREAD_POOL_NAME_FORMAT, count.incrementAndGet()));
                t.setDaemon(false);  // Non-daemon: app waits for threads
                return t;
            }
        };

        return new ThreadPoolExecutor(
            config.getThreadPoolCoreSize(),                 // corePoolSize (from config)
            config.getThreadPoolMaxSize(),                  // maxPoolSize (from config)
            config.getThreadPoolKeepAliveSeconds(),         // keepAliveTime (from config)
            TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(),                    // unbounded queue
            threadFactory,
            new ThreadPoolExecutor.CallerRunsPolicy()       // rejection policy
        );
    }

    /**
     * Call listeners sequentially with error aggregation.
     *
     * Optimization:
     * - Collect all errors before throwing (don't stop on first error)
     * - This ensures ALL listeners get a chance to cleanup onStop()
     * - Aggregate exceptions: throw one exception with all causes
     *
     * @param listeners List of listeners to call
     * @param action Action to call on each listener
     * @param actionName Name of action (for error messages)
     * @throws Exception aggregated from all listener failures
     */
    private void callListenersSequentially(
            List<ILifecycleListener> listeners,
            ListenerAction action,
            String actionName) throws Exception {

        List<Exception> failures = new ArrayList<>();

        for (ILifecycleListener listener : listeners) {
            try {
                action.execute(listener);
            } catch (Exception e) {
                failures.add(e);
                System.err.printf("Error during %s on listener %s: %s%n",
                    actionName, listener.getClass().getSimpleName(), e.getMessage());
            }
        }

        // If any listener failed, throw aggregated exception
        if (!failures.isEmpty()) {
            Exception first = failures.get(0);
            for (int i = 1; i < failures.size(); i++) {
                first.addSuppressed(failures.get(i));
            }
            throw first;
        }
    }

    /**
     * Functional interface for listener actions.
     * Allows passing method references to callListenersSequentially
     */
    @FunctionalInterface
    private interface ListenerAction {
        void execute(ILifecycleListener listener) throws Exception;
    }

}
