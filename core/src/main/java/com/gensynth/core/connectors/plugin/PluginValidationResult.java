package com.gensynth.core.connectors.plugin;

import java.util.Collections;
import java.util.List;
import java.util.Objects;

/**
 * Immutable result of a plugin JAR validation.
 *
 * Contains validation status, extracted descriptor metadata, and any
 * error/warning messages suitable for presentation to the end-user.
 * Error messages are intentionally generic to avoid exposing core internals.
 */
public final class PluginValidationResult {

    private final boolean valid;
    private final String pluginId;
    private final String displayName;
    private final String pluginVersion;
    private final String coreApiVersion;
    private final List<String> errors;
    private final List<String> warnings;

    private PluginValidationResult(Builder builder) {
        this.valid = builder.valid;
        this.pluginId = builder.pluginId;
        this.displayName = builder.displayName;
        this.pluginVersion = builder.pluginVersion;
        this.coreApiVersion = builder.coreApiVersion;
        this.errors = Collections.unmodifiableList(Objects.requireNonNull(builder.errors));
        this.warnings = Collections.unmodifiableList(Objects.requireNonNull(builder.warnings));
    }

    /** @return true if the plugin passed all validation checks. */
    public boolean isValid() {
        return valid;
    }

    /** @return internal plugin identifier extracted from the descriptor, or null if validation failed early. */
    public String getPluginId() {
        return pluginId;
    }

    /** @return display name from the descriptor, or null if validation failed early. */
    public String getDisplayName() {
        return displayName;
    }

    /** @return version string from the descriptor, or null if validation failed early. */
    public String getPluginVersion() {
        return pluginVersion;
    }

    /** @return core API compatibility version from the descriptor, or null if validation failed early. */
    public String getCoreApiVersion() {
        return coreApiVersion;
    }

    /** @return unmodifiable list of user-facing error messages. */
    public List<String> getErrors() {
        return errors;
    }

    /** @return unmodifiable list of user-facing warning messages. */
    public List<String> getWarnings() {
        return warnings;
    }

    /**
     * Creates a failed validation result with the given errors.
     *
     * @param errors list of error messages
     * @return a failed PluginValidationResult
     */
    public static PluginValidationResult failure(List<String> errors) {
        return new Builder().valid(false).errors(errors).build();
    }

    /**
     * Creates a failed validation result with a single error message.
     *
     * @param error the error message
     * @return a failed PluginValidationResult
     */
    public static PluginValidationResult failure(String error) {
        return failure(List.of(error));
    }

    /**
     * Builder for constructing PluginValidationResult instances.
     */
    public static class Builder {
        private boolean valid = false;
        private String pluginId;
        private String displayName;
        private String pluginVersion;
        private String coreApiVersion;
        private List<String> errors = List.of();
        private List<String> warnings = List.of();

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

        public Builder errors(List<String> errors) {
            this.errors = errors;
            return this;
        }

        public Builder warnings(List<String> warnings) {
            this.warnings = warnings;
            return this;
        }

        public PluginValidationResult build() {
            return new PluginValidationResult(this);
        }
    }
}
