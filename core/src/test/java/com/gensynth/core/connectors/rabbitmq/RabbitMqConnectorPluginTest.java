package com.gensynth.core.connectors.rabbitmq;

import com.gensynth.core.connectors.spi.ConnectorPlugin;
import com.gensynth.core.connectors.spi.ConnectorPluginDescriptor;
import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.*;

public class RabbitMqConnectorPluginTest {

    @Test
    public void testProviderDescriptorHasRequiredMetadata() {
        RabbitMqConnectorPluginProvider provider = new RabbitMqConnectorPluginProvider();

        ConnectorPluginDescriptor descriptor = provider.descriptor();

        assertEquals("rabbitmq", descriptor.getPluginId());
        assertEquals("1.0.0", descriptor.getPluginVersion());
        assertEquals("1.x", descriptor.getCoreApiVersion());
        assertTrue(descriptor.getConfigSchema().containsKey("properties"));
    }

    @Test
    public void testCreateAndInitializePlugin() {
        RabbitMqConnectorPluginProvider provider = new RabbitMqConnectorPluginProvider();
        ConnectorPlugin plugin = provider.create();

        Map<String, Object> config = new HashMap<>();
        config.put("host", "localhost");
        config.put("port", 5672);
        config.put("username", "guest");
        config.put("password", "guest");
        config.put("virtualHost", "/");
        config.put("exchange", "gensynth.exchange");
        config.put("exchangeType", "topic");
        config.put("routingKey", "gensynth.data");

        plugin.initialize(config);
        assertFalse(plugin.isHealthy());

        // Plugin should reject publish when not started yet
        try {
            plugin.publish("gensynth.data", "hello".getBytes(), null);
            fail("Expected IllegalStateException when publishing before start");
        } catch (IllegalStateException expected) {
            // expected
        }
    }

    @Test
    public void testReinitializeAllowedWhenNotStarted() {
        RabbitMqConnectorPluginProvider provider = new RabbitMqConnectorPluginProvider();
        ConnectorPlugin plugin = provider.create();

        Map<String, Object> configA = new HashMap<>();
        configA.put("host", "localhost");
        configA.put("port", 5672);
        configA.put("exchange", "gensynth.exchange");
        configA.put("exchangeType", "topic");

        Map<String, Object> configB = new HashMap<>();
        configB.put("host", "127.0.0.1");
        configB.put("port", 5673);
        configB.put("exchange", "gensynth.exchange.v2");
        configB.put("exchangeType", "direct");

        plugin.initialize(configA);
        plugin.initialize(configB);

        assertFalse(plugin.isHealthy());
    }

    @Test(expected = IllegalArgumentException.class)
    public void testInitializeRejectsInvalidBoolean() {
        RabbitMqConnectorPluginProvider provider = new RabbitMqConnectorPluginProvider();
        ConnectorPlugin plugin = provider.create();

        Map<String, Object> config = new HashMap<>();
        config.put("host", "localhost");
        config.put("exchange", "gensynth.exchange");
        config.put("exchangeType", "topic");
        config.put("exchangeDurable", "not-a-boolean");

        plugin.initialize(config);
    }

    @Test(expected = IllegalArgumentException.class)
    public void testInitializeRejectsOutOfRangePort() {
        RabbitMqConnectorPluginProvider provider = new RabbitMqConnectorPluginProvider();
        ConnectorPlugin plugin = provider.create();

        Map<String, Object> config = new HashMap<>();
        config.put("host", "localhost");
        config.put("port", 70000);
        config.put("exchange", "gensynth.exchange");
        config.put("exchangeType", "topic");

        plugin.initialize(config);
    }
}
