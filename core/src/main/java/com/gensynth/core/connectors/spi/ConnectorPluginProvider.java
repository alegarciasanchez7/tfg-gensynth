package com.gensynth.core.connectors.spi;

/**
 * Provider entry discovered by ServiceLoader.
 *
 * Each provider exposes metadata for UI/catalog and can create isolated
 * runtime plugin instances.
 */
public interface ConnectorPluginProvider {

    /**
     * Static descriptor used by UI/backend catalog.
     */
    ConnectorPluginDescriptor descriptor();

    /**
     * Create a runtime plugin instance.
     */
    ConnectorPlugin create();
}
