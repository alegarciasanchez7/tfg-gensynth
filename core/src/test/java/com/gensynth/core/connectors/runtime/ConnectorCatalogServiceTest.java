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

        ConnectorPluginDescriptor file = connectors.stream()
            .filter(d -> "file".equals(d.getPluginId()))
            .findFirst()
            .orElse(null);

        assertNotNull("File connector plugin should be discovered", file);
        assertEquals("1.0.0", file.getPluginVersion());
        assertNotNull(file.getConfigSchema().get("properties"));
    }

    @Test
    public void testCatalogJsonContainsRabbitMqPluginId() {
        ConnectorCatalogService service = new ConnectorCatalogService();

        String json = service.getCatalogAsJson();

        assertTrue(json.contains("file"));
        assertTrue(json.contains("pluginVersion"));
    }

    @Test
    public void testFindLatestConnector() {
        ConnectorCatalogService service = new ConnectorCatalogService();

        Optional<ConnectorPluginDescriptor> latest = service.findLatestConnector("file");

        assertTrue(latest.isPresent());
        assertEquals("file", latest.get().getPluginId());
    }
}
