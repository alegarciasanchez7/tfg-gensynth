package com.gensynth.core.connectors.runtime;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.connectors.spi.ConnectorPlugin;
import com.gensynth.core.connectors.spi.ConnectorPluginDescriptor;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Minimal API surface for UI/backend integration.
 *
 * Provides:
 * - plugin catalog (id/version/schema)
 * - runtime plugin creation from selected id/version
 */
public class ConnectorCatalogService {

    private final ConnectorPluginManager pluginManager;
    private final String catalogJson;

    public ConnectorCatalogService() {
        this(new ConnectorPluginManager(), new ObjectMapper());
    }

    /**
     * Constructor with external plugins directory support.
     *
     * @param pluginsDirectory path to the directory containing external plugin JARs
     */
    public ConnectorCatalogService(Path pluginsDirectory) {
        this(new ConnectorPluginManager(pluginsDirectory), new ObjectMapper());
    }

    public ConnectorCatalogService(ConnectorPluginManager pluginManager, ObjectMapper objectMapper) {
        this.pluginManager = pluginManager;
        this.catalogJson = serializeCatalog(pluginManager.listDescriptors(), objectMapper);
    }

    /**
     * Exposes the plugin manager for external plugin checks.
     *
     * @return the underlying ConnectorPluginManager
     */
    public ConnectorPluginManager getPluginManager() {
        return pluginManager;
    }

    public List<ConnectorPluginDescriptor> listAvailableConnectors() {
        return pluginManager.listDescriptors();
    }

    public Optional<ConnectorPluginDescriptor> findConnector(String pluginId, String pluginVersion) {
        return pluginManager.findDescriptor(pluginId, pluginVersion);
    }

    public Optional<ConnectorPluginDescriptor> findLatestConnector(String pluginId) {
        return pluginManager.findLatestDescriptor(pluginId);
    }

    public ConnectorPlugin createAndInitialize(
        String pluginId,
        String pluginVersion,
        Map<String, Object> config
    ) {
        ConnectorPlugin plugin = pluginManager.createPlugin(pluginId, pluginVersion);
        plugin.initialize(config);
        return plugin;
    }

    /**
     * JSON-ready catalog payload for UI rendering.
     */
    public String getCatalogAsJson() {
        return catalogJson;
    }

    private static String serializeCatalog(List<ConnectorPluginDescriptor> descriptors, ObjectMapper objectMapper) {
        try {
            return objectMapper.writeValueAsString(descriptors);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unable to serialize connector catalog", e);
        }
    }
}
