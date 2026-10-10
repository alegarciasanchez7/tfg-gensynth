package com.gensynth.plugin.api;

import org.junit.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

public class ConnectorConfigTest {

    private static final List<ConnectorField> FIELDS = List.of(
        ConnectorField.text("host").label("Host").required(),
        ConnectorField.integer("port").defaultValue(5672).min(1).max(65535),
        ConnectorField.password("password"),
        ConnectorField.bool("durable").defaultValue(true),
        ConnectorField.decimal("ratio"),
        ConnectorField.select("mode", "fast", "safe")
    );

    private static Map<String, Object> raw(Object... keyValues) {
        Map<String, Object> map = new HashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            map.put((String) keyValues[i], keyValues[i + 1]);
        }
        return map;
    }

    @Test
    public void appliesDefaultsAndLeavesOptionalFieldsAbsent() {
        ConnectorConfig config = ConnectorConfig.resolve(FIELDS, raw("host", "broker"));

        assertEquals("broker", config.getString("host"));
        assertEquals(5672, config.getInt("port", 0));
        assertTrue(config.getBoolean("durable", false));
        assertEquals("fast", config.getString("mode"));
        assertFalse(config.has("password"));
        assertNull(config.getString("password"));
        assertEquals("fallback", config.getString("password", "fallback"));
    }

    @Test
    public void convertsTextValuesToTheFieldType() {
        ConnectorConfig config = ConnectorConfig.resolve(FIELDS,
            raw("host", "h", "port", "1234", "durable", "false", "ratio", "0.25", "mode", "safe"));

        assertEquals(1234L, config.getLong("port", 0));
        assertFalse(config.getBoolean("durable", true));
        assertEquals(0.25, config.getDouble("ratio", 0), 0.0);
        assertEquals("safe", config.getString("mode"));
    }

    @Test
    public void blankValuesFallBackToTheDefault() {
        ConnectorConfig config = ConnectorConfig.resolve(FIELDS, raw("host", "h", "port", "  "));
        assertEquals(5672, config.getInt("port", 0));
    }

    @Test
    public void reportsEveryInvalidFieldAtOnce() {
        ConnectorConfigException error = assertThrows(ConnectorConfigException.class, () ->
            ConnectorConfig.resolve(FIELDS, raw("host", " ", "port", 70000, "durable", "maybe", "ratio", "x", "mode", "slow")));

        assertEquals(List.of(
            "Host is required",
            "Port must be at most 65535",
            "Durable must be true or false",
            "Ratio must be a number",
            "Mode must be one of: fast, safe"
        ), error.getErrors());
    }

    @Test
    public void rejectsFractionsInWholeNumbers() {
        ConnectorConfigException error = assertThrows(ConnectorConfigException.class, () ->
            ConnectorConfig.resolve(FIELDS, raw("host", "h", "port", 1.5)));
        assertEquals(List.of("Port must be a whole number"), error.getErrors());
    }

    @Test
    public void ignoresUnknownKeysAndNullInput() {
        ConnectorConfig config = ConnectorConfig.resolve(FIELDS, raw("host", "h", "legacyKey", "x"));
        assertFalse(config.has("legacyKey"));

        assertThrows(ConnectorConfigException.class, () -> ConnectorConfig.resolve(FIELDS, null));
    }
}
