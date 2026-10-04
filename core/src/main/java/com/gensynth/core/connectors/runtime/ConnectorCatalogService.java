package com.gensynth.core.connectors.runtime;

import com.gensynth.plugin.api.ConnectorConfig;
import com.gensynth.plugin.api.ConnectorContext;
import com.gensynth.plugin.api.ConnectorPlugin;
import com.gensynth.plugin.api.ConnectorSession;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Connector catalog used by the bridge: lists the loaded plugins and opens sessions for flows.
 */
public class ConnectorCatalogService {

    private final ConnectorPluginManager pluginManager;

    /**
     * Uses the plugins of the classpath only.
     */
    public ConnectorCatalogService() {
        this(new ConnectorPluginManager());
    }

    /**
     * Uses the plugins of the classpath and of the external plugins directory.
     *
     * @param pluginsDirectory directory containing external plugin JARs
     */
    public ConnectorCatalogService(Path pluginsDirectory) {
        this(new ConnectorPluginManager(pluginsDirectory));
    }

    /**
     * @param pluginManager the plugin manager to use
     */
    public ConnectorCatalogService(ConnectorPluginManager pluginManager) {
        this.pluginManager = pluginManager;
    }

    /**
     * @return the underlying plugin manager
     */
    public ConnectorPluginManager getPluginManager() {
        return pluginManager;
    }

    /**
     * @return every loaded connector, sorted by id and version
     */
    public List<ConnectorDescriptor> listAvailableConnectors() {
        return pluginManager.listDescriptors();
    }

    /**
     * @param pluginId plugin identifier (the flow technology)
     * @return the highest loaded version of the connector
     */
    public Optional<ConnectorDescriptor> findLatestConnector(String pluginId) {
        return pluginManager.findLatestDescriptor(pluginId);
    }

    /**
     * Opens a session of the latest version of a connector for one flow.
     *
     * @param pluginId  plugin identifier (the flow technology)
     * @param rawConfig connector configuration of the flow; validated against the plugin fields
     * @param context   runtime information about the flow
     * @return the open session
     * @throws com.gensynth.plugin.api.ConnectorConfigException if the configuration is invalid
     * @throws Exception if the plugin is not found or cannot connect
     */
    public ConnectorSession openSession(String pluginId, Map<String, ?> rawConfig, ConnectorContext context) throws Exception {
        ConnectorDescriptor descriptor = findLatestConnector(pluginId)
            .orElseThrow(() -> new IllegalStateException("No connector found for " + pluginId));
        ConnectorPlugin plugin = pluginManager.findPlugin(descriptor)
            .orElseThrow(() -> new IllegalStateException("No connector found for " + pluginId));
        ConnectorConfig config = ConnectorConfig.resolve(descriptor.fieldDefinitions(), rawConfig);
        ConnectorSession session = plugin.connect(config, context);
        if (session == null) {
            throw new IllegalStateException("Connector " + descriptor.key() + " returned no session");
        }
        return session;
    }
}
