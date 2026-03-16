package com.gensynth.core.config;

/**
 * Exception thrown when a configuration key is not found.
 */
public class ConfigKeyException extends Exception {
    public ConfigKeyException(String message) {
        super(message);
    }

    public ConfigKeyException(String message, Throwable cause) {
        super(message, cause);
    }
}
