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

    protected VariableConfiguration() {
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

    protected String sourceListVariableId;
    protected String sourceListSelectionMode = "RANDOM_ITEM";
    protected String selectedListItemId;
    /** Copy of the source list's generator for the INHERITED_GENERATION mode, and the list it copies. */
    private com.gensynth.core.flow.variables.config.ListVariableConfig inheritedGenerator;
    private com.gensynth.core.flow.variables.config.ListVariableConfig inheritedGeneratorSource;

    public String getSourceListVariableId() { return sourceListVariableId; }
    public void setSourceListVariableId(String sourceListVariableId) { this.sourceListVariableId = sourceListVariableId; }
    public VariableConfiguration sourceListVariableId(String id) { this.sourceListVariableId = id; return this; }

    public String getSourceListSelectionMode() { return sourceListSelectionMode; }
    public void setSourceListSelectionMode(String sourceListSelectionMode) { this.sourceListSelectionMode = sourceListSelectionMode; }
    public VariableConfiguration sourceListSelectionMode(String mode) { this.sourceListSelectionMode = mode; return this; }

    public String getSelectedListItemId() { return selectedListItemId; }
    public void setSelectedListItemId(String selectedListItemId) { this.selectedListItemId = selectedListItemId; }
    public VariableConfiguration selectedListItemId(String id) { this.selectedListItemId = id; return this; }


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
        if (sourceListVariableId != null && !sourceListVariableId.trim().isEmpty()) {
            deps.add(sourceListVariableId.trim());
        }
        return deps;
    }

    public Object resolveListReferenceValue() {
        if (sourceListVariableId == null || sourceListVariableId.trim().isEmpty() || currentContext == null) {
            return null;
        }

        String refId = sourceListVariableId.trim();
        com.gensynth.core.flow.variables.config.ListVariableConfig sourceListConfig = sourceListConfigOf(refId);
        if (sourceListConfig != null && !sourceListConfig.getEffectiveItems().isEmpty()) {
            return pickFromSourceList(sourceListConfig);
        }

        return currentContext.get(refId);
    }

    /** The source list in the context (its config entry first, then the variable), or null if it is not a list. */
    private com.gensynth.core.flow.variables.config.ListVariableConfig sourceListConfigOf(String refId) {
        Object varObj = currentContext.get(refId + "_config");
        if (varObj == null) {
            varObj = currentContext.get(refId);
        }
        if (varObj instanceof ConfigurableVariable variable) {
            return variable.getConfiguration() instanceof com.gensynth.core.flow.variables.config.ListVariableConfig list
                    ? list
                    : null;
        }
        return varObj instanceof com.gensynth.core.flow.variables.config.ListVariableConfig directList ? directList : null;
    }

    /** Value of the source list item chosen by the selection mode (the list has items). */
    private Object pickFromSourceList(com.gensynth.core.flow.variables.config.ListVariableConfig sourceListConfig) {
        // A Fixed Subset list gives an array, not one item: that mode falls back to a random item
        if ("INHERITED_GENERATION".equalsIgnoreCase(sourceListSelectionMode)
                && sourceListConfig.getSelectionStrategy() != com.gensynth.core.flow.variables.config.ListVariableConfig.SelectionStrategy.FIXED_SUBSET) {
            return inheritedGeneratorOf(sourceListConfig).generateNextValue();
        }
        java.util.List<com.gensynth.core.flow.variables.config.ListVariableConfig.ListItem> items = sourceListConfig.getEffectiveItems();
        if ("FIXED_ITEM".equalsIgnoreCase(sourceListSelectionMode) && selectedListItemId != null) {
            for (com.gensynth.core.flow.variables.config.ListVariableConfig.ListItem item : items) {
                if (selectedListItemId.equals(item.getId())) {
                    return item.generateValue();
                }
            }
        }
        int idx = java.util.concurrent.ThreadLocalRandom.current().nextInt(items.size());
        return items.get(idx).generateValue();
    }

    /**
     * Generator that picks items as the source list does (same strategy, weights, order and matrix)
     * but keeps its own position, so this variable does not move the list's sequence or chain.
     * A list edited or restarted is a new object, and the copy is made again from it.
     */
    private com.gensynth.core.flow.variables.config.ListVariableConfig inheritedGeneratorOf(
            com.gensynth.core.flow.variables.config.ListVariableConfig source) {
        if (inheritedGenerator == null || inheritedGeneratorSource != source) {
            inheritedGenerator = source.copyGenerator();
            inheritedGeneratorSource = source;
        }
        inheritedGenerator.setContext(currentContext);
        return inheritedGenerator;
    }

    protected boolean hasActiveOverride = false;
    protected Object activeOverrideValue = null;
    /** Generator config of the matching rule, when the rule overrides with a full config instead of one value. */
    protected Map<String, Object> activeOverrideConfig = null;

    /** Keys that only a full generator config has (written by the rule's visual editor). */
    private static final java.util.Set<String> GENERATOR_KEYS = java.util.Set.of("pattern", "selectionStrategy", "timeAdvanceMode");

    /**
     * @return the generator config of the active rule, or {@code null} if no rule matches or the rule
     *         overrides with a single value
     */
    public Map<String, Object> getActiveOverrideConfig() {
        return activeOverrideConfig;
    }

    public void setContext(Map<String, Object> context) {
        this.currentContext = context;
        applyConditionalRules();
    }

    protected void applyConditionalRules() {
        if (conditionalRules != null) {
            for (ConditionalRule rule : conditionalRules) {
                Object contextVal = matchingContextValue(rule);
                if (contextVal != null) {
                    activateOverride(rule, contextVal);
                    return; // Stop at first matching rule
                }
            }
        }

        // Reset if no rule matches
        hasActiveOverride = false;
        activeOverrideValue = null;
        activeOverrideConfig = null;
    }

    /**
     * Context value of the rule's target variable when the rule matches it, otherwise null.
     * The context is keyed by the target variable as the rule names it.
     */
    private Object matchingContextValue(ConditionalRule rule) {
        if (rule.targetVariable == null || rule.targetVariable.isEmpty()) {
            return null;
        }
        Object contextVal = currentContext.get(rule.targetVariable);
        if (contextVal != null && evaluateCondition(contextVal, rule.condition, rule.value)) {
            return contextVal;
        }
        return null;
    }

    private void activateOverride(ConditionalRule rule, Object contextVal) {
        hasActiveOverride = true;
        activeOverrideConfig = null;
        // The overrides can contain a full generator config, a JSON payload or a mapping of properties.
        if (rule.overrides != null && rule.overrides.keySet().stream().anyMatch(GENERATOR_KEYS::contains)) {
            activeOverrideConfig = rule.overrides;
            activeOverrideValue = null;
        } else if (rule.overrides != null && !rule.overrides.isEmpty()) {
            activeOverrideValue = overrideValueOf(rule.overrides);
        } else {
            activeOverrideValue = rule.value; // Fallback
        }
        org.slf4j.LoggerFactory.getLogger(VariableConfiguration.class)
            .debug("[RULE MATCH] Variable '{}' triggered override on condition '{} {} {}' context value was: '{}'. New active override: '{}'",
                this.identifier, rule.targetVariable, rule.condition, rule.value, contextVal, activeOverrideValue);
    }

    /** Single override value: this variable's entry, the fixed-mode value, "value", or else the first entry. */
    private Object overrideValueOf(Map<String, Object> overrides) {
        if (overrides.containsKey(this.identifier)) {
            return overrides.get(this.identifier);
        }
        if (overrides.containsKey("constantValue")) { // Extract fixed string mode property
            return overrides.get("constantValue");
        }
        if (overrides.containsKey("value")) {
            return overrides.get("value");
        }
        Object firstVal = overrides.values().stream().findFirst().orElse(null);
        return firstVal != null ? firstVal : overrides;
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

        return switch (op) {
            case "EQUALS" -> isEqual(contextNum, ruleNum, contextStr, ruleStr);
            case "NOT_EQUALS" -> !isEqual(contextNum, ruleNum, contextStr, ruleStr);
            case "GREATER_THAN" -> isGreater(contextNum, ruleNum, contextStr, ruleStr);
            case "LESS_THAN" -> isLess(contextNum, ruleNum, contextStr, ruleStr);
            case "CONTAINS" -> contextStr.contains(ruleStr);
            default -> false;
        };
    }

    // Both sides numeric: compare as numbers; otherwise compare the texts
    private static boolean isEqual(Double contextNum, Double ruleNum, String contextStr, String ruleStr) {
        if (contextNum != null && ruleNum != null) {
            return contextNum.equals(ruleNum);
        }
        return contextStr.equals(ruleStr);
    }

    private static boolean isGreater(Double contextNum, Double ruleNum, String contextStr, String ruleStr) {
        if (contextNum != null && ruleNum != null) {
            return contextNum > ruleNum;
        }
        return contextStr.compareTo(ruleStr) > 0;
    }

    private static boolean isLess(Double contextNum, Double ruleNum, String contextStr, String ruleStr) {
        if (contextNum != null && ruleNum != null) {
            return contextNum < ruleNum;
        }
        return contextStr.compareTo(ruleStr) < 0;
    }

    private Double tryParseDouble(Object obj) {
        if (obj instanceof Number number) {
            return number.doubleValue();
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
