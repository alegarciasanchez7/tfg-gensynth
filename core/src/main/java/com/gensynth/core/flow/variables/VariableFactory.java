package com.gensynth.core.flow.variables;

import com.gensynth.core.flow.variables.config.*;
import java.util.Map;
import java.util.HashMap;
import java.util.List;
import java.util.ArrayList;

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
                // Sinusoidal
                if (configMap.containsKey("sineFrequency") && configMap.get("sineFrequency") != null)
                    numConfig.sineFrequency(((Number) configMap.get("sineFrequency")).doubleValue());
                if (configMap.containsKey("sineAmplitude") && configMap.get("sineAmplitude") != null)
                    numConfig.sineAmplitude(((Number) configMap.get("sineAmplitude")).doubleValue());
                if (configMap.containsKey("sinePhase") && configMap.get("sinePhase") != null)
                    numConfig.sinePhase(((Number) configMap.get("sinePhase")).doubleValue());
                if (configMap.containsKey("sineOffset") && configMap.get("sineOffset") != null)
                    numConfig.sineOffset(((Number) configMap.get("sineOffset")).doubleValue());

                // Drift
                if (configMap.containsKey("driftRate") && configMap.get("driftRate") != null)
                    numConfig.driftRate(((Number) configMap.get("driftRate")).doubleValue());
                if (configMap.containsKey("driftInitialValue") && configMap.get("driftInitialValue") != null)
                    numConfig.driftInitialValue(((Number) configMap.get("driftInitialValue")).doubleValue());
                if (configMap.containsKey("driftLimitMode"))
                    numConfig.driftLimitMode((String) configMap.get("driftLimitMode"));

                // Virtual Clock
                if (configMap.containsKey("simulationTimeStep") && configMap.get("simulationTimeStep") != null)
                    numConfig.simulationTimeStep(((Number) configMap.get("simulationTimeStep")).doubleValue());

                // Noise Layer
                if (configMap.containsKey("noiseEnabled") && configMap.get("noiseEnabled") != null)
                    numConfig.noiseEnabled((Boolean) configMap.get("noiseEnabled"));
                if (configMap.containsKey("noiseType"))
                    numConfig.noiseType((String) configMap.get("noiseType"));
                if (configMap.containsKey("noiseAmplitude") && configMap.get("noiseAmplitude") != null)
                    numConfig.noiseAmplitude(((Number) configMap.get("noiseAmplitude")).doubleValue());
                if (configMap.containsKey("noiseStdDev") && configMap.get("noiseStdDev") != null)
                    numConfig.noiseStdDev(((Number) configMap.get("noiseStdDev")).doubleValue());

                // Spike Layer
                if (configMap.containsKey("spikeEnabled") && configMap.get("spikeEnabled") != null)
                    numConfig.spikeEnabled((Boolean) configMap.get("spikeEnabled"));
                if (configMap.containsKey("spikeProbability") && configMap.get("spikeProbability") != null)
                    numConfig.spikeProbability(((Number) configMap.get("spikeProbability")).doubleValue());
                if (configMap.containsKey("spikeMode"))
                    numConfig.spikeMode((String) configMap.get("spikeMode"));
                if (configMap.containsKey("spikeMagnitude") && configMap.get("spikeMagnitude") != null)
                    numConfig.spikeMagnitude(((Number) configMap.get("spikeMagnitude")).doubleValue());
                if (configMap.containsKey("spikeMin") && configMap.get("spikeMin") != null)
                    numConfig.spikeMin(((Number) configMap.get("spikeMin")).doubleValue());
                if (configMap.containsKey("spikeMax") && configMap.get("spikeMax") != null)
                    numConfig.spikeMax(((Number) configMap.get("spikeMax")).doubleValue());
                if (configMap.containsKey("spikeMultiplier") && configMap.get("spikeMultiplier") != null)
                    numConfig.spikeMultiplier(((Number) configMap.get("spikeMultiplier")).doubleValue());

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
                if (configMap.containsKey("template"))
                    strConfig.template((String) configMap.get("template"));
                if (configMap.containsKey("formattedMaskType"))
                    strConfig.formattedMaskType((String) configMap.get("formattedMaskType"));
                if (configMap.containsKey("customMask"))
                    strConfig.customMask((String) configMap.get("customMask"));
                if (configMap.containsKey("alphanumericCase"))
                    strConfig.alphanumericCase((String) configMap.get("alphanumericCase"));
                if (configMap.containsKey("corruptionEnabled") && configMap.get("corruptionEnabled") != null)
                    strConfig.corruptionEnabled((Boolean) configMap.get("corruptionEnabled"));
                if (configMap.containsKey("corruptionProbability") && configMap.get("corruptionProbability") != null)
                    strConfig.corruptionProbability(((Number) configMap.get("corruptionProbability")).doubleValue());
                if (configMap.containsKey("corruptionMode"))
                    strConfig.corruptionMode((String) configMap.get("corruptionMode"));
                if (configMap.containsKey("corruptionMagnitude") && configMap.get("corruptionMagnitude") != null)
                    strConfig.corruptionMagnitude(((Number) configMap.get("corruptionMagnitude")).intValue());
                return strConfig;

            case "LIST":
                ListVariableConfig listConfig = createList(id);
                if (configMap.containsKey("items") && configMap.get("items") instanceof List) {
                    List<?> rawItems = (List<?>) configMap.get("items");
                    List<ListVariableConfig.ListItem> parsedItems = new ArrayList<>();
                    for (Object rawItem : rawItems) {
                        if (rawItem instanceof Map) {
                            Map<?, ?> itemMap = (Map<?, ?>) rawItem;
                            String itemId = itemMap.containsKey("id") ? String.valueOf(itemMap.get("id")) : null;
                            Object val = itemMap.get("value");
                            double weight = itemMap.containsKey("weight") ? ((Number) itemMap.get("weight")).doubleValue() : 1.0;
                            ListVariableConfig.ListItem item = new ListVariableConfig.ListItem(itemId, val, weight);

                            if (itemMap.containsKey("embeddedConfig") && itemMap.get("embeddedConfig") instanceof Map) {
                                @SuppressWarnings("unchecked")
                                Map<String, Object> subMap = (Map<String, Object>) itemMap.get("embeddedConfig");
                                String subType = itemMap.containsKey("embeddedType") ? String.valueOf(itemMap.get("embeddedType")) : "NUMERIC";
                                if (subMap.containsKey("type")) {
                                    subType = String.valueOf(subMap.get("type"));
                                }
                                String subId = id + "_embedded_" + item.getId();
                                VariableConfiguration embeddedConfig = createFromMapInternal(subId, subType, subMap);
                                item.setEmbeddedConfig(embeddedConfig);
                            }
                            parsedItems.add(item);
                        } else if (rawItem instanceof ListVariableConfig.ListItem) {
                            parsedItems.add((ListVariableConfig.ListItem) rawItem);
                        } else {
                            parsedItems.add(new ListVariableConfig.ListItem(null, rawItem, 1.0));
                        }
                    }
                    listConfig.items(parsedItems);
                }
                if (configMap.containsKey("transitionMatrix") && configMap.get("transitionMatrix") instanceof Map) {
                    @SuppressWarnings("unchecked")
                    Map<String, Map<String, Object>> rawMatrix = (Map<String, Map<String, Object>>) configMap.get("transitionMatrix");
                    Map<String, Map<String, Double>> matrix = new HashMap<>();
                    for (Map.Entry<String, Map<String, Object>> entry : rawMatrix.entrySet()) {
                        Map<String, Double> innerMap = new HashMap<>();
                        if (entry.getValue() != null) {
                            for (Map.Entry<String, Object> innerEntry : entry.getValue().entrySet()) {
                                if (innerEntry.getValue() instanceof Number) {
                                    innerMap.put(innerEntry.getKey(), ((Number) innerEntry.getValue()).doubleValue());
                                }
                            }
                        }
                        matrix.put(entry.getKey(), innerMap);
                    }
                    listConfig.transitionMatrix(matrix);
                }
                if (configMap.containsKey("selectionStrategy") && configMap.get("selectionStrategy") != null) {
                    try {
                        listConfig.selectionStrategy(ListVariableConfig.SelectionStrategy.valueOf(((String) configMap.get("selectionStrategy")).toUpperCase()));
                    } catch (Exception e) {
                        // ignore or default
                    }
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
