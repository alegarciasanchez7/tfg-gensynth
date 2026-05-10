package com.gensynth.core.connectors.plugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Immutable result of a plugin JAR validation.
 *
 * Contains validation status, extracted descriptor metadata, and detailed
 * logs of the validation process.
 */
public final class PluginValidationResult {

    public enum ValidationLevel {
        INFO, WARN, ERROR
    }

    /**
     * A single entry in the validation log.
     */
    public static class ValidationEntry {
        private final ValidationLevel level;
        private final String message;
        private final String context;

        public ValidationEntry(ValidationLevel level, String message, String context) {
            this.level = level;
            this.message = message;
            this.context = context;
        }

        public ValidationLevel getLevel() {
            return level;
        }

        public String getMessage() {
            return message;
        }

        public String getContext() {
            return context;
        }

        @Override
        public String toString() {
            return "[" + level + "] " + message + (context != null ? " (" + context + ")" : "");
        }
    }

    private final boolean valid;
    private final String pluginId;
    private final String displayName;
    private final String pluginVersion;
    private final String coreApiVersion;
    private final List<ValidationEntry> logs;

    private PluginValidationResult(Builder builder) {
        this.valid = builder.valid;
        this.pluginId = builder.pluginId;
        this.displayName = builder.displayName;
        this.pluginVersion = builder.pluginVersion;
        this.coreApiVersion = builder.coreApiVersion;
        this.logs = Collections.unmodifiableList(new ArrayList<>(builder.logs));
    }

    /** @return true if the plugin passed all validation checks (no ERROR logs). */
    public boolean isValid() {
        return valid && logs.stream().noneMatch(e -> e.getLevel() == ValidationLevel.ERROR);
    }

    public String getPluginId() {
        return pluginId;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getPluginVersion() {
        return pluginVersion;
    }

    public String getCoreApiVersion() {
        return coreApiVersion;
    }

    /** @return unmodifiable list of validation logs. */
    public List<ValidationEntry> getLogs() {
        return logs;
    }

    /** @return summary of all error messages. */
    public List<String> getErrors() {
        return logs.stream()
                .filter(e -> e.getLevel() == ValidationLevel.ERROR)
                .map(ValidationEntry::getMessage)
                .toList();
    }

    /**
     * Creates a failed validation result with a single error message.
     */
    public static PluginValidationResult failure(String error) {
        return new Builder()
                .valid(false)
                .log(ValidationLevel.ERROR, error)
                .build();
    }

    public static class Builder {
        private boolean valid = true;
        private String pluginId;
        private String displayName;
        private String pluginVersion;
        private String coreApiVersion;
        private final List<ValidationEntry> logs = new ArrayList<>();

        public Builder valid(boolean valid) {
            this.valid = valid;
            return this;
        }

        public Builder pluginId(String pluginId) {
            this.pluginId = pluginId;
            return this;
        }

        public Builder displayName(String displayName) {
            this.displayName = displayName;
            return this;
        }

        public Builder pluginVersion(String pluginVersion) {
            this.pluginVersion = pluginVersion;
            return this;
        }

        public Builder coreApiVersion(String coreApiVersion) {
            this.coreApiVersion = coreApiVersion;
            return this;
        }

        public Builder log(ValidationLevel level, String message) {
            return log(level, message, null);
        }

        public Builder log(ValidationLevel level, String message, String context) {
            this.logs.add(new ValidationEntry(level, message, context));
            if (level == ValidationLevel.ERROR) {
                this.valid = false;
            }
            return this;
        }

        public PluginValidationResult build() {
            return new PluginValidationResult(this);
        }
    }
}
