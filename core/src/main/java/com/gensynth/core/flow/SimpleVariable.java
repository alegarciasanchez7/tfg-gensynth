package com.gensynth.core.flow;

import com.gensynth.core.api.IVariable;

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
    private volatile Object currentValue;

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
        this.currentValue = initialValue;
        this.type = inferType(initialValue);
    }

    @Override
    public Object getValue() {
        // Return current value (which may have been slightly varied)
        return currentValue;
    }

    @Override
    public void setValue(Object value) {
        if (value == null) {
            throw new IllegalArgumentException("value cannot be null");
        }
        this.currentValue = value;
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
        // For numeric values, add tiny variation (0.1%)
        if (currentValue instanceof Double) {
            double d = (Double) currentValue;
            double variation = d * 0.001 * (Math.random() - 0.5);
            currentValue = d + variation;
        } else if (currentValue instanceof Float) {
            float f = (Float) currentValue;
            float variation = f * 0.001f * (float)(Math.random() - 0.5);
            currentValue = f + variation;
        } else if (currentValue instanceof Integer) {
            // No variation for integers
            return currentValue;
        } else if (currentValue instanceof Long) {
            // No variation for longs
            return currentValue;
        }
        // For other types, return as-is

        return currentValue;
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
            id, type, currentValue);
    }
}
