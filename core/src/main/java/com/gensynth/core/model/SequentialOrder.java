package com.gensynth.core.model;

import java.util.Locale;

/**
 * Order in which a sequential group queues the messages of its flows due on the same tick.
 * Parallel groups keep the value but ignore it.
 */
public enum SequentialOrder {
    /** The order of the group's flow list, which the user can change. */
    FLOW("flow"),
    /** A new random order on every tick. */
    RANDOM("random"),
    /** The flows generate at the same time and each message is queued as soon as it is ready. */
    GENERATED("generated");

    private final String wireValue;

    SequentialOrder(String wireValue) {
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
     * @return true if the value is "flow", "random" or "generated"
     */
    public static boolean isValid(String value) {
        if (value == null) {
            return false;
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        for (SequentialOrder order : values()) {
            if (order.wireValue.equals(normalized)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Lenient parsing used for files and persisted state: missing or unknown values (projects
     * saved before this setting existed) map to {@link #FLOW}, which is how sequential groups
     * always behaved.
     *
     * @param value raw value, may be null
     * @return the parsed order
     */
    public static SequentialOrder fromValue(String value) {
        if (value != null) {
            String normalized = value.trim().toLowerCase(Locale.ROOT);
            for (SequentialOrder order : values()) {
                if (order.wireValue.equals(normalized)) {
                    return order;
                }
            }
        }
        return FLOW;
    }
}
