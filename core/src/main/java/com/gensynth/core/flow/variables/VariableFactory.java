package com.gensynth.core.flow.variables;

import com.gensynth.core.flow.variables.config.*;
import java.util.Map;
import java.util.List;

/**
 * Factory for creating configurable variables fluently.
 * Provides base methods - domain-specific convenience methods belong in client
 * code.
 */
public class VariableFactory {

    private VariableFactory() {
        // Utility class
    }

    /**
     * Create numeric variable configuration
     */
    public static NumericVariableConfig createNumeric(String id) {
        return new NumericVariableConfig()
                .identifier(id);
    }

    /**
     * Create string variable configuration
     */
    public static StringVariableConfig createString(String id) {
        return new StringVariableConfig()
                .identifier(id);
    }

    /**
     * Create list variable configuration
     */
    public static ListVariableConfig createList(String id) {
        return new ListVariableConfig()
                .identifier(id);
    }

    /**
     * Create boolean variable configuration
     */
    public static BooleanVariableConfig createBoolean(String id) {
        return new BooleanVariableConfig()
                .identifier(id);
    }

    /**
     * Create temporal variable configuration
     */
    public static TemporalVariableConfig createTemporal(String id) {
        return new TemporalVariableConfig()
                .identifier(id);
    }

    /**
     * Create point variable configuration
     */
    public static PointVariableConfig createPoint(String id) {
        return new PointVariableConfig()
                .identifier(id);
    }

    /**
     * Instantiates a specific VariableConfiguration based on type and config map,
     * and performs validations.
     */
    public static VariableConfiguration createFromMap(String id, String type, Map<String, Object> configMap) {
        VariableConfiguration finalConfig = createFromMapInternal(id, type, configMap);
        if (finalConfig != null && configMap.containsKey("conditionalRules")) {
            try {
                java.util.List<VariableConfiguration.ConditionalRule> rulesList = new java.util.ArrayList<>();
                Object rulesObj = configMap.get("conditionalRules");
                if (rulesObj instanceof List) {
                    for (Object item : (List<?>) rulesObj) {
                        if (item instanceof Map) {
                            Map<?, ?> ruleMap = (Map<?, ?>) item;
                            VariableConfiguration.ConditionalRule rule = new VariableConfiguration.ConditionalRule();
                            rule.targetVariable = (String) ruleMap.get("targetVariable");
                            rule.condition = (String) ruleMap.get("condition");
                            if (rule.condition == null && ruleMap.containsKey("operator")) {
                                rule.condition = (String) ruleMap.get("operator");
                            }
                            rule.value = ruleMap.get("value");
                            if (ruleMap.get("overrides") instanceof Map) {
                                @SuppressWarnings("unchecked")
                                Map<String, Object> ovr = (Map<String, Object>) ruleMap.get("overrides");
                                rule.overrides = new java.util.HashMap<>(ovr);
                            }
                            rulesList.add(rule);
                        }
                    }
                }
                finalConfig.setConditionalRules(rulesList);
            } catch (Exception e) {
                // ignore parsing exceptions
            }
        }
        
        if (finalConfig != null) {
            List<String> errors = finalConfig.validate();
            if (!errors.isEmpty()) {
                throw new InvalidVariableConfigException(id, type, errors);
            }
        }
        return finalConfig;
    }

