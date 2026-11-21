package com.gensynth.core.model;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Project-wide simulation settings, saved with the project file and the backend state.
 * Currently holds the tick clock configuration; future setting categories go here too.
 *
 * @param tick tick clock settings
 */
public record ProjectSettings(TickSettings tick) {

    private static final Logger logger = LoggerFactory.getLogger(ProjectSettings.class);

    // The tick settings are required
    public ProjectSettings {
        Objects.requireNonNull(tick, "tick cannot be null");
    }

    /**
     * Returns the default project settings.
     *
     * @return default settings
     */
    public static ProjectSettings defaults() {
        return new ProjectSettings(TickSettings.defaults());
    }

    /**
     * Parses project settings leniently, used when loading files and persisted state:
     * a missing or invalid section falls back to the defaults instead of failing the load.
     *
     * @param raw the raw {@code settings} value (may be null)
     * @return the parsed settings, or the defaults
     */
    @SuppressWarnings("unchecked")
    public static ProjectSettings fromPayload(Object raw) {
        if (!(raw instanceof Map<?, ?> map) || !(map.get("tick") instanceof Map<?, ?> tickMap)) {
            return defaults();
        }
        try {
            return new ProjectSettings(TickSettings.fromPayload((Map<String, Object>) tickMap));
        } catch (IllegalArgumentException e) {
            logger.warn("Invalid tick settings, using defaults: {}", e.getMessage());
            return defaults();
        }
    }

    /**
     * Serializes the settings for the bridge and project files.
     *
     * @return map with the {@code tick} section
     */
    public Map<String, Object> toPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("tick", tick.toPayload());
        return payload;
    }
}
