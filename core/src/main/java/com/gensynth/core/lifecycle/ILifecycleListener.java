package com.gensynth.core.lifecycle;

/**
 * Interface for listening to lifecycle state changes.
 * Implements the Observer pattern for loose coupling.
 *
 * Components can register listeners to be notified when:
 * - Application is initialized
 * - Application starts
 * - Application stops
 *
 * Usage:
 * <pre>
 *   manager.addLifecycleListener(new ILifecycleListener() {
 *       public void onInitialize() {
 *           // Load component config
 *       }
 *       public void onStart() {
 *           // Start component threads
 *       }
 *       public void onStop() {
 *           // Cleanup component resources
 *       }
 *   });
 * </pre>
 */
public interface ILifecycleListener {

    /**
     * Called when application transitions from CREATED → INITIALIZED.
     * At this point:
     * - Configuration is loaded
     * - Thread pools are created
     * - Listeners should load their own configuration
     *
     * @throws Exception if initialization fails
     */
    void onInitialize() throws Exception;

    /**
     * Called when application transitions from INITIALIZED → RUNNING.
     * At this point:
     * - Framework is ready
     * - Listeners should start their services/threads
     *
     * @throws Exception if startup fails
     */
    void onStart() throws Exception;

    /**
     * Called when application transitions to STOPPED (from any state).
     * At this point:
     * - Framework is shutting down
     * - Listeners should cleanup their resources
     * - Must be idempotent (safe to call multiple times)
     *
     * @throws Exception if cleanup fails (non-blocking, logged)
     */
    void onStop() throws Exception;

}