    private static VariableConfiguration createFromMapInternal(String id, String type, Map<String, Object> configMap) {
        if (configMap == null) {
            configMap = Map.of();
        }

        switch (type.toUpperCase()) {
            case "NUMERIC":
                NumericVariableConfig numConfig = createNumeric(id);
                if (configMap.containsKey("min"))
                    numConfig.from(((Number) configMap.get("min")).doubleValue());
                if (configMap.containsKey("max"))
                    numConfig.to(((Number) configMap.get("max")).doubleValue());
                if (configMap.containsKey("precision"))
                    numConfig.precision((String) configMap.get("precision"));
                if (configMap.containsKey("formula"))
                    numConfig.formula((String) configMap.get("formula"));
                if (configMap.containsKey("distribution"))
                    numConfig.distribution((String) configMap.get("distribution"));
                if (configMap.containsKey("pattern")) {
                    try {
                        numConfig.pattern(GenerationPattern.valueOf(((String) configMap.get("pattern")).toUpperCase()));
                    } catch (Exception e) {
                        // ignore or default
                    }
                }
                if (configMap.containsKey("decimalPlaces"))
                    numConfig.decimalPlaces(((Number) configMap.get("decimalPlaces")).intValue());
                if (configMap.containsKey("integerFormat"))
                    numConfig.integerFormat((String) configMap.get("integerFormat"));
                if (configMap.containsKey("prefix"))
                    numConfig.prefix((String) configMap.get("prefix"));
                if (configMap.containsKey("suffix"))
                    numConfig.suffix((String) configMap.get("suffix"));
                if (configMap.containsKey("initialValue") && configMap.get("initialValue") != null)
                    numConfig.initial(((Number) configMap.get("initialValue")).doubleValue());
                else if (configMap.containsKey("initial") && configMap.get("initial") != null)
                    numConfig.initial(((Number) configMap.get("initial")).doubleValue());
                if (configMap.containsKey("step") && configMap.get("step") != null)
                    numConfig.step(((Number) configMap.get("step")).doubleValue());
                if (configMap.containsKey("constantValue"))
                    numConfig.constant(((Number) configMap.get("constantValue")).doubleValue());
                if (configMap.containsKey("constantMargin"))
                    numConfig.constantMargin(((Number) configMap.get("constantMargin")).doubleValue());
                if (configMap.containsKey("distributionType"))
                    numConfig.distributionType((String) configMap.get("distributionType"));
                if (configMap.containsKey("boundaryMode"))
                    numConfig.boundaryMode((String) configMap.get("boundaryMode"));
                if (configMap.containsKey("sequentialGraph")) {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> seqGraph = (List<Map<String, Object>>) configMap.get("sequentialGraph");
                    numConfig.sequentialGraph(seqGraph);
                }
                if (configMap.containsKey("customDistributionGraph")) {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> distGraph = (List<Map<String, Object>>) configMap.get("customDistributionGraph");
                    numConfig.customDistributionGraph(distGraph);
                }
                return numConfig;

            case "STRING":
                StringVariableConfig strConfig = createString(id);
                if (configMap.containsKey("fixedLength"))
                    strConfig.fixedSize(((Number) configMap.get("fixedLength")).intValue());
                if (configMap.containsKey("regexPattern"))
                    strConfig.regex((String) configMap.get("regexPattern"));
                if (configMap.containsKey("pattern")) {
                    try {
                        strConfig.pattern(GenerationPattern.valueOf(((String) configMap.get("pattern")).toUpperCase()));
                    } catch (Exception e) {
                        // ignore or default
                    }
                }
                if (configMap.containsKey("constantValue"))
                    strConfig.constant((String) configMap.get("constantValue"));
                return strConfig;

            case "LIST":
                ListVariableConfig listConfig = createList(id);
                if (configMap.containsKey("items")) {
                    listConfig.list((List<?>) configMap.get("items"));
                }
                return listConfig;

            case "BOOLEAN":
                BooleanVariableConfig boolConfig = createBoolean(id);
                if (configMap.containsKey("currentValue"))
                    boolConfig.constantValue((Boolean) configMap.get("currentValue"));
                return boolConfig;

            case "DATE":
            case "TEMPORAL":
                TemporalVariableConfig dateConfig = createTemporal(id);
                if (configMap.containsKey("dateFormat"))
                    dateConfig.dateFormat((String) configMap.get("dateFormat"));
                if (configMap.containsKey("timeZone"))
                    dateConfig.timeZone((String) configMap.get("timeZone"));
                if (configMap.containsKey("temporalType"))
                    dateConfig.temporalType((String) configMap.get("temporalType"));
                return dateConfig;

            case "POINT":
                PointVariableConfig pointConfig = createPoint(id);
                if (configMap.containsKey("maxStepDistance"))
                    pointConfig.maxStepDistance(((Number) configMap.get("maxStepDistance")).doubleValue());
                return pointConfig;

            default:
                throw new IllegalArgumentException("Unknown variable type: " + type);
        }
    }

    /**
     * Create configurable variable from configuration
     */
    public static ConfigurableVariable createFromConfig(VariableConfiguration config) {
        return new ConfigurableVariable(config);
    }
}
