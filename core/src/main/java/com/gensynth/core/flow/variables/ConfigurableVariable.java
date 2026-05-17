package com.gensynth.core.flow.variables;

import com.gensynth.core.api.IVariable;

/**
 * Implementation of IVariable involving a VariableConfiguration.
 * Provides simplified interface for use in Flow.
 */
public class ConfigurableVariable implements IVariable {
    private final VariableConfiguration configuration;
    private Object currentValue;

    public ConfigurableVariable(VariableConfiguration config) {
        if (config == null) {
            throw new IllegalArgumentException("Configuration cannot be null");
        }
        this.configuration = config;
        this.currentValue = config.getDefaultValue();
    }

    @Override
    public Object getValue() {
        currentValue = configuration.generateNextValue();
        return currentValue;
    }

    @Override
    public void setValue(Object value) {
        this.currentValue = value;
    }

    @Override
    public String getId() {
        return configuration.getIdentifier();
    }

    @Override
    public String getType() {
        return configuration.getType() != null 
            ? configuration.getType().name() 
            : "UNKNOWN";
    }

    /**
     * Access to the wrapped configuration
     */
    public VariableConfiguration getConfiguration() {
        return configuration;
    }

    /**
     * Reset internal status
     */
    public void reset() {
        configuration.reset();
        this.currentValue = configuration.getDefaultValue();
    }

    @Override
    public java.util.Set<String> getDependencies() {
        return configuration.getDependencies();
    }

    @Override
    public void setContext(java.util.Map<String, Object> context) {
        configuration.setContext(context);
    }

    @Override
    public String toString() {
        return String.format("ConfigurableVariable{id=%s, type=%s, value=%s}", 
            getId(), getType(), currentValue);
    }
}
