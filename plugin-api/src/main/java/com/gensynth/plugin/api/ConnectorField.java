package com.gensynth.plugin.api;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/**
 * One configuration field of a connector, shown in the flow configuration.
 *
 * Fields are immutable and built fluently; every method returns a new field:
 * <pre>{@code
 * ConnectorField.text("host").label("Host").tooltip("Broker host name or IP").required(),
 * ConnectorField.integer("port").defaultValue(5672).min(1).max(65535),
 * ConnectorField.password("password").required(),
 * ConnectorField.select("acks",
 *         ConnectorField.Option.of("all", "All replicas"),
 *         ConnectorField.Option.of("1", "Leader only")).defaultValue("all")
 * }</pre>
 *
 * The label defaults to the key in words ("virtualHost" becomes "Virtual host"). A select
 * without an explicit default uses its first option.
 */
public final class ConnectorField {

    /**
     * One choice of a {@link FieldType#SELECT} field.
     *
     * @param value value stored in the configuration
     * @param label text shown to the user
     */
    public record Option(String value, String label) {

        /**
         * Validates the option.
         */
        public Option {
            Objects.requireNonNull(value, "option value cannot be null");
            label = label == null || label.isBlank() ? value : label;
        }

        /**
         * @param value value stored in the configuration
         * @param label text shown to the user
         * @return the option
         */
        public static Option of(String value, String label) {
            return new Option(value, label);
        }
    }

    private final String key;
    private final FieldType type;
    private final String label;
    private final String tooltip;
    private final boolean required;
    private final Object defaultValue;
    private final String placeholder;
    private final Double min;
    private final Double max;
    private final List<Option> options;

    private ConnectorField(String key, FieldType type, String label, String tooltip, boolean required,
                           Object defaultValue, String placeholder, Double min, Double max, List<Option> options) {
        this.key = key;
        this.type = type;
        this.label = label;
        this.tooltip = tooltip;
        this.required = required;
        this.defaultValue = defaultValue;
        this.placeholder = placeholder;
        this.min = min;
        this.max = max;
        this.options = options;
    }

    private static ConnectorField create(String key, FieldType type, List<Option> options) {
        Objects.requireNonNull(key, "key cannot be null");
        if (!key.matches("[A-Za-z][A-Za-z0-9_.-]*")) {
            throw new IllegalArgumentException("Invalid field key '" + key + "': use letters, digits, '_', '.' or '-'");
        }
        return new ConnectorField(key, type, humanize(key), "", false, null, "", null, null, options);
    }

    // ── Factories ────────────────────────────────────────────────

    /** @param key configuration key @return a free text field */
    public static ConnectorField text(String key) {
        return create(key, FieldType.TEXT, List.of());
    }

    /** @param key configuration key @return a secret text field, masked in the UI */
    public static ConnectorField password(String key) {
        return create(key, FieldType.PASSWORD, List.of());
    }

    /** @param key configuration key @return a whole number field */
    public static ConnectorField integer(String key) {
        return create(key, FieldType.INTEGER, List.of());
    }

    /** @param key configuration key @return a decimal number field */
    public static ConnectorField decimal(String key) {
        return create(key, FieldType.DECIMAL, List.of());
    }

    /** @param key configuration key @return an on/off field (default false) */
    public static ConnectorField bool(String key) {
        return create(key, FieldType.BOOLEAN, List.of()).defaultValue(false);
    }

    /**
     * @param key     configuration key
     * @param options the allowed choices, in display order (at least one, unique values)
     * @return a field that accepts one of the options; defaults to the first one
     */
    public static ConnectorField select(String key, Option... options) {
        if (options == null || options.length == 0) {
            throw new IllegalArgumentException("Select field '" + key + "' needs at least one option");
        }
        Set<String> values = new HashSet<>();
        for (Option option : options) {
            if (!values.add(option.value())) {
                throw new IllegalArgumentException("Duplicated option '" + option.value() + "' in field '" + key + "'");
            }
        }
        ConnectorField field = create(key, FieldType.SELECT, List.copyOf(List.of(options)));
        return field.defaultValue(options[0].value());
    }

    /**
     * @param key    configuration key
     * @param values the allowed values, also used as labels
     * @return a field that accepts one of the values; defaults to the first one
     */
    public static ConnectorField select(String key, String... values) {
        Option[] options = new Option[values == null ? 0 : values.length];
        for (int i = 0; i < options.length; i++) {
            options[i] = Option.of(values[i], values[i]);
        }
        return select(key, options);
    }

    // ── Fluent modifiers ─────────────────────────────────────────

    /** @param text label shown next to the input @return a copy with the label */
    public ConnectorField label(String text) {
        return new ConnectorField(key, type, text == null || text.isBlank() ? humanize(key) : text, tooltip, required,
            defaultValue, placeholder, min, max, options);
    }

    /** @param text help shown when hovering the field's info icon @return a copy with the tooltip */
    public ConnectorField tooltip(String text) {
        return new ConnectorField(key, type, label, text == null ? "" : text, required, defaultValue, placeholder, min, max, options);
    }

