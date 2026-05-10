package com.gensynth.core.connectors.runtime;

import com.gensynth.core.connectors.spi.ConnectorPlugin;
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
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.ServiceLoader;
import java.util.Set;

/**
 * Discovers and manages connector plugin providers.
 */
public class ConnectorPluginManager {

    private static final Logger logger = LoggerFactory.getLogger(ConnectorPluginManager.class);

    private final Map<String, ConnectorPluginProvider> providersByKey;
    private final List<ConnectorPluginDescriptor> descriptors;
    private final Set<String> externalPluginKeys;
    private final Map<String, URLClassLoader> classLoadersByKey;

    /**
     * Load providers through ServiceLoader (classpath only).
     */
    public ConnectorPluginManager() {
        this(ServiceLoader.load(ConnectorPluginProvider.class));
    }

    /**
     * Load providers from classpath and from the external plugins directory.
     *
     * @param pluginsDirectory path to the directory containing external plugin JARs
     */
    public ConnectorPluginManager(Path pluginsDirectory) {
        this.providersByKey = new LinkedHashMap<>();
        this.externalPluginKeys = new HashSet<>();
        this.classLoadersByKey = new LinkedHashMap<>();

        // Load bundled (classpath) providers
        registerProviders(ServiceLoader.load(ConnectorPluginProvider.class), false);

        // Load external plugin providers from plugins/ directory
        discoverExternalPlugins(pluginsDirectory);

        this.descriptors = buildSortedCatalog();
    }

    /**
     * Alternative constructor for testing/custom bootstrap.
     */
    public ConnectorPluginManager(Iterable<ConnectorPluginProvider> providers) {
        this.providersByKey = new LinkedHashMap<>();
        this.externalPluginKeys = new HashSet<>();
        this.classLoadersByKey = new LinkedHashMap<>();
        registerProviders(providers, false);
        this.descriptors = buildSortedCatalog();
    }

    /**
     * Registers providers into the internal map.
     */
    private void registerProviders(Iterable<ConnectorPluginProvider> providers, boolean external) {
        registerProviders(providers, external, null);
    }

    private void registerProviders(Iterable<ConnectorPluginProvider> providers, boolean external, URLClassLoader loader) {
        for (ConnectorPluginProvider provider : providers) {
            ConnectorPluginDescriptor descriptor = provider.descriptor();
            String key = descriptor.key();
            if (providersByKey.containsKey(key)) {
                logger.warn("Duplicate connector plugin registration (skipped): {}", key);
                continue;
            }
            providersByKey.put(key, provider);
            descriptor.setExternal(external); // Mark descriptor for UI
            if (external) {
                externalPluginKeys.add(key);
                if (loader != null) {
                    classLoadersByKey.put(key, loader);
                }
            }
        }
    }

