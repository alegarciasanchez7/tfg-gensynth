package com.gensynth.core.config;

import org.junit.Before;
import org.junit.Test;
import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Map;

/**
 * Unit tests for ConfigLoaderImpl.
 */
public class ConfigLoaderImplTest {

    private ConfigLoader configLoader;
    private File testConfigDir;

    @Before
    public void setUp() throws IOException {
        configLoader = new ConfigLoaderImpl();
        testConfigDir = new File("src/test/resources/config");
        testConfigDir.mkdirs();
    }

    @Test
    public void testLoadYamlConfiguration() throws ConfigLoadException, IOException {
        // Create a test YAML file
        String yamlContent = "server:\n" +
                "  port: 8080\n" +
                "  host: localhost\n" +
                "brokers:\n" +
                "  mqtt:\n" +
                "    host: test.mosquitto.org\n" +
                "    port: 1883\n";

        File yamlFile = new File(testConfigDir, "test-config.yml");
        Files.write(yamlFile.toPath(), yamlContent.getBytes());

        try {
            Map<String, Object> config = configLoader.loadFromFile(yamlFile);

            assertNotNull(config);
            assertTrue(config.containsKey("server"));
            assertTrue(config.containsKey("brokers"));

            // Clean up
            Files.delete(yamlFile.toPath());
        } catch (Exception e) {
            // Ensure cleanup on failure
            if (yamlFile.exists()) {
                Files.delete(yamlFile.toPath());
            }
            throw e;
        }
    }

    @Test
    public void testLoadJsonConfiguration() throws ConfigLoadException, IOException {
        // Create a test JSON file
        String jsonContent = "{\n" +
                "  \"server\": {\n" +
                "    \"port\": 8080,\n" +
                "    \"host\": \"localhost\"\n" +
                "  },\n" +
                "  \"brokers\": {\n" +
                "    \"mqtt\": {\n" +
                "      \"host\": \"test.mosquitto.org\",\n" +
                "      \"port\": 1883\n" +
                "    }\n" +
                "  }\n" +
                "}\n";

        File jsonFile = new File(testConfigDir, "test-config.json");
        Files.write(jsonFile.toPath(), jsonContent.getBytes());

        try {
            Map<String, Object> config = configLoader.loadFromFile(jsonFile);

            assertNotNull(config);
            assertTrue(config.containsKey("server"));
            assertTrue(config.containsKey("brokers"));

            // Clean up
            Files.delete(jsonFile.toPath());
        } catch (Exception e) {
            // Ensure cleanup on failure
            if (jsonFile.exists()) {
                Files.delete(jsonFile.toPath());
            }
            throw e;
        }
    }

    @Test
    public void testLoadFromStream() throws ConfigLoadException {
        String yamlContent = "server:\n" +
                "  port: 8080\n" +
                "brokers:\n" +
                "  kafka:\n" +
                "    brokers: localhost:9092\n";

        ByteArrayInputStream stream = new ByteArrayInputStream(yamlContent.getBytes());
        Map<String, Object> config = configLoader.loadFromStream(stream, "yaml");

        assertNotNull(config);
        assertTrue(config.containsKey("server"));
    }

    @Test(expected = ConfigLoadException.class)
    public void testLoadNonExistentFile() throws ConfigLoadException {
        configLoader.loadFromFile("/non/existent/file.yml");
    }

    @Test(expected = ConfigLoadException.class)
    public void testLoadUnsupportedFormat() throws ConfigLoadException, IOException {
        File unsupportedFile = new File(testConfigDir, "test.txt");
        unsupportedFile.createNewFile();
        try {
            configLoader.loadFromFile(unsupportedFile);
        } finally {
            unsupportedFile.delete();
        }
    }

    @Test(expected = ConfigLoadException.class)
    public void testLoadFromNullStream() throws ConfigLoadException {
        configLoader.loadFromStream(null, "yaml");
    }