    /** @return a copy that must have a non-empty value */
    public ConnectorField required() {
        return new ConnectorField(key, type, label, tooltip, true, defaultValue, placeholder, min, max, options);
    }

    /** @param text hint shown inside an empty input @return a copy with the placeholder */
    public ConnectorField placeholder(String text) {
        return new ConnectorField(key, type, label, tooltip, required, defaultValue, text == null ? "" : text, min, max, options);
    }

    /**
     * @param value value used when the user leaves the field empty; must match the field type
     * @return a copy with the default value
     */
    public ConnectorField defaultValue(Object value) {
        Object normalized = value == null ? null : normalizeDefault(value);
        checkRange(normalized, min, max);
        return new ConnectorField(key, type, label, tooltip, required, normalized, placeholder, min, max, options);
    }

    /** @param value smallest accepted number (INTEGER and DECIMAL only) @return a copy with the minimum */
    public ConnectorField min(double value) {
        requireNumeric("min");
        checkRange(defaultValue, value, max);
        return new ConnectorField(key, type, label, tooltip, required, defaultValue, placeholder, value, max, options);
    }

    /** @param value largest accepted number (INTEGER and DECIMAL only) @return a copy with the maximum */
    public ConnectorField max(double value) {
        requireNumeric("max");
        checkRange(defaultValue, min, value);
        return new ConnectorField(key, type, label, tooltip, required, defaultValue, placeholder, min, value, options);
    }

    // ── Getters ──────────────────────────────────────────────────

    /** @return configuration key */
    public String getKey() { return key; }

    /** @return field type */
    public FieldType getType() { return type; }

    /** @return label shown to the user */
    public String getLabel() { return label; }

    /** @return help text (empty if none) */
    public String getTooltip() { return tooltip; }

    /** @return whether a value is mandatory */
    public boolean isRequired() { return required; }

    /** @return default value (String, Long, Double or Boolean), or null */
    public Object getDefaultValue() { return defaultValue; }

    /** @return placeholder (empty if none) */
    public String getPlaceholder() { return placeholder; }

    /** @return minimum for numeric fields, or null */
    public Double getMin() { return min; }

    /** @return maximum for numeric fields, or null */
    public Double getMax() { return max; }

    /** @return options of a select field (empty for other types) */
    public List<Option> getOptions() { return options; }

    // ── Helpers ──────────────────────────────────────────────────

    private Object normalizeDefault(Object value) {
        switch (type) {
            case TEXT, PASSWORD -> {
                if (value instanceof String) return value;
            }
            case INTEGER -> {
                if (value instanceof Integer || value instanceof Long || value instanceof Short || value instanceof Byte) {
                    return ((Number) value).longValue();
                }
            }
            case DECIMAL -> {
                if (value instanceof Number number) return number.doubleValue();
            }
            case BOOLEAN -> {
                if (value instanceof Boolean) return value;
            }
            case SELECT -> {
                if (value instanceof String text && options.stream().anyMatch(option -> option.value().equals(text))) {
                    return value;
                }
                throw new IllegalArgumentException("Default of '" + key + "' must be one of its option values");
            }
        }
        throw new IllegalArgumentException("Default of '" + key + "' does not match its type " + type + ": " + value);
    }

    private void requireNumeric(String what) {
        if (type != FieldType.INTEGER && type != FieldType.DECIMAL) {
            throw new IllegalArgumentException(what + " only applies to INTEGER and DECIMAL fields ('" + key + "')");
        }
    }

    private void checkRange(Object value, Double minimum, Double maximum) {
        if (minimum != null && maximum != null && minimum > maximum) {
            throw new IllegalArgumentException("min is greater than max in field '" + key + "'");
        }
        if (value instanceof Number number) {
            double v = number.doubleValue();
            if ((minimum != null && v < minimum) || (maximum != null && v > maximum)) {
                throw new IllegalArgumentException("Default of '" + key + "' is out of its min/max range");
            }
        }
    }

    /** "virtualHost" becomes "Virtual host", "bootstrap_servers" becomes "Bootstrap servers". */
    static String humanize(String key) {
        String spaced = key.replaceAll("([a-z0-9])([A-Z])", "$1 $2").replaceAll("[_.-]+", " ").trim().toLowerCase(Locale.ROOT);
        return spaced.isEmpty() ? key : Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
    }

    @Override
    public String toString() {
        return "ConnectorField{" + key + ":" + type + (required ? ", required" : "") + "}";
    }

    /**
     * Checks that a list of fields has unique keys. Used by GenSynth when loading a plugin.
     *
     * @param fields the fields of a plugin
     * @return the same fields
     * @throws IllegalArgumentException on duplicated keys
     */
    public static List<ConnectorField> requireUniqueKeys(List<ConnectorField> fields) {
        Set<String> keys = new HashSet<>();
        for (ConnectorField field : new ArrayList<>(fields)) {
            if (!keys.add(field.getKey())) {
                throw new IllegalArgumentException("Duplicated field key: " + field.getKey());
            }
        }
        return fields;
    }
}
