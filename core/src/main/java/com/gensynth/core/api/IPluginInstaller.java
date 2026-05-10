package com.gensynth.core.api;

import com.gensynth.core.connectors.plugin.InstalledPluginInfo;
import com.gensynth.core.connectors.plugin.PluginInstallResult;
import com.gensynth.core.connectors.plugin.PluginValidationResult;

import java.util.List;

/**
 * Service contract for validating, installing, and uninstalling
 * external connector plugins at runtime.
 *
 * Implementations must ensure that all JAR validation is performed
 * in an isolated sandbox before any file system changes are made.
 */
public interface IPluginInstaller {

    /**
     * Validates a plugin JAR without installing it.
     *
     * Performs security checks (blocked APIs, bytecode scanning),
     * SPI structure validation, API version compatibility, and
     * duplicate detection.
     *
     * @param jarBytes      raw bytes of the plugin JAR file
     * @param pluginName    user-provided name for the plugin
     * @param pluginVersion user-provided version string
     * @return validation result with extracted metadata and any errors/warnings
     */
    PluginValidationResult validate(byte[] jarBytes, String pluginName, String pluginVersion);

    /**
     * Validates and installs a plugin JAR into the plugins directory.
     *
     * The JAR is first validated; if validation fails, no installation occurs.
     * After successful installation, a restart is required for the plugin
     * to become available via ServiceLoader.
     *
     * @param jarBytes      raw bytes of the plugin JAR file
     * @param pluginName    user-provided name for the plugin
     * @param pluginVersion user-provided version string
     * @return install result indicating success/failure and whether restart is needed
     */
    PluginInstallResult install(byte[] jarBytes, String pluginName, String pluginVersion);

    /**
     * Removes an installed external plugin from the plugins directory.
     *
     * Only user-installed (external) plugins can be uninstalled.
     * A restart is required for the change to take effect.
     *
     * @param pluginId      the plugin identifier to remove
     * @param pluginVersion the specific version to remove
     * @return uninstall result indicating success/failure
     */
    PluginInstallResult uninstall(String pluginId, String pluginVersion);

    /**
     * Lists all external plugins currently installed in the plugins directory.
     *
     * @return list of installed plugin metadata
     */
    List<InstalledPluginInfo> listInstalledPlugins();
}
