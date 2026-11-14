package com.gensynth.plugin.api;

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.*;

public class ConnectorFieldTest {

    @Test
    public void buildsFieldsFluentlyWithoutMutatingTheOriginal() {
        ConnectorField base = ConnectorField.text("host");
        ConnectorField host = base.label("Host").tooltip("Broker host").placeholder("localhost").required();

        assertEquals("host", host.getKey());
        assertEquals(FieldType.TEXT, host.getType());
        assertEquals("Host", host.getLabel());
        assertEquals("Broker host", host.getTooltip());
        assertEquals("localhost", host.getPlaceholder());
        assertTrue(host.isRequired());
        assertFalse("modifiers return copies", base.isRequired());
    }

    @Test
    public void labelDefaultsToTheKeyInWords() {
        assertEquals("Virtual host", ConnectorField.text("virtualHost").getLabel());
        assertEquals("Bootstrap servers", ConnectorField.text("bootstrap_servers").getLabel());
        assertEquals("Port", ConnectorField.integer("port").getLabel());
    }

    @Test
    public void defaultsAreNormalizedAndTypeChecked() {
        assertEquals(5672L, ConnectorField.integer("port").defaultValue(5672).getDefaultValue());
        assertEquals(0.5, ConnectorField.decimal("ratio").defaultValue(0.5f).getDefaultValue());
        assertEquals(false, ConnectorField.bool("durable").getDefaultValue());

        ConnectorField integer = ConnectorField.integer("port");
        ConnectorField text = ConnectorField.text("host");
        ConnectorField bool = ConnectorField.bool("on");
        assertThrows(IllegalArgumentException.class, () -> integer.defaultValue("5672"));
        assertThrows(IllegalArgumentException.class, () -> integer.defaultValue(1.5));
        assertThrows(IllegalArgumentException.class, () -> text.defaultValue(1));
        assertThrows(IllegalArgumentException.class, () -> bool.defaultValue("true"));
    }

    @Test
    public void selectNeedsOptionsAndDefaultsToTheFirst() {
        ConnectorField acks = ConnectorField.select("acks",
            ConnectorField.Option.of("all", "All replicas"), ConnectorField.Option.of("1", "Leader only"));
        assertEquals("all", acks.getDefaultValue());
        assertEquals("All replicas", acks.getOptions().get(0).label());
        assertEquals("1", acks.defaultValue("1").getDefaultValue());
        assertEquals("json", ConnectorField.select("format", "json", "csv").getOptions().get(0).label());

        assertThrows(IllegalArgumentException.class, () -> ConnectorField.select("empty", new ConnectorField.Option[0]));
        assertThrows(IllegalArgumentException.class, () -> ConnectorField.select("dup", "a", "a"));
        assertThrows(IllegalArgumentException.class, () -> acks.defaultValue("2"));
    }

    @Test
    public void rangesOnlyApplyToNumbersAndMustContainTheDefault() {
        ConnectorField port = ConnectorField.integer("port").min(1).max(65535).defaultValue(5672);
        assertEquals(1.0, port.getMin(), 0.0);
        assertEquals(65535.0, port.getMax(), 0.0);

        ConnectorField text = ConnectorField.text("host");
        ConnectorField fromTen = ConnectorField.integer("n").min(10);
        assertThrows(IllegalArgumentException.class, () -> text.min(1));
        assertThrows(IllegalArgumentException.class, () -> fromTen.max(1));
        assertThrows(IllegalArgumentException.class, () -> port.defaultValue(0));
    }

    @Test
    public void rejectsInvalidKeysAndDuplicatedKeys() {
        assertThrows(IllegalArgumentException.class, () -> ConnectorField.text("1host"));
        assertThrows(IllegalArgumentException.class, () -> ConnectorField.text("my host"));
        List<ConnectorField> duplicated = List.of(ConnectorField.text("a"), ConnectorField.integer("a"));
        assertThrows(IllegalArgumentException.class, () -> ConnectorField.requireUniqueKeys(duplicated));
    }

    @Test
    public void connectorInfoValidatesItsIdentity() {
        ConnectorInfo info = new ConnectorInfo("rabbitmq", "RabbitMQ", "1.0.0", null);
        assertEquals("", info.description());

        assertThrows(IllegalArgumentException.class, () -> new ConnectorInfo("Rabbit MQ", "RabbitMQ", "1", ""));
        assertThrows(IllegalArgumentException.class, () -> new ConnectorInfo("rabbitmq", " ", "1", ""));
    }
}
