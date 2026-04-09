package com.gensynth.core.connectors.spi;

import java.util.Map;

/**
 * Runtime contract for connector plugins.
 *
 * Core depends only on this abstraction and remains transport-agnostic.
 */
public interface ConnectorPlugin {

    /**
     * Initialize plugin instance with validated connector-specific configuration.
     */
    void initialize(Map<String, Object> config);

    /**
     * Start connector resources (connections/channels/clients).
     */
    void start();

    /**
     * Publish payload to external transport.
     *
     * @param destination Connector-specific destination (routing key/topic/queue).
     *                    If null/blank plugin should use its configured default.
     * @param payload Serialized payload to publish.
     * @param headers Optional metadata headers.
     */
    void publish(String destination, byte[] payload, Map<String, String> headers);

    /**
     * Stop and release resources.
     */
    void stop();

    /**
     * @return true when connector is operational.
     */
    boolean isHealthy();
}
