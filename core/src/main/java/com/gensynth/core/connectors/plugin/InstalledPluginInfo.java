package com.gensynth.core.connectors.plugin;

import java.time.Instant;
import java.util.Objects;

/**
 * Metadata about an installed external plugin.
 *
 * Instances are created by scanning the plugins directory and loading
 * descriptors from discovered JARs.
 *
 * @param pluginId      internal plugin identifier
 * @param displayName   human-readable name
 * @param pluginVersion semantic version string
 * @param fileName      JAR file name inside the plugins directory
 * @param installedAt   timestamp when the file was last modified
 * @param external      true if this plugin was user-installed (from plugins/ dir)
 */
public record InstalledPluginInfo(String pluginId, String displayName, String pluginVersion,
                                  String fileName, Instant installedAt, boolean external) {

    // Every value but external is required
    public InstalledPluginInfo {
        Objects.requireNonNull(pluginId, "pluginId");
        Objects.requireNonNull(displayName, "displayName");
        Objects.requireNonNull(pluginVersion, "pluginVersion");
        Objects.requireNonNull(fileName, "fileName");
        Objects.requireNonNull(installedAt, "installedAt");
    }
}
