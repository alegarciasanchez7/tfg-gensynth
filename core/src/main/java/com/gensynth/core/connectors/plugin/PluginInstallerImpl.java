package com.gensynth.core.connectors.plugin;

import com.gensynth.core.api.IPluginInstaller;
import com.gensynth.core.connectors.spi.ConnectorPluginDescriptor;
import com.gensynth.core.connectors.spi.ConnectorPluginProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.ServiceLoader;
import java.util.Set;

/**
 * Default implementation of {@link IPluginInstaller}.
 *
 * Manages the lifecycle of external connector plugins:
 * validation, installation to the plugins directory, uninstallation,
 * and discovery of currently installed plugins.
 */
public class PluginInstallerImpl implements IPluginInstaller {

    private static final Logger logger = LoggerFactory.getLogger(PluginInstallerImpl.class);

    private final Path pluginsDirectory;

    /**
     * Constructs the installer targeting the specified plugins directory.
     *
     * @param pluginsDirectory path to the directory where plugin JARs are stored
     */
    public PluginInstallerImpl(Path pluginsDirectory) {
        this.pluginsDirectory = pluginsDirectory;
        ensurePluginsDirectoryExists();
    }

    @Override
    public PluginValidationResult validate(byte[] jarBytes, String pluginName, String pluginVersion) {
        Set<String> existingKeys = collectExistingPluginKeys();
        PluginSandboxValidator validator = new PluginSandboxValidator(existingKeys);
        return validator.validate(jarBytes, pluginName, pluginVersion);
    }

    @Override
    public PluginInstallResult install(byte[] jarBytes, String pluginName, String pluginVersion) {
        // Step 1: Validate first
        PluginValidationResult validation = validate(jarBytes, pluginName, pluginVersion);
        if (!validation.isValid()) {
            String errorSummary = String.join("; ", validation.getErrors());
            return PluginInstallResult.failure("Plugin validation failed: " + errorSummary);
        }

        // Step 2: Build file name from validated descriptor metadata
        String safeId = sanitizeFileName(validation.getPluginId());
        String safeVersion = sanitizeFileName(validation.getPluginVersion());
        String jarFileName = safeId + "-" + safeVersion + ".jar";
        Path targetPath = pluginsDirectory.resolve(jarFileName);

        // Step 3: Copy JAR to plugins directory
        try {
            Files.write(targetPath, jarBytes);
            logger.info("Plugin installed: {} -> {}", validation.getPluginId(), targetPath);
            return PluginInstallResult.success(
                    "Plugin '" + validation.getDisplayName() + "' installed successfully. Restart required.",
                    validation.getPluginId()
            );
        } catch (IOException e) {
            logger.error("Failed to write plugin JAR to {}", targetPath, e);
            return PluginInstallResult.failure("Failed to install plugin. Please try again.");
        }
    }

    @Override
    public PluginInstallResult uninstall(String pluginId, String pluginVersion) {
        if (pluginId == null || pluginId.isBlank() || pluginVersion == null || pluginVersion.isBlank()) {
            return PluginInstallResult.failure("Plugin identifier and version are required.");
        }

        // Find the JAR file by scanning and matching descriptors
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(pluginsDirectory, "*.jar")) {
            for (Path jarPath : stream) {
                InstalledPluginInfo info = loadPluginInfoFromJar(jarPath);
                if (info != null
                        && info.getPluginId().equals(pluginId)
                        && info.getPluginVersion().equals(pluginVersion)) {
                    Files.delete(jarPath);
                    logger.info("Plugin uninstalled: {}@{} ({})", pluginId, pluginVersion, jarPath.getFileName());
                    return PluginInstallResult.success(
                            "Plugin '" + info.getDisplayName() + "' removed. Restart required.",
                            pluginId
                    );
                }
            }
        } catch (IOException e) {
            logger.error("Error scanning plugins directory for uninstall", e);
            return PluginInstallResult.failure("Failed to uninstall plugin. Please try again.");
        }

        return PluginInstallResult.failure("Plugin not found in the plugins directory.");
    }

    @Override
    public List<InstalledPluginInfo> listInstalledPlugins() {
        List<InstalledPluginInfo> plugins = new ArrayList<>();
        if (!Files.isDirectory(pluginsDirectory)) {
            return plugins;
        }

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(pluginsDirectory, "*.jar")) {
            for (Path jarPath : stream) {
                InstalledPluginInfo info = loadPluginInfoFromJar(jarPath);
                if (info != null) {
                    plugins.add(info);
                }
            }
        } catch (IOException e) {
            logger.error("Error listing installed plugins", e);
        }

        return plugins;
    }

    /**
     * Loads plugin metadata from a JAR file by reading its SPI descriptor.
     *
     * @param jarPath path to the JAR file
     * @return plugin info, or null if the JAR is not a valid plugin
     */
    private InstalledPluginInfo loadPluginInfoFromJar(Path jarPath) {
        try {
            URL jarUrl = jarPath.toUri().toURL();
            try (URLClassLoader loader = new URLClassLoader(
                    new URL[]{jarUrl},
                    ConnectorPluginProvider.class.getClassLoader())) {

                ServiceLoader<ConnectorPluginProvider> sl =
                        ServiceLoader.load(ConnectorPluginProvider.class, loader);
                for (ConnectorPluginProvider provider : sl) {
                    ConnectorPluginDescriptor d = provider.descriptor();
                    Instant modifiedAt = Files.getLastModifiedTime(jarPath).toInstant();
                    return new InstalledPluginInfo(
                            d.getPluginId(),
                            d.getDisplayName(),
                            d.getPluginVersion(),
                            jarPath.getFileName().toString(),
                            modifiedAt,
                            true // always external when loaded from plugins dir
                    );
                }
            }
        } catch (Exception e) {
            logger.warn("Could not load plugin info from {}: {}", jarPath.getFileName(), e.getMessage());
        }
        return null;
    }

    /**
     * Collects all existing plugin keys (pluginId@version) from both the classpath
     * and the plugins directory for duplicate detection.
     */
    private Set<String> collectExistingPluginKeys() {
        Set<String> keys = new HashSet<>();

        // Classpath plugins (bundled connectors)
        ServiceLoader<ConnectorPluginProvider> classpathLoader =
                ServiceLoader.load(ConnectorPluginProvider.class);
        for (ConnectorPluginProvider provider : classpathLoader) {
            keys.add(provider.descriptor().key());
        }

        // External plugins
        for (InstalledPluginInfo info : listInstalledPlugins()) {
            keys.add(info.getPluginId() + "@" + info.getPluginVersion());
        }

        return keys;
    }

    /**
     * Sanitizes a string for use as part of a file name.
     */
    private String sanitizeFileName(String input) {
        if (input == null) {
            return "unknown";
        }
        return input.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    /**
     * Ensures the plugins directory exists, creating it if necessary.
     */
    private void ensurePluginsDirectoryExists() {
        try {
            if (!Files.exists(pluginsDirectory)) {
                Files.createDirectories(pluginsDirectory);
                logger.info("Created plugins directory: {}", pluginsDirectory);
            }
        } catch (IOException e) {
            logger.error("Failed to create plugins directory: {}", pluginsDirectory, e);
        }
    }
}
