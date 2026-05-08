package com.gensynth.core.connectors.rabbitmq;

import com.gensynth.core.connectors.spi.ConnectorPlugin;
import com.gensynth.core.connectors.spi.ConnectorPluginDescriptor;
import com.gensynth.core.connectors.spi.ConnectorPluginProvider;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ServiceLoader provider for RabbitMQ connector plugin.
 */
public class RabbitMqConnectorPluginProvider implements ConnectorPluginProvider {

    private static final ConnectorPluginDescriptor DESCRIPTOR = new ConnectorPluginDescriptor(
        "rabbitmq",
        "RabbitMQ Connector",
        "1.0.0",
        "1.x",
        buildConfigSchema()
    );

    @Override
    public ConnectorPluginDescriptor descriptor() {
        return DESCRIPTOR;
    }

    @Override
    public ConnectorPlugin create() {
        return new RabbitMqConnectorPlugin();
    }

    private static Map<String, Object> buildConfigSchema() {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("required", Arrays.asList(
            "host", "port", "username", "password", "virtualHost", "exchange", "exchangeType", "routingKey"
        ));
        schema.put("properties", buildProperties());
        return schema;
    }

    private static Map<String, Object> buildProperties() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("host", stringField("Host", "localhost", "RabbitMQ host name or IP"));
        properties.put("port", numberField("Port", 5672, "RabbitMQ TCP port"));
        properties.put("username", stringField("Username", "guest", "Broker username"));
        properties.put("password", passwordField("Password", "guest", "Broker password"));
        properties.put("virtualHost", stringField("Virtual host", "/", "RabbitMQ virtual host"));
        properties.put("exchange", stringField("Exchange", "gensynth.exchange", "Exchange to publish to"));
        properties.put("exchangeType", enumField("Exchange type", "topic", Arrays.asList("direct", "topic", "fanout", "headers")));
        properties.put("exchangeDurable", booleanField("Durable exchange", true, "Declare exchange as durable"));
        properties.put("declareQueue", stringField("Auto-declare Queue", "", "Optional: Queue name to create automatically. Leave empty to disable."));
        properties.put("bindQueue", booleanField("Auto-bind Queue", true, "Automatically bind the declared queue to the exchange using the routing key"));
        properties.put("routingKey", stringField("Routing key", "gensynth.data", "Default routing key when destination is not provided"));
        return properties;
    }

    private static Map<String, Object> stringField(String title, String defaultValue, String description) {
        Map<String, Object> field = new LinkedHashMap<>();
        field.put("type", "string");
        field.put("title", title);
        field.put("default", defaultValue);
        field.put("description", description);
        return field;
    }

    private static Map<String, Object> passwordField(String title, String defaultValue, String description) {
        Map<String, Object> field = stringField(title, defaultValue, description);
        field.put("format", "password");
        return field;
    }

    private static Map<String, Object> numberField(String title, Number defaultValue, String description) {
        Map<String, Object> field = new LinkedHashMap<>();
        field.put("type", "integer");
        field.put("title", title);
        field.put("default", defaultValue);
        field.put("description", description);
        return field;
    }

    private static Map<String, Object> booleanField(String title, boolean defaultValue, String description) {
        Map<String, Object> field = new LinkedHashMap<>();
        field.put("type", "boolean");
        field.put("title", title);
        field.put("default", defaultValue);
        field.put("description", description);
        return field;
    }

    private static Map<String, Object> enumField(String title, String defaultValue, List<String> values) {
        Map<String, Object> field = new LinkedHashMap<>();
        field.put("type", "string");
        field.put("title", title);
        field.put("default", defaultValue);
        field.put("enum", values);
        return field;
    }
}
