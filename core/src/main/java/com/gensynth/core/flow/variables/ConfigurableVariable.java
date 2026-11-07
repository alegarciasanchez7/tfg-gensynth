package com.gensynth.core.flow.variables;

import com.gensynth.core.api.IVariable;

/**
 * Implementation of IVariable involving a VariableConfiguration.
 * Provides simplified interface for use in Flow.
 */
public class ConfigurableVariable implements IVariable {
    private final VariableConfiguration configuration;
    private Object currentValue;
    /** Generators of the rules that override with a full config, created on first use. */
    private final java.util.Map<java.util.Map<String, Object>, ConfigurableVariable> overrideGenerators =
            new java.util.IdentityHashMap<>();

    public ConfigurableVariable(VariableConfiguration config) {
        if (config == null) {
            throw new IllegalArgumentException("Configuration cannot be null");
        }
        this.configuration = config;
        this.currentValue = config.getDefaultValue();
    }

    @Override
    public Object getValue() {
        if (configuration.hasActiveOverride) {
            configuration.incrementTick(); // Maintain tick counter progression
            java.util.Map<String, Object> overrideConfig = configuration.getActiveOverrideConfig();
            currentValue = overrideConfig != null
                ? overrideGenerator(overrideConfig).getValue()
                : configuration.activeOverrideValue;
            org.slf4j.LoggerFactory.getLogger(ConfigurableVariable.class)
                .debug("[VARIABLE OVERRIDE VALUE] Variable '{}' evaluated to override value: '{}'",
                    configuration.getIdentifier(), currentValue);
        } else {
            currentValue = configuration.generateNextValue();
        }
        return currentValue;
    }

    private ConfigurableVariable overrideGenerator(java.util.Map<String, Object> overrideConfig) {
        ConfigurableVariable generator = overrideGenerators.computeIfAbsent(overrideConfig, cfg ->
            VariableFactory.createFromConfig(VariableFactory.createFromMap(
                configuration.getIdentifier() + "#rule", configuration.getType().name(), cfg)));
        generator.setContext(configuration.currentContext);
        return generator;
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
    public String getName() {
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
