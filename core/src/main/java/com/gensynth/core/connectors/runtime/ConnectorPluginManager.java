package com.gensynth.core.connectors.runtime;

import com.gensynth.plugin.api.ConnectorField;
import com.gensynth.plugin.api.ConnectorInfo;
import com.gensynth.plugin.api.ConnectorPlugin;
import com.gensynth.plugin.api.PluginApi;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.ServiceConfigurationError;
import java.util.ServiceLoader;
import java.util.jar.JarFile;

/**
 * Discovers and manages connector plugins: built-in ones from the classpath and external ones
 * from the JARs of the plugins directory.
 */
public class ConnectorPluginManager {

    private static final Logger logger = LoggerFactory.getLogger(ConnectorPluginManager.class);

    /** Service file of plugins built for the legacy pre-release plugin API, which is no longer supported. */
    static final String LEGACY_SERVICE_FILE = "META-INF/services/com.gensynth.core.connectors.spi.ConnectorPluginProvider";

    private final Map<String, ConnectorPlugin> pluginsByKey = new LinkedHashMap<>();
    private final Map<String, ConnectorDescriptor> descriptorsByKey = new LinkedHashMap<>();
    private final Map<String, URLClassLoader> classLoadersByKey = new LinkedHashMap<>();
    private final List<ConnectorDescriptor> descriptors;

    /**
     * Loads the plugins of the classpath only.
     */
    public ConnectorPluginManager() {
        this(ServiceLoader.load(ConnectorPlugin.class));
    }

    /**
     * Loads the plugins of the classpath and of the external plugins directory.
     *
     * @param pluginsDirectory directory containing external plugin JARs
     */
    public ConnectorPluginManager(Path pluginsDirectory) {
        register(ServiceLoader.load(ConnectorPlugin.class), false, null);
        discoverExternalPlugins(pluginsDirectory);
        this.descriptors = buildSortedCatalog();
    }

    /**
     * Uses the given plugins (tests and custom bootstrap).
     *
     * @param plugins plugin instances
     */
    public ConnectorPluginManager(Iterable<ConnectorPlugin> plugins) {
        register(plugins, false, null);
        this.descriptors = buildSortedCatalog();
    }

    private void register(Iterable<ConnectorPlugin> plugins, boolean external, URLClassLoader loader) {
        for (ConnectorPlugin plugin : plugins) {
            // A plugin JAR's ServiceLoader also sees the core's built-in plugins: keep only its own
            if (loader != null && plugin.getClass().getClassLoader() != loader) {
                continue;
            }
            try {
                ConnectorInfo info = plugin.info();
                List<ConnectorField> fields = ConnectorField.requireUniqueKeys(List.copyOf(plugin.fields()));
                ConnectorDescriptor descriptor = new ConnectorDescriptor(info, fields, external);
                String key = descriptor.key();
                if (pluginsByKey.containsKey(key)) {
                    logger.warn("Duplicate connector plugin registration (skipped): {}", key);
                    continue;
                }
                pluginsByKey.put(key, plugin);
                descriptorsByKey.put(key, descriptor);
                if (loader != null) {
                    classLoadersByKey.put(key, loader);
                }
            } catch (RuntimeException e) {
                logger.warn("Invalid connector plugin {} (skipped): {}", plugin.getClass().getName(), e.getMessage());
            }
        }
    }

    private void discoverExternalPlugins(Path pluginsDirectory) {
        if (pluginsDirectory == null || !Files.isDirectory(pluginsDirectory)) {
            return;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(pluginsDirectory, "*.jar")) {
            for (Path jarPath : stream) {
                loadPluginsFromJar(jarPath);
            }
        } catch (IOException e) {
            logger.error("Failed to scan plugins directory: {}", pluginsDirectory, e);
        }
    }

    /**
     * Loads the plugins of one JAR with an isolated class loader that also sees the shared
     * client libraries ({@code lib/shared}).
     */
    private void loadPluginsFromJar(Path jarPath) {
        try {
            String incompatibility = checkApiCompatibility(jarPath);
            if (incompatibility != null) {
                logger.warn("Plugin {} not loaded: {}", jarPath.getFileName(), incompatibility);
                return;
            }

            List<URL> urls = new ArrayList<>();
            urls.add(jarPath.toUri().toURL());
            Path sharedLibDir = jarPath.getParent().resolve("../lib/shared").normalize();
            if (Files.isDirectory(sharedLibDir)) {
                try (DirectoryStream<Path> sharedStream = Files.newDirectoryStream(sharedLibDir, "*.jar")) {
                    for (Path sharedJar : sharedStream) {
                        urls.add(sharedJar.toUri().toURL());
                    }
                }
            }

            PluginClassLoader pluginClassLoader = new PluginClassLoader(
                urls.toArray(new URL[0]), ConnectorPlugin.class.getClassLoader());
            register(ServiceLoader.load(ConnectorPlugin.class, pluginClassLoader), true, pluginClassLoader);
            logger.info("Loaded external plugin from: {}", jarPath.getFileName());
        } catch (Exception | ServiceConfigurationError | LinkageError e) {
            // A broken plugin must never prevent GenSynth from starting
            logger.warn("Failed to load plugin from {}: {}", jarPath.getFileName(), e.getMessage());
        }
    }

