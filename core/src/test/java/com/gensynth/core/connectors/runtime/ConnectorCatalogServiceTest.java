package com.gensynth.core.connectors.runtime;

import com.gensynth.core.connectors.spi.ConnectorPluginDescriptor;
import org.junit.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.Assert.*;

public class ConnectorCatalogServiceTest {

    @Test
    public void testCatalogIncludesRabbitMqPlugin() {
        ConnectorCatalogService service = new ConnectorCatalogService();

        List<ConnectorPluginDescriptor> connectors = service.listAvailableConnectors();
        assertFalse("Connector catalog should not be empty", connectors.isEmpty());

        ConnectorPluginDescriptor rabbit = connectors.stream()
            .filter(d -> "rabbitmq".equals(d.getPluginId()))
            .findFirst()
            .orElse(null);

        assertNotNull("RabbitMQ plugin should be discovered", rabbit);
        assertEquals("1.0.0", rabbit.getPluginVersion());
        assertNotNull(rabbit.getConfigSchema().get("properties"));
    }

    @Test
    public void testCatalogJsonContainsRabbitMqPluginId() {
        ConnectorCatalogService service = new ConnectorCatalogService();

        String json = service.getCatalogAsJson();

        assertTrue(json.contains("rabbitmq"));
        assertTrue(json.contains("pluginVersion"));
    }

    @Test
    public void testFindLatestConnector() {
        ConnectorCatalogService service = new ConnectorCatalogService();

        Optional<ConnectorPluginDescriptor> latest = service.findLatestConnector("rabbitmq");

        assertTrue(latest.isPresent());
        assertEquals("rabbitmq", latest.get().getPluginId());
    }
}
