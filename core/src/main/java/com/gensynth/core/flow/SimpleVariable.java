package com.gensynth.core.flow;

import com.gensynth.core.api.IVariable;

import java.util.concurrent.atomic.AtomicReference;

/**
 * Simple implementation of IVariable for basic data generation.
 *
 * This is a MVP (Minimum Viable Product) implementation.
 * Future: Will be replaced by advanced Variable System with patterns
 *         (sine waves, random, anomaly injection, etc.)
 *
 * For now, maintains a simple value that can be:
 * - Set manually
 * - Generated as fixed/constant
 * - Slightly varied for realism
 */
public class SimpleVariable implements IVariable {

    private final String id;
    private final String type;
    private final AtomicReference<Object> currentValue = new AtomicReference<>();

    /**
     * Constructor for SimpleVariable.
     *
     * @param id Unique identifier (e.g., "temperature")
     * @param initialValue Initial value (e.g., 20.0)
     */
    public SimpleVariable(String id, Object initialValue) {
        if (id == null || id.isEmpty()) {
            throw new IllegalArgumentException("id cannot be null or empty");
        }
        if (initialValue == null) {
            throw new IllegalArgumentException("initialValue cannot be null");
        }

        this.id = id;
        this.currentValue.set(initialValue);
        this.type = inferType(initialValue);
    }

    @Override
    public Object getValue() {
        // Return current value (which may have been slightly varied)
        return currentValue.get();
    }

    @Override
    public void setValue(Object value) {
        if (value == null) {
            throw new IllegalArgumentException("value cannot be null");
        }
        this.currentValue.set(value);
    }

    @Override
    public String getId() {
        return id;
    }

    @Override
    public String getType() {
        return type;
    }

    /**
     * Generate next value (with minimal variation for realism).
     * MVP implementation: just return current value ± 0.1%
     *
     * Future: Will support patterns like sine(), random(), anomaly(), etc.
     */
    public Object generateNextValue() {
        return currentValue.updateAndGet(SimpleVariable::vary);
    }

    /**
     * Applies the tiny random variation to a value: doubles and floats change by up to 0.1%,
     * any other type (integers, longs, strings...) is returned as-is.
     */
    private static Object vary(Object value) {
        if (value instanceof Double d) {
            double variation = d * 0.001 * (Math.random() - 0.5);
            return d + variation;
        }
        if (value instanceof Float f) {
            float variation = f * 0.001f * (float) (Math.random() - 0.5);
            return f + variation;
        }
        return value;
    }

    /**
     * Infer the type from the value object.
     */
    private String inferType(Object value) {
        if (value instanceof Double) return "double";
        if (value instanceof Float) return "float";
        if (value instanceof Integer) return "int";
        if (value instanceof Long) return "long";
        if (value instanceof Boolean) return "boolean";
        if (value instanceof String) return "string";
        return value.getClass().getSimpleName();
    }

    @Override
    public String toString() {
        return String.format("SimpleVariable{id=%s, type=%s, value=%s}",
            id, type, currentValue.get());
    }
}
