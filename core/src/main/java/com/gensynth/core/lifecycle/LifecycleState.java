package com.gensynth.core.lifecycle;

/**
 * Represents the lifecycle states of the Gen-Synth application.
 *
 * State Transitions:
 * CREATED → INITIALIZED → RUNNING → STOPPED
 *    ↑                        ↑         ↓
 *    └────────────────────────┴─────────┘
 *         (error cases)
 */
public enum LifecycleState {
    /**
     * Initial state: Object created but not yet initialized.
     * No resources allocated.
     */
    CREATED("Created"),

    /**
     * Initialization complete: Resources allocated, ready to start.
     * Configuration loaded, thread pools created, but not actively processing.
     */
    INITIALIZED("Initialized"),

    /**
     * Running state: Active operation, processing data.
     * All threads are running, connectors are active.
     */
    RUNNING("Running"),

    /**
     * Stopped state: Graceful shutdown complete.
     * All resources cleaned up, threads terminated.
     */
    STOPPED("Stopped");

    private final String displayName;

    LifecycleState(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    /**
     * Check if transition from current state to target state is valid.
     *
     * Valid transitions:
     * - CREATED → INITIALIZED
     * - INITIALIZED → RUNNING
     * - RUNNING → STOPPED
     * - INITIALIZED → STOPPED (jump directly)
     *
     * @param target Target state
     * @return true if transition is valid
     */
    public boolean canTransitionTo(LifecycleState target) {
        if (target == this) {
            return false;  // No self-transitions
        }

        switch (this) {
            case CREATED:
                return target == INITIALIZED;
            case INITIALIZED:
                return target == RUNNING || target == STOPPED;
            case RUNNING:
                return target == STOPPED;
            case STOPPED:
                return false;  // Terminal state, no transitions out
            default:
                return false;
        }
    }
}
