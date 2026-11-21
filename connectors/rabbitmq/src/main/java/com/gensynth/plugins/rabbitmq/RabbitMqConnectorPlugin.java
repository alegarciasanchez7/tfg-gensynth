package com.gensynth.plugins.rabbitmq;

import com.gensynth.plugin.api.ConnectorConfig;
import com.gensynth.plugin.api.ConnectorContext;
import com.gensynth.plugin.api.ConnectorField;
import com.gensynth.plugin.api.ConnectorField.Option;
import com.gensynth.plugin.api.ConnectorInfo;
import com.gensynth.plugin.api.ConnectorPlugin;
import com.gensynth.plugin.api.ConnectorSession;
import com.rabbitmq.client.ConnectionFactory;

import java.util.List;

/**
 * Publishes the messages of a flow to a RabbitMQ queue: straight to it by default, or through
 * an exchange with a routing key (advanced options).
 *
 * Every message waits for the broker's publisher confirm, and is published as mandatory, so a
 * message that no queue receives (wrong exchange or routing key) counts as failed instead of
 * being silently dropped.
 */
public class RabbitMqConnectorPlugin implements ConnectorPlugin {

    private static final ConnectorInfo INFO = new ConnectorInfo(
        "rabbitmq",
        "RabbitMQ",
        "1.0.0",
        "Publishes each message to a RabbitMQ queue (optionally through an exchange), waiting for the broker confirmation.");

    // Essential settings first; the exchange options are in the collapsed "Advanced options"
    private static final List<ConnectorField> FIELDS = List.of(
        ConnectorField.text("host")
            .label("Host")
            .defaultValue("localhost")
            .required()
            .tooltip("Host name or IP address of the RabbitMQ broker."),
        ConnectorField.integer("port")
            .label("Port")
            .defaultValue(5672)
            .min(1).max(65535)
            .tooltip("AMQP port of the broker. 5672 by default (5671 is usually TLS, not supported here)."),
        ConnectorField.text("username")
            .label("Username")
            .defaultValue("guest")
            .required()
            .tooltip("Broker user. Note: the default 'guest' user can only connect from localhost."),
        ConnectorField.password("password")
            .label("Password")
            .defaultValue("guest")
            .required()
            .tooltip("Password of the broker user. 'guest' is the default of a local RabbitMQ."),
        // Key kept from earlier versions so saved projects keep their queue
        ConnectorField.text("declareQueue")
            .label("Queue")
            .required()
            .placeholder("gensynth.messages")
            .tooltip("Queue that receives the messages. It is created (durable) if it does not exist."),
        ConnectorField.text("virtualHost")
            .label("Virtual host")
            .defaultValue("/")
            .advanced()
            .tooltip("Virtual host to connect to. Use / unless your broker separates environments with vhosts."),
        ConnectorField.text("exchange")
            .label("Exchange")
            .placeholder("Empty: send straight to the queue")
            .advanced()
            .tooltip("Optional. Exchange that receives the messages instead of the queue; it is created if it does "
                + "not exist and the queue is bound to it. Leave it empty to send straight to the queue."),
        ConnectorField.select("exchangeType",
                Option.of("topic", "topic: routing key patterns (*, #)"),
                Option.of("direct", "direct: exact routing key"),
                Option.of("fanout", "fanout: every bound queue, key ignored"),
                Option.of("headers", "headers: match on message headers"))
            .label("Exchange type")
            .advanced()
            .tooltip("How the exchange routes messages to queues. Only used with an exchange; must match the type "
                + "of an existing exchange."),
        ConnectorField.bool("exchangeDurable")
            .label("Durable exchange")
            .defaultValue(true)
            .advanced()
            .tooltip("Declare the exchange as durable so it survives a broker restart. Only used with an exchange; "
                + "must match an existing exchange."),
        ConnectorField.text("routingKey")
            .label("Routing key")
            .placeholder("Empty: the queue name")
            .advanced()
            .tooltip("Routing key of every message sent to the exchange, also used to bind the queue. "
                + "Empty uses the queue name. Ignored without an exchange.")
    );

    @Override
    public ConnectorInfo info() {
        return INFO;
    }

    @Override
    public List<ConnectorField> fields() {
        return FIELDS;
    }

    @Override
    public ConnectorSession connect(ConnectorConfig config, ConnectorContext context) throws Exception {
        RabbitMqSettings settings = RabbitMqSettings.from(config);

        ConnectionFactory factory = new ConnectionFactory();
        factory.setHost(settings.host());
        factory.setPort(settings.port());
        factory.setVirtualHost(settings.virtualHost());
        factory.setUsername(settings.username());
        factory.setPassword(settings.password());
        factory.setConnectionTimeout(10_000);
        factory.setHandshakeTimeout(10_000);
        factory.setRequestedHeartbeat(30);
        factory.setAutomaticRecoveryEnabled(true);

        return RabbitMqSession.open(factory, settings, "gensynth-" + context.flowName());
    }
}
