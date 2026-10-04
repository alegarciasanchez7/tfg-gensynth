package com.gensynth.core.model;

import java.util.Locale;

/**
 * How the flows of a group send their messages.
 */
public enum OutputMode {
    /** Every flow runs on its own thread and sends as soon as it generates a message. */
    PARALLEL("parallel"),
    /** Messages of all flows go into one FIFO queue, published in generation order by a single sender. */
    SEQUENTIAL("sequential");

    private final String wireValue;

    OutputMode(String wireValue) {
        this.wireValue = wireValue;
    }

    /**
     * @return the value used in the bridge and project files
     */
    public String wireValue() {
        return wireValue;
    }

    /**
     * Strict check used by commands: only the documented wire values are accepted.
     *
     * @param value raw value (case-insensitive)
     * @return true if the value is "parallel" or "sequential"
     */
    public static boolean isValid(String value) {
        if (value == null) {
            return false;
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        return PARALLEL.wireValue.equals(normalized) || SEQUENTIAL.wireValue.equals(normalized);
    }

    /**
     * Lenient parsing used for files and persisted state. Only "sequential" maps to
     * {@link #SEQUENTIAL}; legacy or unknown values ("serial", "TEXT", "round-robin", null)
     * map to {@link #PARALLEL}, which is how every group behaved before output modes existed.
     *
     * @param value raw value, may be null
     * @return the parsed output mode
     */
    public static OutputMode fromValue(String value) {
        if (value != null && SEQUENTIAL.wireValue.equals(value.trim().toLowerCase(Locale.ROOT))) {
            return SEQUENTIAL;
        }
        return PARALLEL;
    }
}
