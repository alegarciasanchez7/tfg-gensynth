package com.gensynth.core.connectors.plugin;

import java.time.Instant;
import java.util.Objects;

/**
 * Metadata about an installed external plugin.
 *
 * Instances are created by scanning the plugins directory and loading
 * descriptors from discovered JARs.
 */
public final class InstalledPluginInfo {

    private final String pluginId;
    private final String displayName;
    private final String pluginVersion;
    private final String fileName;
    private final Instant installedAt;
    private final boolean external;

    /**
     * Constructs plugin metadata.
     *
     * @param pluginId      internal plugin identifier
     * @param displayName   human-readable name
     * @param pluginVersion semantic version string
     * @param fileName      JAR file name inside the plugins directory
     * @param installedAt   timestamp when the file was last modified
     * @param external      true if this plugin was user-installed (from plugins/ dir)
     */
    public InstalledPluginInfo(String pluginId, String displayName, String pluginVersion,
                               String fileName, Instant installedAt, boolean external) {
        this.pluginId = Objects.requireNonNull(pluginId, "pluginId");
        this.displayName = Objects.requireNonNull(displayName, "displayName");
        this.pluginVersion = Objects.requireNonNull(pluginVersion, "pluginVersion");
        this.fileName = Objects.requireNonNull(fileName, "fileName");
        this.installedAt = Objects.requireNonNull(installedAt, "installedAt");
        this.external = external;
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

    public String getFileName() {
        return fileName;
    }

    public Instant getInstalledAt() {
        return installedAt;
    }

    /** @return true if this plugin was installed by the user from the UI. */
    public boolean isExternal() {
        return external;
    }
}
