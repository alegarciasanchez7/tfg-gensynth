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

    /**
     * Validates this configuration for logical consistency before simulation starts.
     * @return list of validation error messages; empty if valid
     */
    public abstract java.util.List<String> validate();

    public java.util.Set<String> getDependencies() {
        java.util.Set<String> deps = new java.util.HashSet<>();
        for (ConditionalRule rule : conditionalRules) {
            if (rule.targetVariable != null && !rule.targetVariable.isEmpty()) {
                deps.add(rule.targetVariable);
            }
        }
        return deps;
    }

    protected boolean hasActiveOverride = false;
    protected Object activeOverrideValue = null;

    public void setContext(Map<String, Object> context) {
        this.currentContext = context;
        applyConditionalRules();
    }

    protected void applyConditionalRules() {
        if (conditionalRules == null || conditionalRules.isEmpty()) {
            hasActiveOverride = false;
            activeOverrideValue = null;
            return;
        }

        for (ConditionalRule rule : conditionalRules) {
            if (rule.targetVariable == null || rule.targetVariable.isEmpty()) {
                continue;
            }

            // Find value in context by target variable name (e.g. "hola")
            Object contextVal = currentContext.get(rule.targetVariable);
            if (contextVal == null) {
                // Try finding by name if keys are UUIDs by mapping/filtering
                // Note: currentContext keys might be UUIDs if populated in Flow.java
                // But Flow.java maps by ID. We check if there's any key matching rule.targetVariable name
                // To be safe, we look up the key by targetVariable name.
                contextVal = currentContext.get(rule.targetVariable);
            }

            if (contextVal != null) {
                boolean match = evaluateCondition(contextVal, rule.condition, rule.value);
                if (match) {
                    hasActiveOverride = true;
                    // The overrides can contain a JSON payload or a mapping of properties.
                    if (rule.overrides != null && !rule.overrides.isEmpty()) {
                        if (rule.overrides.containsKey(this.identifier)) {
                            activeOverrideValue = rule.overrides.get(this.identifier);
                        } else if (rule.overrides.containsKey("constantValue")) { // Extract fixed string mode property
                            activeOverrideValue = rule.overrides.get("constantValue");
                        } else if (rule.overrides.containsKey("value")) {
                            activeOverrideValue = rule.overrides.get("value");
                        } else {
                            Object firstVal = rule.overrides.values().stream().findFirst().orElse(null);
                            if (firstVal != null) {
                                activeOverrideValue = firstVal;
                            } else {
                                activeOverrideValue = rule.overrides;
                            }
                        }
                    } else {
                        activeOverrideValue = rule.value; // Fallback
                    }
                    org.slf4j.LoggerFactory.getLogger(VariableConfiguration.class)
                        .debug("[RULE MATCH] Variable '{}' triggered override on condition '{} {} {}' context value was: '{}'. New active override: '{}'",
                            this.identifier, rule.targetVariable, rule.condition, rule.value, contextVal, activeOverrideValue);
                    return; // Stop at first matching rule
                }
            }
        }

        // Reset if no rule matches
        hasActiveOverride = false;
        activeOverrideValue = null;
    }

    private boolean evaluateCondition(Object contextVal, String operator, Object ruleVal) {
        if (contextVal == null || ruleVal == null) {
            return false;
        }

        String op = operator != null ? operator.toUpperCase() : "EQUALS";
        String contextStr = contextVal.toString();
        String ruleStr = ruleVal.toString();

        // Numeric comparison helper
        Double contextNum = tryParseDouble(contextVal);
        Double ruleNum = tryParseDouble(ruleVal);

        switch (op) {
            case "EQUALS":
                if (contextNum != null && ruleNum != null) {
                    return contextNum.equals(ruleNum);
                }
                return contextStr.equals(ruleStr);

            case "NOT_EQUALS":
                if (contextNum != null && ruleNum != null) {
                    return !contextNum.equals(ruleNum);
                }
                return !contextStr.equals(ruleStr);

            case "GREATER_THAN":
                if (contextNum != null && ruleNum != null) {
                    return contextNum > ruleNum;
                }
                return contextStr.compareTo(ruleStr) > 0;

            case "LESS_THAN":
                if (contextNum != null && ruleNum != null) {
                    return contextNum < ruleNum;
                }
                return contextStr.compareTo(ruleStr) < 0;

            case "CONTAINS":
                return contextStr.contains(ruleStr);

            default:
                return false;
        }
    }

    private Double tryParseDouble(Object obj) {
        if (obj instanceof Number) {
            return ((Number) obj).doubleValue();
        }
        try {
            return Double.parseDouble(obj.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public java.util.List<ConditionalRule> getConditionalRules() {
        return conditionalRules;
    }

    public void setConditionalRules(java.util.List<ConditionalRule> conditionalRules) {
        this.conditionalRules = conditionalRules != null ? conditionalRules : new java.util.ArrayList<>();
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
