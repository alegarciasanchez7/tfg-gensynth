package com.gensynth.plugins.rabbitmq;

import com.gensynth.plugin.api.ConnectorConfig;

/**
 * Typed RabbitMQ connector settings, read from the validated configuration.
 * <p>
 * By default the messages go straight to the queue, through RabbitMQ's default exchange. When
 * an exchange is set (an advanced option), the messages go to that exchange and the queue is
 * bound to it with the routing key, or with the queue name when the routing key is empty.
 *
 * @param host            broker host
 * @param port            broker port
 * @param virtualHost     virtual host
 * @param username        broker user
 * @param password        broker password
 * @param exchange        exchange to publish to, or empty to publish straight to the queue
 * @param exchangeType    topic, direct, fanout or headers (only used with an exchange)
 * @param exchangeDurable whether the exchange is durable (only used with an exchange)
 * @param routingKey      routing key of every message, or empty to use the queue name
 * @param queue           queue that receives the messages; it is declared durable
 */
public record RabbitMqSettings(String host, int port, String virtualHost, String username, String password,
                               String exchange, String exchangeType, boolean exchangeDurable,
                               String routingKey, String queue) {

    /**
     * Reads the settings from a configuration already checked against the plugin fields.
     *
     * @param config validated connector configuration
     * @return the settings
     */
    public static RabbitMqSettings from(ConnectorConfig config) {
        return new RabbitMqSettings(
            config.getString("host"),
            config.getInt("port", 5672),
            config.getString("virtualHost", "/"),
            config.getString("username"),
            config.getString("password"),
            config.getString("exchange", "").trim(),
            config.getString("exchangeType", "topic"),
            config.getBoolean("exchangeDurable", true),
            config.getString("routingKey", "").trim(),
            config.getString("declareQueue", "").trim());
    }

    /**
     * @return whether the messages go through an exchange of the user (otherwise they go
     *         straight to the queue through the default exchange, which is never declared)
     */
    public boolean usesExchange() {
        return !exchange.isEmpty();
    }

    /**
     * @return routing key of every message: the queue name without an exchange (that is how
     *         the default exchange delivers to a queue), otherwise the routing key, or the queue
     *         name when it is empty
     */
    public String publishRoutingKey() {
        return !usesExchange() || routingKey.isEmpty() ? queue : routingKey;
    }
}
