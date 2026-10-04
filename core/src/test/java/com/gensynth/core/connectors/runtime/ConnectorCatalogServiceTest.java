package com.gensynth.core.connectors.runtime;

import com.gensynth.plugin.api.ConnectorConfigException;
import com.gensynth.plugin.api.ConnectorContext;
import com.gensynth.plugin.api.ConnectorSession;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.Assert.*;

public class ConnectorCatalogServiceTest {

    @Test
    public void catalogIncludesTheBuiltInFileConnectorWithOrderedFields() {
        ConnectorCatalogService service = new ConnectorCatalogService();

        ConnectorDescriptor file = service.listAvailableConnectors().stream()
            .filter(d -> "file".equals(d.getPluginId()))
            .findFirst()
            .orElseThrow();

        assertEquals("1.0.0", file.getPluginVersion());
        assertFalse(file.getDescription().isBlank());
        assertFalse(file.isExternal());
        List<Map<String, Object>> fields = file.getFields();
        assertEquals(List.of("format", "outputDir", "fileName"), fields.stream().map(f -> f.get("key")).toList());
        assertEquals("SELECT", fields.get(0).get("type"));
        assertFalse(((String) fields.get(1).get("tooltip")).isBlank());
        assertEquals(4, ((List<?>) fields.get(0).get("options")).size());
    }

    @Test
    public void findLatestConnector() {
        Optional<ConnectorDescriptor> latest = new ConnectorCatalogService().findLatestConnector("file");
        assertTrue(latest.isPresent());
        assertEquals("file", latest.get().getPluginId());
    }

    @Test
    public void openSessionWritesThroughTheFileConnector() throws Exception {
        Path dir = Files.createTempDirectory("gensynth-file-connector-");
        ConnectorCatalogService service = new ConnectorCatalogService();

        try (ConnectorSession session = service.openSession("file",
                Map.of("outputDir", dir.toString(), "format", "json"),
                new ConnectorContext("My flow", "My group", "unused"))) {
            session.send("{\"a\":1}".getBytes(StandardCharsets.UTF_8), Map.of());
            session.send("{\"a\":2}".getBytes(StandardCharsets.UTF_8), Map.of());
        }

        Path file = dir.resolve("My_group").resolve("My_flow.json");
        assertEquals("[\n{\"a\":1},\n{\"a\":2}\n]", Files.readString(file));
    }

    @Test
    public void fileConnectorDefaultsToTheSessionFolder() throws Exception {
        Path session = Files.createTempDirectory("gensynth-session-");
        ConnectorCatalogService service = new ConnectorCatalogService();

        try (ConnectorSession ignored = service.openSession("file", Map.of(),
                new ConnectorContext("flow", "group", session.toString()))) {
            // opening is enough to create the file
        }

        assertEquals("[]", Files.readString(session.resolve("group").resolve("flow.json")));
    }

    @Test
    public void openSessionValidatesTheConfiguration() {
        ConnectorCatalogService service = new ConnectorCatalogService();
        ConnectorConfigException error = assertThrows(ConnectorConfigException.class, () ->
            service.openSession("file", Map.of("format", "pdf"), new ConnectorContext("f", "g", "out")));
        assertTrue(error.getMessage().contains("File format must be one of"));

        assertThrows(IllegalStateException.class, () ->
            service.openSession("missing", Map.of(), new ConnectorContext("f", "g", "out")));
    }
}
