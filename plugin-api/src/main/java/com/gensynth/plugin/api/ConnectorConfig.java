package com.gensynth.plugin.api;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Validated configuration of a connector, as received by {@link ConnectorPlugin#connect}.
 *
 * GenSynth builds it with {@link #resolve(List, Map)}: defaults are applied, values are converted
 * to the field type and every rule (required, options, min/max) is checked, so a plugin can read
 * its values without validating them again. Optional fields without a value are absent.
 */
public final class ConnectorConfig {

    private final Map<String, Object> values;

    private ConnectorConfig(Map<String, Object> values) {
        this.values = Collections.unmodifiableMap(values);
    }

    /**
     * Validates raw values (e.g. from the flow configuration) against the plugin fields.
     * Keys that are not declared as fields are ignored. Plugins can use it in their tests.
     *
     * @param fields the plugin fields
     * @param raw    raw values by key; may be null
     * @return the validated configuration
     * @throws ConnectorConfigException listing every invalid field
     */
    public static ConnectorConfig resolve(List<ConnectorField> fields, Map<String, ?> raw) {
        Map<String, ?> input = raw == null ? Map.of() : raw;
        Map<String, Object> values = new LinkedHashMap<>();
        List<String> errors = new ArrayList<>();

        for (ConnectorField field : fields) {
            Object value = input.get(field.getKey());
            if (isEmpty(value)) {
                value = field.getDefaultValue();
            }
            if (isEmpty(value)) {
                if (field.isRequired()) {
                    errors.add(field.getLabel() + " is required");
                }
                continue;
            }
            try {
                values.put(field.getKey(), convert(field, value));
            } catch (IllegalArgumentException e) {
                errors.add(e.getMessage());
            }
        }

        if (!errors.isEmpty()) {
            throw new ConnectorConfigException(errors);
        }
        return new ConnectorConfig(values);
    }

    private static boolean isEmpty(Object value) {
        return value == null || (value instanceof String text && text.isBlank());
    }

    private static Object convert(ConnectorField field, Object value) {
        String label = field.getLabel();
        return switch (field.getType()) {
            case TEXT, PASSWORD -> String.valueOf(value);
            case BOOLEAN -> {
                if (value instanceof Boolean bool) yield bool;
                String text = String.valueOf(value).trim();
                if (text.equalsIgnoreCase("true") || text.equalsIgnoreCase("false")) yield Boolean.parseBoolean(text);
                throw new IllegalArgumentException(label + " must be true or false");
            }
            case INTEGER -> {
                long number;
                try {
                    double parsed = value instanceof Number n ? n.doubleValue() : Double.parseDouble(String.valueOf(value).trim());
                    if (parsed != Math.rint(parsed) || Double.isInfinite(parsed)) throw new NumberFormatException();
                    number = (long) parsed;
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException(label + " must be a whole number");
                }
                checkRange(field, number);
                yield number;
            }
            case DECIMAL -> {
                double number;
                try {
                    number = value instanceof Number n ? n.doubleValue() : Double.parseDouble(String.valueOf(value).trim());
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException(label + " must be a number");
                }
                if (Double.isNaN(number) || Double.isInfinite(number)) {
                    throw new IllegalArgumentException(label + " must be a number");
                }
                checkRange(field, number);
                yield number;
            }
            case SELECT -> {
                String text = String.valueOf(value);
                boolean allowed = field.getOptions().stream().anyMatch(option -> option.value().equals(text));
                if (!allowed) {
                    String choices = field.getOptions().stream().map(ConnectorField.Option::value).collect(Collectors.joining(", "));
                    throw new IllegalArgumentException(label + " must be one of: " + choices);
                }
                yield text;
            }
        };
    }

    private static void checkRange(ConnectorField field, double number) {
        if (field.getMin() != null && number < field.getMin()) {
            throw new IllegalArgumentException(field.getLabel() + " must be at least " + format(field.getMin()));
        }
        if (field.getMax() != null && number > field.getMax()) {
            throw new IllegalArgumentException(field.getLabel() + " must be at most " + format(field.getMax()));
        }
    }

    private static String format(double number) {
        return number == Math.rint(number) ? String.valueOf((long) number) : String.valueOf(number);
    }

    // ── Accessors ────────────────────────────────────────────────

    /** @param key field key @return true if the field has a value */
    public boolean has(String key) {
        return values.containsKey(key);
    }

    /** @param key field key @return the text value, or null if absent */
    public String getString(String key) {
        Object value = values.get(key);
        return value == null ? null : String.valueOf(value);
    }

    /** @param key field key @param fallback value if absent @return the text value */
    public String getString(String key, String fallback) {
        String value = getString(key);
        return value == null ? fallback : value;
    }

    /** @param key field key @param fallback value if absent @return the whole number value */
    public long getLong(String key, long fallback) {
        Object value = values.get(key);
        return value instanceof Number number ? number.longValue() : fallback;
    }

    /** @param key field key @param fallback value if absent @return the whole number value */
    public int getInt(String key, int fallback) {
        return (int) getLong(key, fallback);
    }

    /** @param key field key @param fallback value if absent @return the decimal value */
    public double getDouble(String key, double fallback) {
        Object value = values.get(key);
        return value instanceof Number number ? number.doubleValue() : fallback;
    }

    /** @param key field key @param fallback value if absent @return the on/off value */
    public boolean getBoolean(String key, boolean fallback) {
        Object value = values.get(key);
        return value instanceof Boolean bool ? bool : fallback;
    }

    /** @return every value by key (String, Long, Double or Boolean) */
    public Map<String, Object> asMap() {
        return values;
    }

    @Override
    public String toString() {
        return "ConnectorConfig" + values.keySet();
    }
}
