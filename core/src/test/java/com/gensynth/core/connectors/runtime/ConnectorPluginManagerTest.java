package com.gensynth.core.connectors.runtime;

import com.gensynth.core.connectors.rabbitmq.RabbitMqConnectorPluginProvider;
import com.gensynth.core.connectors.spi.ConnectorPlugin;
import com.gensynth.core.connectors.spi.ConnectorPluginDescriptor;
import com.gensynth.core.connectors.spi.ConnectorPluginProvider;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

public class ConnectorPluginManagerTest {

    @Test
    public void testDuplicateProviderRegistrationSkipsDuplicate() {
        ConnectorPluginProvider providerA = new RabbitMqConnectorPluginProvider();
        ConnectorPluginProvider providerB = new RabbitMqConnectorPluginProvider();

        // Should not throw — duplicates are logged and skipped
        ConnectorPluginManager manager = new ConnectorPluginManager(Arrays.asList(providerA, providerB));

        // Only one registration should exist
        long count = manager.listDescriptors().stream()
                .filter(d -> d.getPluginId().equals(providerA.descriptor().getPluginId()))
                .count();
        assertEquals(1, count);
    }

    @Test
    public void testListDescriptorsSorted() {
        ConnectorPluginManager manager = new ConnectorPluginManager(Arrays.asList(
            new RabbitMqConnectorPluginProvider()
        ));

        ConnectorPluginDescriptor first = manager.listDescriptors().get(0);
        assertTrue(first.getPluginId().compareTo("rabbitmq") <= 0);
    }

    @Test
    public void testFindLatestDescriptorUsesHighestVersion() {
        ConnectorPluginManager manager = new ConnectorPluginManager(Arrays.asList(
            new FakeProvider("rabbitmq", "1.0.0"),
            new FakeProvider("rabbitmq", "1.10.0"),
            new FakeProvider("rabbitmq", "1.2.0")
        ));

        Optional<ConnectorPluginDescriptor> latest = manager.findLatestDescriptor("rabbitmq");
        assertTrue(latest.isPresent());
        assertEquals("1.10.0", latest.get().getPluginVersion());
    }

    @Test
    public void testCreateLatestPlugin() {
        ConnectorPluginManager manager = new ConnectorPluginManager(Arrays.asList(
            new FakeProvider("rabbitmq", "1.0.0"),
            new FakeProvider("rabbitmq", "2.0.0")
        ));

        ConnectorPlugin plugin = manager.createLatestPlugin("rabbitmq");
        assertNotNull(plugin);
    }

    private static class FakeProvider implements ConnectorPluginProvider {
        private final ConnectorPluginDescriptor descriptor;

        private FakeProvider(String pluginId, String version) {
            Map<String, Object> schema = new LinkedHashMap<>();
            schema.put("type", "object");
            schema.put("properties", Collections.emptyMap());
            this.descriptor = new ConnectorPluginDescriptor(
                pluginId,
                "Fake",
                version,
                "1.x",
                schema
            );
        }

        @Override
        public ConnectorPluginDescriptor descriptor() {
            return descriptor;
        }

        @Override
        public ConnectorPlugin create() {
            return new ConnectorPlugin() {
                @Override
                public void initialize(Map<String, Object> config) {
                }

                @Override
                public void start() {
                }

                @Override
                public void publish(String destination, byte[] payload, Map<String, String> headers) {
                }

                @Override
                public void stop() {
                }

                @Override
                public boolean isHealthy() {
                    return false;
                }
            };
        }
    }
}
