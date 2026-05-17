package com.gensynth.core.flow.variables;

import java.util.Map;

/**
 * Abstract class base for all variable configurations.
 * Defines common behavior among all types.
 */
public abstract class VariableConfiguration {
    protected String identifier;
    protected VariableType type;
    protected GenerationPattern pattern;
    protected AnomalyConfig anomalyConfig;
    protected Object defaultValue;
    protected long tickCounter;

    public VariableConfiguration() {
        this.anomalyConfig = new AnomalyConfig();
        this.tickCounter = 0;
    }

    /**
     * Generate next value based on settings
     */
    public abstract Object generateNextValue();

    /**
     * Reset internal status
     */
    public abstract void reset();

    /**
     * Export configuration to map (for persistence)
     */
    public abstract Map<String, Object> toMap();

    /**
     * Increase tick counter
     */
    public void incrementTick() {
        tickCounter++;
    }

    // Builder pattern methods
    public VariableConfiguration identifier(String id) {
        this.identifier = id;
        return this;
    }

    public VariableConfiguration pattern(GenerationPattern pattern) {
        this.pattern = pattern;
        return this;
    }

    public VariableConfiguration defaultValue(Object value) {
        this.defaultValue = value;
        return this;
    }

    public VariableConfiguration anomaly(AnomalyConfig config) {
        this.anomalyConfig = config;
        return this;
    }

    // Getters
    public String getIdentifier() { return identifier; }
    public VariableType getType() { return type; }
    public GenerationPattern getPattern() { return pattern; }
    public AnomalyConfig getAnomalyConfig() { return anomalyConfig; }
    public Object getDefaultValue() { return defaultValue; }
    public long getTickCounter() { return tickCounter; }
    protected Map<String, Object> currentContext = new java.util.HashMap<>();
    protected java.util.List<ConditionalRule> conditionalRules = new java.util.ArrayList<>();

    public java.util.Set<String> getDependencies() {
        java.util.Set<String> deps = new java.util.HashSet<>();
        for (ConditionalRule rule : conditionalRules) {
            if (rule.targetVariable != null && !rule.targetVariable.isEmpty()) {
                deps.add(rule.targetVariable);
            }
        }
        return deps;
    }

    public void setContext(Map<String, Object> context) {
        this.currentContext = context;
        applyConditionalRules();
    }

    protected void applyConditionalRules() {
        // Evaluate rules and override configuration values
        // Will be implemented by specific config classes if they need complex logic,
        // or we can use reflection. For ultra-efficiency, subclasses should override this.
    }

    public static class ConditionalRule {
        public String targetVariable;
        public String condition; // "EQUALS", "GREATER_THAN", "LESS_THAN"
        public Object value;
        public Map<String, Object> overrides;

        public ConditionalRule() {
            this.overrides = new java.util.HashMap<>();
        }
    }
}
