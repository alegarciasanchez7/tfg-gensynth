package com.gensynth.plugins.rabbitmq;

import com.gensynth.plugin.api.ConnectorConfig;

/**
 * Typed RabbitMQ connector settings, read from the validated configuration.
 *
 * @param host            broker host
 * @param port            broker port
 * @param virtualHost     virtual host
 * @param username        broker user
 * @param password        broker password
 * @param exchange        exchange to publish to
 * @param exchangeType    topic, direct, fanout or headers
 * @param exchangeDurable whether the exchange is durable
 * @param routingKey      routing key of every message (may be empty for fanout/headers)
 * @param queue           queue to declare and bind, or empty
 */
public record RabbitMqSettings(String host, int port, String virtualHost, String username, String password,
                               String exchange, String exchangeType, boolean exchangeDurable,
                               String routingKey, String queue) {

    /**
     * Reads the settings and checks the rules a single field cannot express.
     *
     * @param config validated connector configuration
     * @return the settings
     * @throws IllegalArgumentException if a topic or direct exchange has no routing key
     */
    public static RabbitMqSettings from(ConnectorConfig config) {
        RabbitMqSettings settings = new RabbitMqSettings(
            config.getString("host"),
            config.getInt("port", 5672),
            config.getString("virtualHost", "/"),
            config.getString("username"),
            config.getString("password"),
            config.getString("exchange"),
            config.getString("exchangeType", "topic"),
            config.getBoolean("exchangeDurable", true),
            config.getString("routingKey", "").trim(),
            config.getString("declareQueue", "").trim());

        boolean needsKey = settings.exchangeType().equals("topic") || settings.exchangeType().equals("direct");
        if (needsKey && settings.routingKey().isEmpty()) {
            throw new IllegalArgumentException("Routing key is required for a " + settings.exchangeType() + " exchange");
        }
        return settings;
    }
}
