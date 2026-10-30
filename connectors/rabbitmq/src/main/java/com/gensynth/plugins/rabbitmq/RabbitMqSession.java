package com.gensynth.plugins.rabbitmq;

import com.gensynth.plugin.api.ConnectorSession;
import com.rabbitmq.client.AMQP;
import com.rabbitmq.client.Channel;
import com.rabbitmq.client.Connection;
import com.rabbitmq.client.ConnectionFactory;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeoutException;

/**
 * One RabbitMQ connection and channel for a flow, with publisher confirms enabled.
 */
final class RabbitMqSession implements ConnectorSession {

    /** Longest wait for the broker to confirm a message. */
    private static final long CONFIRM_TIMEOUT_MS = 5_000;

    private final Connection connection;
    private final Channel channel;
    private final RabbitMqSettings settings;
    /** Set by the return listener when the broker could not route the last message. */
    private volatile String returnedReason;

    private RabbitMqSession(Connection connection, Channel channel, RabbitMqSettings settings) {
        this.connection = connection;
        this.channel = channel;
        this.settings = settings;
        channel.addReturnListener(returned -> returnedReason = returned.getReplyText());
    }

    /**
     * Connects, declares the exchange (and the queue, if any) and enables publisher confirms.
     */
    static RabbitMqSession open(ConnectionFactory factory, RabbitMqSettings settings, String connectionName)
            throws IOException, TimeoutException {
        Connection connection = factory.newConnection(connectionName);
        try {
            Channel channel = connection.createChannel();
            channel.exchangeDeclare(settings.exchange(), settings.exchangeType(), settings.exchangeDurable());
            if (!settings.queue().isEmpty()) {
                channel.queueDeclare(settings.queue(), true, false, false, null);
                channel.queueBind(settings.queue(), settings.exchange(), settings.routingKey());
            }
            channel.confirmSelect();
            return new RabbitMqSession(connection, channel, settings);
        } catch (IOException | RuntimeException e) {
            connection.abort();
            throw e;
        }
    }

    @Override
    public void send(byte[] payload, Map<String, String> headers) throws Exception {
        AMQP.BasicProperties.Builder properties = new AMQP.BasicProperties.Builder().deliveryMode(2);
        if (headers != null && !headers.isEmpty()) {
            properties.contentType(headers.get("content-type")).headers(new LinkedHashMap<>(headers));
        }

        returnedReason = null;
        // mandatory = true: the broker returns the message if no queue receives it
        channel.basicPublish(settings.exchange(), settings.routingKey(), true, properties.build(), payload);
        if (!channel.waitForConfirms(CONFIRM_TIMEOUT_MS)) {
            throw new IOException("The broker rejected the message (nack)");
        }
        String reason = returnedReason;
        if (reason != null) {
            throw new IOException("Message not routed to any queue (" + reason + "): no queue is bound to exchange '"
                + settings.exchange() + "' with routing key '" + settings.routingKey() + "'");
        }
    }

    @Override
    public boolean isHealthy() {
        return channel.isOpen();
    }

    @Override
    public void close() {
        // Abort never throws and does not wait for the broker
        if (channel.isOpen()) {
            try {
                channel.close();
            } catch (Exception ignored) {
                // Closed by the connection below anyway
            }
        }
        connection.abort();
    }
}
