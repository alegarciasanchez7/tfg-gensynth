package com.gensynth.plugin.api;

/**
 * Type of a connector configuration field. It decides the input shown to the user and the
 * Java type returned by {@link ConnectorConfig}.
 */
public enum FieldType {
    /** Free text. Read with {@link ConnectorConfig#getString}. */
    TEXT,
    /** Secret text, masked in the UI. Read with {@link ConnectorConfig#getString}. */
    PASSWORD,
    /** Whole number. Read with {@link ConnectorConfig#getInt} or {@link ConnectorConfig#getLong}. */
    INTEGER,
    /** Decimal number. Read with {@link ConnectorConfig#getDouble}. */
    DECIMAL,
    /** On/off switch. Read with {@link ConnectorConfig#getBoolean}. */
    BOOLEAN,
    /** One value from a fixed list of options. Read with {@link ConnectorConfig#getString}. */
    SELECT
}
