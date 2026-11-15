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
        raw.put("declareQueue", "readings");
        return raw;
    }

    private RabbitMqSettings settings(Map<String, Object> raw) {
        return RabbitMqSettings.from(ConnectorConfig.resolve(plugin.fields(), raw));
    }

    @Test
    public void declaresItsIdentity() {
        assertEquals("rabbitmq", plugin.info().id());
        assertEquals("1.0.0", plugin.info().version());
        assertFalse(plugin.info().description().isBlank());
    }

    @Test
    public void showsTheEssentialFieldsFirstAndTheExchangeOptionsAsAdvanced() {
        List<ConnectorField> fields = plugin.fields();

        assertEquals(List.of("host", "port", "username", "password", "declareQueue", "virtualHost", "exchange",
            "exchangeType", "exchangeDurable", "routingKey"), fields.stream().map(ConnectorField::getKey).toList());
        assertTrue("every field explains itself", fields.stream().noneMatch(f -> f.getTooltip().isBlank()));
        assertEquals(FieldType.PASSWORD, fields.get(3).getType());
        assertEquals(List.of("host", "username", "password", "declareQueue"),
            fields.stream().filter(ConnectorField::isRequired).map(ConnectorField::getKey).toList());
        assertEquals(List.of("virtualHost", "exchange", "exchangeType", "exchangeDurable", "routingKey"),
            fields.stream().filter(ConnectorField::isAdvanced).map(ConnectorField::getKey).toList());
        assertTrue("no advanced field is required", fields.stream().noneMatch(f -> f.isAdvanced() && f.isRequired()));
    }

    @Test
    public void sendsStraightToTheQueueByDefault() {
        RabbitMqSettings settings = settings(validConfig());

        assertEquals("broker", settings.host());
        assertEquals(5672, settings.port());
        assertEquals("/", settings.virtualHost());
        assertEquals("readings", settings.queue());
        assertFalse(settings.usesExchange());
        assertEquals("The default exchange", "", settings.exchange());
        assertEquals("The default exchange delivers by queue name", "readings", settings.publishRoutingKey());
    }

    @Test
    public void onlyTheQueueIsNeededOnALocalBroker() {
        ConnectorConfigException error = assertThrows(ConnectorConfigException.class,
            () -> ConnectorConfig.resolve(plugin.fields(), Map.of()));

        // Host, username and password default to a local RabbitMQ (localhost, guest/guest)
        assertEquals(List.of("Queue is required"), error.getErrors());

        RabbitMqSettings settings = settings(Map.of("declareQueue", "q"));
        assertEquals("localhost", settings.host());
        assertEquals("guest", settings.username());
        assertEquals("guest", settings.password());
    }

    @Test
    public void anExchangeUsesTheRoutingKeyOrElseTheQueueName() {
        Map<String, Object> raw = validConfig();
        raw.put("exchange", "sensors");

        RabbitMqSettings withoutKey = settings(raw);
        assertTrue(withoutKey.usesExchange());
        assertEquals("topic", withoutKey.exchangeType());
        assertTrue(withoutKey.exchangeDurable());
        assertEquals("An empty routing key is no longer an error", "readings", withoutKey.publishRoutingKey());

        raw.put("routingKey", "sensors.temperature");
        assertEquals("sensors.temperature", settings(raw).publishRoutingKey());

        raw.put("exchangeType", "fanout");
        assertEquals("fanout", settings(raw).exchangeType());
    }

    @Test
    public void keepsCompatibilityWithSavedProjects() {
        // Projects saved with earlier versions store every key explicitly, with an exchange
        Map<String, Object> raw = validConfig();
        raw.put("exchange", "gensynth.exchange");
        raw.put("exchangeType", "topic");
        raw.put("routingKey", "gensynth.data");
        raw.put("port", "5673");
        raw.put("bindQueue", true); // removed setting: ignored

        RabbitMqSettings settings = settings(raw);
        assertEquals("readings", settings.queue());
        assertEquals(5673, settings.port());
        assertEquals("gensynth.exchange", settings.exchange());
        assertEquals("gensynth.data", settings.publishRoutingKey());

        // Before 0.6.0 the queue was optional: such a project now asks for one
        raw.put("declareQueue", "");
        ConnectorConfigException error = assertThrows(ConnectorConfigException.class,
            () -> ConnectorConfig.resolve(plugin.fields(), raw));
        assertEquals(List.of("Queue is required"), error.getErrors());
    }
}
