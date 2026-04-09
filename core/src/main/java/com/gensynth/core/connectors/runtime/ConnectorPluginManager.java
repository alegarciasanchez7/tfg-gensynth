package com.gensynth.core.connectors.runtime;

import com.gensynth.core.connectors.spi.ConnectorPlugin;
import com.gensynth.core.connectors.spi.ConnectorPluginDescriptor;
import com.gensynth.core.connectors.spi.ConnectorPluginProvider;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.ServiceLoader;

/**
 * Discovers and manages connector plugin providers.
 */
public class ConnectorPluginManager {

    private final Map<String, ConnectorPluginProvider> providersByKey;
    private final List<ConnectorPluginDescriptor> descriptors;

    /**
     * Load providers through ServiceLoader.
     */
    public ConnectorPluginManager() {
        this(ServiceLoader.load(ConnectorPluginProvider.class));
    }

    /**
     * Alternative constructor for testing/custom bootstrap.
     */
    public ConnectorPluginManager(Iterable<ConnectorPluginProvider> providers) {
        this.providersByKey = new LinkedHashMap<>();
        for (ConnectorPluginProvider provider : providers) {
            ConnectorPluginDescriptor descriptor = provider.descriptor();
            String key = descriptor.key();
            if (providersByKey.containsKey(key)) {
                throw new IllegalStateException("Duplicate connector plugin registration: " + key);
            }
            providersByKey.put(key, provider);
        }

        List<ConnectorPluginDescriptor> catalog = new ArrayList<>(providersByKey.size());
        for (ConnectorPluginProvider provider : providersByKey.values()) {
            catalog.add(provider.descriptor());
        }
        catalog.sort(Comparator
            .comparing(ConnectorPluginDescriptor::getPluginId)
            .thenComparing(ConnectorPluginDescriptor::getPluginVersion, ConnectorPluginManager::compareVersions));
        this.descriptors = Collections.unmodifiableList(catalog);
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
