package com.gensynth.core.connectors.rabbitmq;

import com.gensynth.core.connectors.spi.ConnectorPlugin;
import com.rabbitmq.client.AMQP;
import com.rabbitmq.client.Channel;
import com.rabbitmq.client.Connection;
import com.rabbitmq.client.ConnectionFactory;

import java.io.IOException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeoutException;

/**
 * RabbitMQ runtime plugin.
 */
public class RabbitMqConnectorPlugin implements ConnectorPlugin {

    private final Object lifecycleLock = new Object();

    private Connection connection;
    private Channel channel;

    private String host;
    private int port;
    private String username;
    private String password;
    private String virtualHost;
    private String exchange;
    private String exchangeType;
    private boolean exchangeDurable;
    private String declareQueue;
    private boolean bindQueue;
    private String defaultRoutingKey;

    private volatile boolean initialized;

    @Override
    public void initialize(Map<String, Object> config) {
        synchronized (lifecycleLock) {
            if (isHealthy()) {
                throw new IllegalStateException("Cannot reinitialize RabbitMQ connector while running. Stop it first.");
            }

            Map<String, Object> safeConfig = config == null ? Collections.emptyMap() : config;

            this.host = stringValue(safeConfig, "host", "localhost");
            this.port = intValue(safeConfig, "port", 5672);
            this.username = stringValue(safeConfig, "username", "guest");
            this.password = stringValue(safeConfig, "password", "guest");
            this.virtualHost = stringValue(safeConfig, "virtualHost", "/");
            this.exchange = stringValue(safeConfig, "exchange", "gensynth.exchange");
            this.exchangeType = stringValue(safeConfig, "exchangeType", "topic");
            this.exchangeDurable = booleanValue(safeConfig, "exchangeDurable", true);
            this.declareQueue = stringValue(safeConfig, "declareQueue", "");
            this.bindQueue = booleanValue(safeConfig, "bindQueue", true);
            this.defaultRoutingKey = stringValue(safeConfig, "routingKey", "gensynth.data");

            if (host.isBlank() || exchange.isBlank() || exchangeType.isBlank()) {
                throw new IllegalArgumentException("RabbitMQ config has blank required fields");
            }
            if (port <= 0 || port > 65535) {
                throw new IllegalArgumentException("RabbitMQ port must be between 1 and 65535");
            }

            this.initialized = true;
        }
    }

    @Override
    public void start() {
        synchronized (lifecycleLock) {
            ensureInitialized();
            if (isHealthy()) {
                return;
            }

            ConnectionFactory factory = new ConnectionFactory();
            factory.setHost(host);
            factory.setPort(port);
            factory.setUsername(username);
            factory.setPassword(password);
            factory.setVirtualHost(virtualHost);
            factory.setAutomaticRecoveryEnabled(true);
            factory.setTopologyRecoveryEnabled(true);
            factory.setNetworkRecoveryInterval(5_000);
            factory.setConnectionTimeout(10_000);
            factory.setHandshakeTimeout(10_000);
            factory.setRequestedHeartbeat(30);

            try {
                this.connection = factory.newConnection("gen-synth-rabbitmq-plugin");
                this.channel = connection.createChannel();
                channel.exchangeDeclare(exchange, exchangeType, exchangeDurable);
                
                if (declareQueue != null && !declareQueue.isBlank()) {
                    // Declare a durable, non-exclusive, non-autodelete queue
                    channel.queueDeclare(declareQueue, true, false, false, null);
                    if (bindQueue) {
                        channel.queueBind(declareQueue, exchange, defaultRoutingKey);
                    }
                }
            } catch (IOException | TimeoutException e) {
                closeQuietly(channel);
                closeQuietly(connection);
                channel = null;
                connection = null;
                throw new IllegalStateException("Failed to start RabbitMQ connector plugin", e);
            }
        }
    }

    @Override
    public void publish(String destination, byte[] payload, Map<String, String> headers) {
        synchronized (lifecycleLock) {
            ensureInitialized();
            if (!isHealthy()) {
                throw new IllegalStateException("RabbitMQ connector is not started");
            }
            Objects.requireNonNull(payload, "payload cannot be null");

            String routingKey = (destination == null || destination.isBlank())
                ? defaultRoutingKey
                : destination;

            try {
                if (headers == null || headers.isEmpty()) {
                    channel.basicPublish(exchange, routingKey, null, payload);
                } else {
                    AMQP.BasicProperties properties = new AMQP.BasicProperties.Builder()
                        .headers(new LinkedHashMap<>(headers))
                        .build();
                    channel.basicPublish(exchange, routingKey, properties, payload);
                }
            } catch (IOException e) {
                throw new IllegalStateException("Failed to publish message to RabbitMQ", e);
            }
        }
    }

    @Override
    public void stop() {
        synchronized (lifecycleLock) {
            closeQuietly(channel);
            closeQuietly(connection);
            channel = null;
            connection = null;
        }
    }

    @Override
    public boolean isHealthy() {
        synchronized (lifecycleLock) {
            return connection != null
                && connection.isOpen()
                && channel != null
                && channel.isOpen();
        }
    }

    private static void closeQuietly(Channel ch) {
        if (ch == null) {
            return;
        }
        try {
            ch.close();
        } catch (Exception ignored) {
            // Best-effort close
        }
    }

    private static void closeQuietly(Connection conn) {
        if (conn == null) {
            return;
        }
        try {
            conn.close();
        } catch (Exception ignored) {
            // Best-effort close
        }
    }

    private void ensureInitialized() {
        if (!initialized) {
            throw new IllegalStateException("RabbitMQ connector must be initialized first");
        }
    }

    private static String stringValue(Map<String, Object> config, String key, String defaultValue) {
        Object value = config.get(key);
        return value == null ? defaultValue : String.valueOf(value);
    }

    private static int intValue(Map<String, Object> config, String key, int defaultValue) {
        Object value = config.get(key);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid integer for key '" + key + "': " + value);
        }
    }

    private static boolean booleanValue(Map<String, Object> config, String key, boolean defaultValue) {
        Object value = config.get(key);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Boolean) {
            return (Boolean) value;
        }
        if (value instanceof String) {
            String normalized = ((String) value).trim().toLowerCase();
            if ("true".equals(normalized)) {
                return true;
            }
            if ("false".equals(normalized)) {
                return false;
            }
        }
        throw new IllegalArgumentException("Invalid boolean for key '" + key + "': " + value);
    }
}