    /**
     * Checks that a JAR was built for this plugin API.
     *
     * @param jarPath plugin JAR
     * @return a reason if the JAR is not compatible, or null if it is
     * @throws IOException if the JAR cannot be read
     */
    public static String checkApiCompatibility(Path jarPath) throws IOException {
        try (JarFile jar = new JarFile(jarPath.toFile())) {
            if (jar.getEntry(PluginApi.SERVICE_FILE) != null) {
                return null;
            }
            if (jar.getEntry(LEGACY_SERVICE_FILE) != null) {
                return "built for the legacy plugin API (ConnectorPluginProvider); rebuild it with gensynth-plugin-api " + PluginApi.VERSION;
            }
            return "missing " + PluginApi.SERVICE_FILE;
        }
    }

    private List<ConnectorDescriptor> buildSortedCatalog() {
        List<ConnectorDescriptor> catalog = new ArrayList<>(descriptorsByKey.values());
        catalog.sort(Comparator
            .comparing(ConnectorDescriptor::getPluginId)
            .thenComparing(ConnectorDescriptor::getPluginVersion, ConnectorPluginManager::compareVersions));
        return Collections.unmodifiableList(catalog);
    }

    /**
     * @param pluginId      plugin identifier
     * @param pluginVersion plugin version
     * @return true if the plugin was loaded from the plugins directory
     */
    public boolean isExternalPlugin(String pluginId, String pluginVersion) {
        ConnectorDescriptor descriptor = descriptorsByKey.get(pluginId + "@" + pluginVersion);
        return descriptor != null && descriptor.isExternal();
    }

    /**
     * Unregisters a plugin and closes its class loader to release the JAR file.
     * The catalog is not rebuilt because the application restarts after an uninstall.
     *
     * @param pluginId      plugin identifier
     * @param pluginVersion plugin version
     * @return true if the plugin was found and unloaded
     */
    public boolean unloadPlugin(String pluginId, String pluginVersion) {
        String key = pluginId + "@" + pluginVersion;
        if (pluginsByKey.remove(key) == null) {
            return false;
        }
        descriptorsByKey.remove(key);
        URLClassLoader loader = classLoadersByKey.remove(key);
        if (loader != null) {
            try {
                loader.close();
            } catch (IOException e) {
                logger.warn("Failed to close ClassLoader for {}: {}", key, e.getMessage());
            }
        }
        return true;
    }

    /**
     * @return catalog sorted by plugin id and version
     */
    public List<ConnectorDescriptor> listDescriptors() {
        return descriptors;
    }

    /**
     * @param pluginId      plugin identifier
     * @param pluginVersion plugin version
     * @return the descriptor, if loaded
     */
    public Optional<ConnectorDescriptor> findDescriptor(String pluginId, String pluginVersion) {
        return Optional.ofNullable(descriptorsByKey.get(pluginId + "@" + pluginVersion));
    }

    /**
     * @param pluginId plugin identifier
     * @return the descriptor of the highest loaded version
     */
    public Optional<ConnectorDescriptor> findLatestDescriptor(String pluginId) {
        return descriptors.stream()
            .filter(d -> d.getPluginId().equals(pluginId))
            .max((a, b) -> compareVersions(a.getPluginVersion(), b.getPluginVersion()));
    }

    /**
     * @param descriptor a descriptor of this catalog
     * @return the plugin behind the descriptor
     */
    public Optional<ConnectorPlugin> findPlugin(ConnectorDescriptor descriptor) {
        return Optional.ofNullable(pluginsByKey.get(descriptor.key()));
    }

    static int compareVersions(String a, String b) {
        String[] left = a.split("\\.");
        String[] right = b.split("\\.");
        int length = Math.max(left.length, right.length);
        for (int i = 0; i < length; i++) {
            int cmp = Integer.compare(parseVersionPart(left, i), parseVersionPart(right, i));
            if (cmp != 0) {
                return cmp;
            }
        }
        return a.compareTo(b);
    }

    private static int parseVersionPart(String[] parts, int index) {
        if (index >= parts.length) {
            return 0;
        }
        try {
            return Integer.parseInt(parts[index]);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }
}
