package com.gensynth.core.connectors.plugin;

/**
 * Immutable result of a plugin installation or uninstallation operation.
 */
public final class PluginInstallResult {

    private final boolean success;
    private final String message;
    private final String pluginId;
    private final boolean restartRequired;

    private PluginInstallResult(boolean success, String message, String pluginId, boolean restartRequired) {
        this.success = success;
        this.message = message;
        this.pluginId = pluginId;
        this.restartRequired = restartRequired;
    }

    /**
     * Creates a successful install/uninstall result.
     *
     * @param message   human-readable success message
     * @param pluginId  identifier of the affected plugin
     * @return successful result with restartRequired=true
     */
    public static PluginInstallResult success(String message, String pluginId) {
        return new PluginInstallResult(true, message, pluginId, true);
    }

    /**
     * Creates a failed install/uninstall result.
     *
     * @param message human-readable error message
     * @return failed result with restartRequired=false
     */
    public static PluginInstallResult failure(String message) {
        return new PluginInstallResult(false, message, null, false);
    }

    /** @return true if the operation succeeded. */
    public boolean isSuccess() {
        return success;
    }

    /** @return human-readable result message. */
    public String getMessage() {
        return message;
    }

    /** @return plugin identifier, or null on failure. */
    public String getPluginId() {
        return pluginId;
    }

    /** @return true if a restart is required to apply the change. */
    public boolean isRestartRequired() {
        return restartRequired;
    }
}
