package com.gensynth.core.connectors.runtime;

import com.gensynth.plugin.api.ConnectorConfig;
import com.gensynth.plugin.api.ConnectorContext;
import com.gensynth.plugin.api.ConnectorField;
import com.gensynth.plugin.api.ConnectorInfo;
import com.gensynth.plugin.api.ConnectorPlugin;
import com.gensynth.plugin.api.ConnectorSession;
import com.gensynth.plugin.api.PluginApi;
import org.junit.Test;

import java.io.FileOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;

import static org.junit.Assert.*;

public class ConnectorPluginManagerTest {

    @Test
    public void duplicateRegistrationIsSkipped() {
        ConnectorPluginManager manager = new ConnectorPluginManager(Arrays.asList(
            new FakePlugin("test", "1.0.0"), new FakePlugin("test", "1.0.0")));

        assertEquals(1, manager.listDescriptors().size());
    }

    @Test
    public void findLatestDescriptorUsesTheHighestVersion() {
        ConnectorPluginManager manager = new ConnectorPluginManager(Arrays.asList(
            new FakePlugin("rabbitmq", "1.0.0"),
            new FakePlugin("rabbitmq", "1.10.0"),
            new FakePlugin("rabbitmq", "1.2.0")));

        Optional<ConnectorDescriptor> latest = manager.findLatestDescriptor("rabbitmq");
        assertTrue(latest.isPresent());
        assertEquals("1.10.0", latest.get().getPluginVersion());
        assertTrue(manager.findPlugin(latest.get()).isPresent());
        assertEquals(List.of("1.0.0", "1.2.0", "1.10.0"),
            manager.listDescriptors().stream().map(ConnectorDescriptor::getPluginVersion).toList());
    }

    @Test
    public void pluginsWithInvalidFieldsAreSkipped() {
        FakePlugin broken = new FakePlugin("broken", "1.0.0") {
            @Override
            public List<ConnectorField> fields() {
                return List.of(ConnectorField.text("a"), ConnectorField.text("a"));
            }
        };
        ConnectorPluginManager manager = new ConnectorPluginManager(List.of(broken, new FakePlugin("ok", "1.0.0")));

        assertEquals(List.of("ok"), manager.listDescriptors().stream().map(ConnectorDescriptor::getPluginId).toList());
    }

    @Test
    public void descriptorExposesFieldsInDeclarationOrder() {
        ConnectorDescriptor descriptor = new ConnectorPluginManager(List.of(new FakePlugin("x", "1.0.0")))
            .listDescriptors().get(0);

        assertEquals(PluginApi.VERSION, descriptor.getApiVersion());
        assertEquals(List.of("host", "port"), descriptor.getFields().stream().map(f -> f.get("key")).toList());
        assertEquals(true, descriptor.getFields().get(0).get("required"));
        assertEquals("Where to connect", descriptor.getFields().get(0).get("tooltip"));
        assertEquals(5672L, descriptor.getFields().get(1).get("defaultValue"));
    }

    @Test
    public void legacyPluginJarsAreDetected() throws Exception {
        Path dir = Files.createTempDirectory("gensynth-plugins-");
        Path legacy = jarWith(dir.resolve("legacy.jar"), ConnectorPluginManager.LEGACY_SERVICE_FILE);
        Path current = jarWith(dir.resolve("current.jar"), PluginApi.SERVICE_FILE);
        Path empty = jarWith(dir.resolve("empty.jar"), "README.txt");

        assertTrue(ConnectorPluginManager.checkApiCompatibility(legacy).contains("legacy plugin API"));
        assertNull(ConnectorPluginManager.checkApiCompatibility(current));
        assertTrue(ConnectorPluginManager.checkApiCompatibility(empty).contains("missing"));

        // Incompatible JARs in the plugins directory never break the startup
        ConnectorPluginManager manager = new ConnectorPluginManager(dir);
        assertTrue(manager.listDescriptors().stream().noneMatch(ConnectorDescriptor::isExternal));
    }

    private static Path jarWith(Path path, String entry) throws Exception {
        try (JarOutputStream jar = new JarOutputStream(new FileOutputStream(path.toFile()))) {
            jar.putNextEntry(new JarEntry(entry));
            jar.write("x\n".getBytes());
            jar.closeEntry();
        }
        return path;
    }

    private static class FakePlugin implements ConnectorPlugin {
        private final ConnectorInfo info;

        private FakePlugin(String id, String version) {
            this.info = new ConnectorInfo(id, "Fake " + id, version, "Fake connector");
        }

        @Override
        public ConnectorInfo info() {
            return info;
        }

        @Override
        public List<ConnectorField> fields() {
            return List.of(
                ConnectorField.text("host").required().tooltip("Where to connect"),
                ConnectorField.integer("port").defaultValue(5672));
        }

        @Override
        public ConnectorSession connect(ConnectorConfig config, ConnectorContext context) {
            return new ConnectorSession() {
                @Override
                public void send(byte[] payload, java.util.Map<String, String> headers) {
                }

                @Override
                public void close() {
                }
            };
        }
    }
}
