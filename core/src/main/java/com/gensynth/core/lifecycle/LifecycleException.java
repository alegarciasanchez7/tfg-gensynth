package com.gensynth.core.lifecycle;

/**
 * Raised when a lifecycle transition (initialize, start or stop) fails, either in the manager
 * itself or in one of its listeners.
 */
public class LifecycleException extends Exception {

    /**
     * Creates the exception.
     *
     * @param message what failed
     */
    public LifecycleException(String message) {
        super(message);
    }

    /**
     * Creates the exception with the error that caused it.
     *
     * @param message what failed
     * @param cause   the original error
     */
    public LifecycleException(String message, Throwable cause) {
        super(message, cause);
    }
}