    /**
     * Discovers and loads ConnectorPluginProviders from JAR files in the given directory.
     */
    private void discoverExternalPlugins(Path pluginsDirectory) {
        if (pluginsDirectory == null || !Files.isDirectory(pluginsDirectory)) {
            return;
        }

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(pluginsDirectory, "*.jar")) {
            for (Path jarPath : stream) {
                loadProvidersFromJar(jarPath);
            }
        } catch (IOException e) {
            logger.error("Failed to scan plugins directory: {}", pluginsDirectory, e);
        }
    }

    /**
     * Loads ConnectorPluginProviders from a single JAR file using an isolated URLClassLoader
     * that also includes shared libraries (Kafka, RabbitMQ, etc.).
     */
    private void loadProvidersFromJar(Path jarPath) {
        try {
            List<URL> urls = new ArrayList<>();
            urls.add(jarPath.toUri().toURL());
            
            // Include shared libraries in the plugin's classpath
            Path sharedLibDir = jarPath.getParent().resolve("../lib/shared").normalize();
            if (Files.isDirectory(sharedLibDir)) {
                try (DirectoryStream<Path> sharedStream = Files.newDirectoryStream(sharedLibDir, "*.jar")) {
                    for (Path sharedJar : sharedStream) {
                        urls.add(sharedJar.toUri().toURL());
                    }
                }
            }

            URLClassLoader pluginClassLoader = new URLClassLoader(
                    urls.toArray(new URL[0]),
                    ConnectorPluginProvider.class.getClassLoader()
            );

            ServiceLoader<ConnectorPluginProvider> loader =
                    ServiceLoader.load(ConnectorPluginProvider.class, pluginClassLoader);
            registerProviders(loader, true, pluginClassLoader);

            logger.info("Loaded external plugin from: {} (with shared libs)", jarPath.getFileName());
        } catch (Exception e) {
            logger.warn("Failed to load plugin from {}: {}", jarPath.getFileName(), e.getMessage());
        }
    }

    /**
     * Builds the sorted catalog from the current providers map.
     */
    private List<ConnectorPluginDescriptor> buildSortedCatalog() {
        List<ConnectorPluginDescriptor> catalog = new ArrayList<>(providersByKey.size());
        for (ConnectorPluginProvider provider : providersByKey.values()) {
            catalog.add(provider.descriptor());
        }
        catalog.sort(Comparator
            .comparing(ConnectorPluginDescriptor::getPluginId)
            .thenComparing(ConnectorPluginDescriptor::getPluginVersion, ConnectorPluginManager::compareVersions));
        return Collections.unmodifiableList(catalog);
    }

    /**
     * Checks if a plugin key belongs to an externally installed plugin.
     *
     * @param pluginId      plugin identifier
     * @param pluginVersion plugin version
     * @return true if the plugin was loaded from the plugins directory
     */
    public boolean isExternalPlugin(String pluginId, String pluginVersion) {
        return externalPluginKeys.contains(pluginId + "@" + pluginVersion);
    }

    /**
     * Unregisters a plugin and closes its ClassLoader to release file locks.
     *
     * @param pluginId      plugin identifier
     * @param pluginVersion plugin version
     * @return true if the plugin was found and unloaded
     */
    public boolean unloadPlugin(String pluginId, String pluginVersion) {
        String key = pluginId + "@" + pluginVersion;
        if (!providersByKey.containsKey(key)) {
            return false;
        }

        providersByKey.remove(key);
        externalPluginKeys.remove(key);
        
        URLClassLoader loader = classLoadersByKey.remove(key);
        if (loader != null) {
            try {
                loader.close();
                logger.info("Closed ClassLoader for plugin: {}", key);
            } catch (IOException e) {
                logger.warn("Failed to close ClassLoader for {}: {}", key, e.getMessage());
            }
        }

        // Note: we don't rebuild 'descriptors' list here because the system
        // is usually about to restart after an uninstall.
        return true;
    }

    /**
     * @return catalog sorted by pluginId and version.
     */
    public List<ConnectorPluginDescriptor> listDescriptors() {
        return descriptors;
    }

    public Optional<ConnectorPluginDescriptor> findDescriptor(String pluginId, String pluginVersion) {
        return findProvider(pluginId, pluginVersion).map(ConnectorPluginProvider::descriptor);
    }

    public ConnectorPlugin createPlugin(String pluginId, String pluginVersion) {
        ConnectorPluginProvider provider = findProvider(pluginId, pluginVersion)
            .orElseThrow(() -> new IllegalArgumentException(
                "Connector plugin not found: " + pluginId + "@" + pluginVersion
            ));
        return provider.create();
    }

    public Optional<ConnectorPluginDescriptor> findLatestDescriptor(String pluginId) {
        return descriptors.stream()
            .filter(d -> d.getPluginId().equals(pluginId))
            .max((a, b) -> compareVersions(a.getPluginVersion(), b.getPluginVersion()));
    }

    public ConnectorPlugin createLatestPlugin(String pluginId) {
        ConnectorPluginDescriptor descriptor = findLatestDescriptor(pluginId)
            .orElseThrow(() -> new IllegalArgumentException(
                "Connector plugin not found for pluginId: " + pluginId
            ));
        return createPlugin(descriptor.getPluginId(), descriptor.getPluginVersion());
    }

    private Optional<ConnectorPluginProvider> findProvider(String pluginId, String pluginVersion) {
        String key = pluginId + "@" + pluginVersion;
        return Optional.ofNullable(providersByKey.get(key));
    }

    private static int compareVersions(String a, String b) {
        String[] left = a.split("\\.");
        String[] right = b.split("\\.");
        int length = Math.max(left.length, right.length);
        for (int i = 0; i < length; i++) {
            int leftPart = parseVersionPart(left, i);
            int rightPart = parseVersionPart(right, i);
            int cmp = Integer.compare(leftPart, rightPart);
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