    @Test(expected = ConfigLoadException.class)
    public void testLoadFromStreamInvalidFormat() throws ConfigLoadException {
        String content = "some content";
        ByteArrayInputStream stream = new ByteArrayInputStream(content.getBytes());
        configLoader.loadFromStream(stream, "invalid");
    }

    @Test
    public void testGetValue() throws ConfigLoadException, ConfigKeyException {
        String yamlContent = "server:\n" +
                "  port: 8080\n" +
                "  host: localhost\n" +
                "brokers:\n" +
                "  mqtt:\n" +
                "    enabled: true\n";

        ByteArrayInputStream stream = new ByteArrayInputStream(yamlContent.getBytes());
        configLoader.loadFromStream(stream, "yaml");

        Object port = configLoader.getValue("server.port");
        assertEquals(8080, port);

        Object host = configLoader.getValue("server.host");
        assertEquals("localhost", host);

        Object enabled = configLoader.getValue("brokers.mqtt.enabled");
        assertEquals(true, enabled);
    }

    @Test
    public void testGetValueWithDefault() throws ConfigLoadException {
        String yamlContent = "server:\n" +
                "  port: 8080\n" +
                "brokers:\n" +
                "  kafka:\n" +
                "    brokers: localhost:9092\n";

        ByteArrayInputStream stream = new ByteArrayInputStream(yamlContent.getBytes());
        configLoader.loadFromStream(stream, "yaml");

        Object nonExistent = configLoader.getValue("non.existent.key", "default_value");
        assertEquals("default_value", nonExistent);
    }

    @Test(expected = ConfigKeyException.class)
    public void testGetValueKeyNotFound() throws ConfigLoadException, ConfigKeyException {
        String yamlContent = "server:\n" +
                "  port: 8080\n" +
                "brokers:\n" +
                "  kafka:\n" +
                "    brokers: localhost:9092\n";

        ByteArrayInputStream stream = new ByteArrayInputStream(yamlContent.getBytes());
        configLoader.loadFromStream(stream, "yaml");

        configLoader.getValue("non.existent.key");
    }

    @Test
    public void testValidateValidConfiguration() throws ConfigLoadException, ConfigValidationException {
        String yamlContent = "server:\n" +
                "  port: 8080\n" +
                "brokers:\n" +
                "  mqtt:\n" +
                "    host: localhost\n";

        ByteArrayInputStream stream = new ByteArrayInputStream(yamlContent.getBytes());
        Map<String, Object> config = configLoader.loadFromStream(stream, "yaml");

        assertTrue(configLoader.validate(config));
    }

    @Test(expected = ConfigValidationException.class)
    public void testValidateNullConfiguration() throws ConfigValidationException {
        configLoader.validate(null);
    }

    @Test(expected = ConfigValidationException.class)
    public void testValidateMissingRequiredKeys() throws ConfigValidationException {
        java.util.Map<String, Object> incompleteConfig = new java.util.HashMap<>();
        incompleteConfig.put("server", new java.util.HashMap<>());
        // Missing 'brokers' key

        configLoader.validate(incompleteConfig);
    }

    @Test(expected = ConfigValidationException.class)
    public void testValidateEmptyBrokers() throws ConfigValidationException {
        java.util.Map<String, Object> config = new java.util.HashMap<>();
        config.put("server", new java.util.HashMap<>());
        config.put("brokers", new java.util.HashMap<>());

        configLoader.validate(config);
    }

    @Test(expected = ConfigKeyException.class)
    public void testGetValueEmptyKeyPath() throws ConfigLoadException, ConfigKeyException {
        String yamlContent = "server:\n  port: 8080\nbrokers:\n  kafka:\n    brokers: localhost:9092\n";
        ByteArrayInputStream stream = new ByteArrayInputStream(yamlContent.getBytes());
        configLoader.loadFromStream(stream, "yaml");

        configLoader.getValue("");
    }

}
