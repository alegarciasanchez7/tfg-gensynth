package com.gensynth.core.lifecycle;

/**
 * Interface for managing application lifecycle.
 *
 * Responsibilities:
 * - State management (transitions between 4 states)
 * - Thread pool management (ExecutorService)
 * - Listener management (Observer pattern)
 * - Graceful shutdown
 * - Lifecycle locking (prevent state changes during operations)
 */
public interface ILifecycleManager {

    /**
     * Get current lifecycle state.
     *
     * @return Current state
     */
    LifecycleState getState();

    /**
     * Check if system is in a specific state.
     *
     * @param state State to check
     * @return true if current state matches
     */
    boolean isInState(LifecycleState state);

    /**
     * Initialize the application.
     * Transition: CREATED → INITIALIZED
     *
     * - Creates thread pools
     * - Initializes internal structures
     * - Calls onInitialize() for all listeners
     * - Acquires state lock
     *
     * @throws IllegalStateException if not in CREATED state
     * @throws Exception if any listener initialization fails
     */
    void initialize() throws Exception;

    /**
     * Start the application.
     * Transition: INITIALIZED → RUNNING
     *
     * - Activates all threads
     * - Enables connectors
     * - Calls onStart() for all listeners
     *
     * @throws IllegalStateException if not in INITIALIZED state
     * @throws Exception if any listener startup fails
     */
    void start() throws Exception;

    /**
     * Stop the application gracefully.
     * Transition: RUNNING/INITIALIZED → STOPPED
     *
     * - Calls onStop() for all listeners
     * - Shuts down thread pools
     * - Waits for threads to complete (with timeout)
     * - Closes all resources
     *
     * Status: Safe to call multiple times (idempotent)
     *
     * @throws Exception if shutdown fails (non-blocking)
     */
    void stop() throws Exception;

    /**
     * Register a lifecycle listener.
     * Listener will be notified of state transitions.
     *
     * @param listener Listener to register
     * @throws IllegalArgumentException if listener is null
     */
    void addLifecycleListener(ILifecycleListener listener);

    /**
     * Unregister a lifecycle listener.
     *
     * @param listener Listener to remove
     */
    void removeLifecycleListener(ILifecycleListener listener);

    /**
     * Get the managed thread pool (ExecutorService).
     * Use for submitting tasks that should run within the lifecycle.
     *
     * @return ExecutorService for task submission
     * @throws IllegalStateException if not initialized
     */
    java.util.concurrent.ExecutorService getExecutor();

    /**
     * Utility method to wait for graceful shutdown with timeout.
     * Waits for all submitted tasks to complete.
     *
     * @param timeoutSeconds Maximum seconds to wait
     * @return true if all tasks completed, false if timeout
     * @throws InterruptedException if waiting is interrupted
     */
    boolean awaitTermination(long timeoutSeconds) throws InterruptedException;

}
