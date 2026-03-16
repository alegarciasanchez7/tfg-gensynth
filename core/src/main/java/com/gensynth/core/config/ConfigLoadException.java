package com.gensynth.core.config;

/**
 * Exception thrown when configuration loading fails.
 */
public class ConfigLoadException extends Exception {
    public ConfigLoadException(String message) {
        super(message);
    }

    public ConfigLoadException(String message, Throwable cause) {
        super(message, cause);
    }
}
