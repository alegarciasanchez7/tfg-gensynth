package com.gensynth.plugins.rabbitmq;

import com.gensynth.plugin.api.ConnectorConfig;
import com.gensynth.plugin.api.ConnectorConfigException;
import com.gensynth.plugin.api.ConnectorField;
import com.gensynth.plugin.api.FieldType;
import org.junit.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

public class RabbitMqConnectorPluginTest {

    private final RabbitMqConnectorPlugin plugin = new RabbitMqConnectorPlugin();

    private static Map<String, Object> validConfig() {
        Map<String, Object> raw = new HashMap<>();
        raw.put("host", "broker");
        raw.put("username", "user");
        raw.put("password", "secret");
        raw.put("exchange", "sensors");
        raw.put("routingKey", "sensors.temperature");
        return raw;
    }

    @Test
    public void declaresItsIdentity() {
        assertEquals("rabbitmq", plugin.info().id());
        assertEquals("1.0.0", plugin.info().version());
        assertFalse(plugin.info().description().isBlank());
    }

    @Test
    public void declaresDocumentedFieldsInDisplayOrder() {
        List<ConnectorField> fields = plugin.fields();

        assertEquals(List.of("host", "port", "virtualHost", "username", "password", "exchange", "exchangeType",
            "exchangeDurable", "routingKey", "declareQueue"), fields.stream().map(ConnectorField::getKey).toList());
        assertTrue("every field explains itself", fields.stream().noneMatch(f -> f.getTooltip().isBlank()));
        assertEquals(FieldType.PASSWORD, fields.get(4).getType());
        assertEquals(List.of("host", "username", "password", "exchange"),
            fields.stream().filter(ConnectorField::isRequired).map(ConnectorField::getKey).toList());
    }

    @Test
    public void readsSettingsWithDefaults() {
        RabbitMqSettings settings = RabbitMqSettings.from(ConnectorConfig.resolve(plugin.fields(), validConfig()));

        assertEquals("broker", settings.host());
        assertEquals(5672, settings.port());
        assertEquals("/", settings.virtualHost());
        assertEquals("topic", settings.exchangeType());
        assertTrue(settings.exchangeDurable());
        assertEquals("sensors.temperature", settings.routingKey());
        assertEquals("", settings.queue());
    }

    @Test
    public void reportsMissingRequiredFields() {
        ConnectorConfigException error = assertThrows(ConnectorConfigException.class,
            () -> ConnectorConfig.resolve(plugin.fields(), Map.of()));

        // Username and password default to RabbitMQ's local guest/guest
        assertEquals(List.of("Exchange is required"), error.getErrors());
    }

    @Test
    public void credentialsDefaultToGuest() {
        RabbitMqSettings settings = RabbitMqSettings.from(ConnectorConfig.resolve(plugin.fields(),
            Map.of("exchange", "x", "routingKey", "k")));

        assertEquals("guest", settings.username());
        assertEquals("guest", settings.password());
    }

    @Test
    public void routingKeyIsRequiredOnlyForTopicAndDirectExchanges() {
        Map<String, Object> raw = validConfig();
        raw.remove("routingKey");

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
            () -> RabbitMqSettings.from(ConnectorConfig.resolve(plugin.fields(), raw)));
        assertTrue(error.getMessage().contains("Routing key is required"));

        raw.put("exchangeType", "fanout");
        assertEquals("", RabbitMqSettings.from(ConnectorConfig.resolve(plugin.fields(), raw)).routingKey());
    }

    @Test
    public void keepsCompatibilityWithSavedProjects() {
        // Projects saved with the previous plugin version use the same keys
        Map<String, Object> raw = validConfig();
        raw.put("declareQueue", "readings");
        raw.put("port", "5673");
        raw.put("bindQueue", true); // removed setting: ignored

        RabbitMqSettings settings = RabbitMqSettings.from(ConnectorConfig.resolve(plugin.fields(), raw));
        assertEquals("readings", settings.queue());
        assertEquals(5673, settings.port());
    }
}
