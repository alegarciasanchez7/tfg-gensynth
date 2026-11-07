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
    // Keys of the variable configuration (payloads from the UI and project files)
    private static final String KEY_SOURCE_LIST_VARIABLE_ID = "sourceListVariableId";
    private static final String KEY_SOURCE_LIST_SELECTION_MODE = "sourceListSelectionMode";
    private static final String KEY_SELECTED_LIST_ITEM_ID = "selectedListItemId";
    private static final String KEY_PATTERN = "pattern";
    private static final String KEY_INITIAL_VALUE = "initialValue";
    private static final String KEY_INITIAL = "initial";
    private static final String KEY_CONSTANT_VALUE = "constantValue";
    private static final String KEY_SINE_FREQUENCY = "sineFrequency";
    private static final String KEY_SINE_AMPLITUDE = "sineAmplitude";
    private static final String KEY_SINE_PHASE = "sinePhase";
    private static final String KEY_SINE_OFFSET = "sineOffset";
    private static final String KEY_DRIFT_RATE = "driftRate";
    private static final String KEY_DRIFT_INITIAL_VALUE = "driftInitialValue";
    private static final String KEY_SIMULATION_TIME_STEP = "simulationTimeStep";
    private static final String KEY_NOISE_ENABLED = "noiseEnabled";
    private static final String KEY_NOISE_AMPLITUDE = "noiseAmplitude";
    private static final String KEY_NOISE_STD_DEV = "noiseStdDev";
    private static final String KEY_SPIKE_ENABLED = "spikeEnabled";
    private static final String KEY_SPIKE_PROBABILITY = "spikeProbability";
    private static final String KEY_SPIKE_MAGNITUDE = "spikeMagnitude";
    private static final String KEY_SPIKE_MIN = "spikeMin";
    private static final String KEY_SPIKE_MAX = "spikeMax";
    private static final String KEY_SPIKE_MULTIPLIER = "spikeMultiplier";
    private static final String KEY_CORRUPTION_ENABLED = "corruptionEnabled";
    private static final String KEY_CORRUPTION_PROBABILITY = "corruptionProbability";
    private static final String KEY_CORRUPTION_MAGNITUDE = "corruptionMagnitude";
    private static final String KEY_ITEMS = "items";
    private static final String KEY_EMBEDDED_CONFIG = "embeddedConfig";
    private static final String KEY_TRANSITION_MATRIX = "transitionMatrix";
    private static final String KEY_SELECTION_STRATEGY = "selectionStrategy";
    private static final String KEY_ITEM_ORDER = "itemOrder";
    private static final String KEY_CURRENT_VALUE = "currentValue";
    private static final String KEY_ON_DURATION_TICKS = "onDurationTicks";
    private static final String KEY_OFF_DURATION_TICKS = "offDurationTicks";
    private static final String KEY_ALTERNATION_INTERVAL = "alternationInterval";
    private static final String KEY_TRUE_PROBABILITY = "trueProbability";
    private static final String KEY_FLIP_INTERVAL = "flipInterval";
    private static final String KEY_BURST_DURATION_TICKS = "burstDurationTicks";
    private static final String KEY_BURST_IDLE_TICKS = "burstIdleTicks";
    private static final String KEY_P_TRUE_TO_TRUE = "pTrueToTrue";
    private static final String KEY_P_FALSE_TO_TRUE = "pFalseToTrue";
    private static final String KEY_TIME_ADVANCE_MODE = "timeAdvanceMode";
    private static final String KEY_CLOCK_DRIFT_ENABLED = "clockDriftEnabled";
    private static final String KEY_MAX_DRIFT_MS = "maxDriftMs";
    private static final String KEY_DRIFT_TYPE = "driftType";
    private static final String KEY_DRIFT_RATE_MS_PER_TICK = "driftRateMsPerTick";
    private static final String KEY_BACKFILL_STRATEGY = "backfillStrategy";
    private static final String KEY_INCREMENT_MS = "incrementMs";
    private static final String KEY_START_DATE = "startDate";
    private static final String KEY_FIXED_DATE = "fixedDate";
    private static final String KEY_RANGE_START = "rangeStart";
    private static final String KEY_RANGE_END = "rangeEnd";
    private static final String KEY_INTERPOLATION_STEPS = "interpolationSteps";
    private static final String KEY_INITIAL_ALTITUDE = "initialAltitude";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_SOURCE_ID = "sourceId";
    private static final String KEY_FROM_NODE_ID = "fromNodeId";
    private static final String KEY_TO_NODE_ID = "toNodeId";
    private static final String KEY_TARGET_ID = "targetId";
    private static final String KEY_GRAPH_NAVIGATION_MODE = "graphNavigationMode";
    private static final String KEY_NAVIGATION_MODE = "navigationMode";

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
        
        // A list cannot inherit from another list: projects saved when it could keep only their own items
        if (finalConfig != null && !(finalConfig instanceof ListVariableConfig)) {
            if (configMap.containsKey(KEY_SOURCE_LIST_VARIABLE_ID) && configMap.get(KEY_SOURCE_LIST_VARIABLE_ID) != null) {
                finalConfig.setSourceListVariableId(String.valueOf(configMap.get(KEY_SOURCE_LIST_VARIABLE_ID)));
            }
            if (configMap.containsKey(KEY_SOURCE_LIST_SELECTION_MODE) && configMap.get(KEY_SOURCE_LIST_SELECTION_MODE) != null) {
                finalConfig.setSourceListSelectionMode(String.valueOf(configMap.get(KEY_SOURCE_LIST_SELECTION_MODE)));
            }
            if (configMap.containsKey(KEY_SELECTED_LIST_ITEM_ID) && configMap.get(KEY_SELECTED_LIST_ITEM_ID) != null) {
                finalConfig.setSelectedListItemId(String.valueOf(configMap.get(KEY_SELECTED_LIST_ITEM_ID)));
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

    /**
     * Pattern chosen in the editor, if the config has a valid one. Configs keep the keys of
     * patterns used before (e.g. constantValue), so they must not decide the pattern on their own.
     */
    private static GenerationPattern explicitPattern(Map<String, Object> configMap) {
        Object raw = configMap.get(KEY_PATTERN);
        if (raw == null) {
            return null;
        }
        try {
            return GenerationPattern.valueOf(raw.toString().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static VariableConfiguration createFromMapInternal(String id, String type, Map<String, Object> configMap) {
        if (configMap == null) {
            configMap = Map.of();
        }

        VariableType variableType = VariableType.fromName(type);
        if (variableType == null) {
            throw new IllegalArgumentException("Unknown variable type: " + type);
        }
        switch (variableType) {
            case NUMERIC:
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
                if (configMap.containsKey(KEY_PATTERN)) {
                    try {
                        numConfig.pattern(GenerationPattern.valueOf(((String) configMap.get(KEY_PATTERN)).toUpperCase()));
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
                if (configMap.containsKey(KEY_INITIAL_VALUE) && configMap.get(KEY_INITIAL_VALUE) != null)
                    numConfig.initial(((Number) configMap.get(KEY_INITIAL_VALUE)).doubleValue());
                else if (configMap.containsKey(KEY_INITIAL) && configMap.get(KEY_INITIAL) != null)
                    numConfig.initial(((Number) configMap.get(KEY_INITIAL)).doubleValue());
                if (configMap.containsKey("step") && configMap.get("step") != null)
                    numConfig.step(((Number) configMap.get("step")).doubleValue());
                if (configMap.containsKey(KEY_CONSTANT_VALUE))
                    numConfig.constant(((Number) configMap.get(KEY_CONSTANT_VALUE)).doubleValue());
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
                if (configMap.containsKey(KEY_SINE_FREQUENCY) && configMap.get(KEY_SINE_FREQUENCY) != null)
                    numConfig.sineFrequency(((Number) configMap.get(KEY_SINE_FREQUENCY)).doubleValue());
                if (configMap.containsKey(KEY_SINE_AMPLITUDE) && configMap.get(KEY_SINE_AMPLITUDE) != null)
                    numConfig.sineAmplitude(((Number) configMap.get(KEY_SINE_AMPLITUDE)).doubleValue());
                if (configMap.containsKey(KEY_SINE_PHASE) && configMap.get(KEY_SINE_PHASE) != null)
                    numConfig.sinePhase(((Number) configMap.get(KEY_SINE_PHASE)).doubleValue());
                if (configMap.containsKey(KEY_SINE_OFFSET) && configMap.get(KEY_SINE_OFFSET) != null)
                    numConfig.sineOffset(((Number) configMap.get(KEY_SINE_OFFSET)).doubleValue());

                // Drift
                if (configMap.containsKey(KEY_DRIFT_RATE) && configMap.get(KEY_DRIFT_RATE) != null)
                    numConfig.driftRate(((Number) configMap.get(KEY_DRIFT_RATE)).doubleValue());
                if (configMap.containsKey(KEY_DRIFT_INITIAL_VALUE) && configMap.get(KEY_DRIFT_INITIAL_VALUE) != null)
                    numConfig.driftInitialValue(((Number) configMap.get(KEY_DRIFT_INITIAL_VALUE)).doubleValue());
                if (configMap.containsKey("driftLimitMode"))
                    numConfig.driftLimitMode((String) configMap.get("driftLimitMode"));

                // Virtual Clock
                if (configMap.containsKey(KEY_SIMULATION_TIME_STEP) && configMap.get(KEY_SIMULATION_TIME_STEP) != null)
                    numConfig.simulationTimeStep(((Number) configMap.get(KEY_SIMULATION_TIME_STEP)).doubleValue());

                // Noise Layer
                if (configMap.containsKey(KEY_NOISE_ENABLED) && configMap.get(KEY_NOISE_ENABLED) != null)
                    numConfig.noiseEnabled((Boolean) configMap.get(KEY_NOISE_ENABLED));
                if (configMap.containsKey("noiseType"))
                    numConfig.noiseType((String) configMap.get("noiseType"));
                if (configMap.containsKey(KEY_NOISE_AMPLITUDE) && configMap.get(KEY_NOISE_AMPLITUDE) != null)
                    numConfig.noiseAmplitude(((Number) configMap.get(KEY_NOISE_AMPLITUDE)).doubleValue());
                if (configMap.containsKey(KEY_NOISE_STD_DEV) && configMap.get(KEY_NOISE_STD_DEV) != null)
                    numConfig.noiseStdDev(((Number) configMap.get(KEY_NOISE_STD_DEV)).doubleValue());

                // Spike Layer
                if (configMap.containsKey(KEY_SPIKE_ENABLED) && configMap.get(KEY_SPIKE_ENABLED) != null)
                    numConfig.spikeEnabled((Boolean) configMap.get(KEY_SPIKE_ENABLED));
                if (configMap.containsKey(KEY_SPIKE_PROBABILITY) && configMap.get(KEY_SPIKE_PROBABILITY) != null)
                    numConfig.spikeProbability(((Number) configMap.get(KEY_SPIKE_PROBABILITY)).doubleValue());
                if (configMap.containsKey("spikeMode"))
                    numConfig.spikeMode((String) configMap.get("spikeMode"));
                if (configMap.containsKey(KEY_SPIKE_MAGNITUDE) && configMap.get(KEY_SPIKE_MAGNITUDE) != null)
                    numConfig.spikeMagnitude(((Number) configMap.get(KEY_SPIKE_MAGNITUDE)).doubleValue());
                if (configMap.containsKey(KEY_SPIKE_MIN) && configMap.get(KEY_SPIKE_MIN) != null)
                    numConfig.spikeMin(((Number) configMap.get(KEY_SPIKE_MIN)).doubleValue());
                if (configMap.containsKey(KEY_SPIKE_MAX) && configMap.get(KEY_SPIKE_MAX) != null)
                    numConfig.spikeMax(((Number) configMap.get(KEY_SPIKE_MAX)).doubleValue());
                if (configMap.containsKey(KEY_SPIKE_MULTIPLIER) && configMap.get(KEY_SPIKE_MULTIPLIER) != null)
                    numConfig.spikeMultiplier(((Number) configMap.get(KEY_SPIKE_MULTIPLIER)).doubleValue());

                // Some setters (constant) switch the pattern: the selected pattern wins over leftover keys
                GenerationPattern numPattern = explicitPattern(configMap);
                if (numPattern != null) {
                    numConfig.pattern(numPattern);
                }
                return numConfig;

            case STRING:
                StringVariableConfig strConfig = createString(id);
                if (configMap.containsKey("fixedLength"))
                    strConfig.fixedSize(((Number) configMap.get("fixedLength")).intValue());
                if (configMap.containsKey("regexPattern"))
                    strConfig.regex((String) configMap.get("regexPattern"));
                if (configMap.containsKey(KEY_PATTERN)) {
                    try {
                        strConfig.pattern(GenerationPattern.valueOf(((String) configMap.get(KEY_PATTERN)).toUpperCase()));
                    } catch (Exception e) {
                        // ignore or default
                    }
                }
                if (configMap.containsKey(KEY_CONSTANT_VALUE))
                    strConfig.constant((String) configMap.get(KEY_CONSTANT_VALUE));
                if (configMap.containsKey("template"))
                    strConfig.template((String) configMap.get("template"));
                if (configMap.containsKey("formattedMaskType"))
                    strConfig.formattedMaskType((String) configMap.get("formattedMaskType"));
                if (configMap.containsKey("customMask"))
                    strConfig.customMask((String) configMap.get("customMask"));
                if (configMap.containsKey("alphanumericCase"))
                    strConfig.alphanumericCase((String) configMap.get("alphanumericCase"));
                if (configMap.containsKey(KEY_CORRUPTION_ENABLED) && configMap.get(KEY_CORRUPTION_ENABLED) != null)
                    strConfig.corruptionEnabled((Boolean) configMap.get(KEY_CORRUPTION_ENABLED));
                if (configMap.containsKey(KEY_CORRUPTION_PROBABILITY) && configMap.get(KEY_CORRUPTION_PROBABILITY) != null)
                    strConfig.corruptionProbability(((Number) configMap.get(KEY_CORRUPTION_PROBABILITY)).doubleValue());
                if (configMap.containsKey("corruptionMode"))
                    strConfig.corruptionMode((String) configMap.get("corruptionMode"));
                if (configMap.containsKey(KEY_CORRUPTION_MAGNITUDE) && configMap.get(KEY_CORRUPTION_MAGNITUDE) != null)
                    strConfig.corruptionMagnitude(((Number) configMap.get(KEY_CORRUPTION_MAGNITUDE)).intValue());
                // constant/template/mask setters switch the pattern: the selected pattern wins over leftover keys
                GenerationPattern strPattern = explicitPattern(configMap);
                if (strPattern != null) {
                    strConfig.pattern(strPattern);
                }
                return strConfig;

            case LIST:
                ListVariableConfig listConfig = createList(id);
                if (configMap.containsKey(KEY_ITEMS) && configMap.get(KEY_ITEMS) instanceof List) {
                    List<?> rawItems = (List<?>) configMap.get(KEY_ITEMS);
                    List<ListVariableConfig.ListItem> parsedItems = new ArrayList<>();
                    for (Object rawItem : rawItems) {
                        if (rawItem instanceof Map) {
                            Map<?, ?> itemMap = (Map<?, ?>) rawItem;
                            String itemId = itemMap.containsKey("id") ? String.valueOf(itemMap.get("id")) : null;
                            Object val = itemMap.get("value");
                            double weight = itemMap.containsKey("weight") ? ((Number) itemMap.get("weight")).doubleValue() : 1.0;
                            ListVariableConfig.ListItem item = new ListVariableConfig.ListItem(itemId, val, weight);

                            // The UI keeps a default embeddedConfig on literal items: isEmbedded decides when present
                            boolean literalItem = Boolean.FALSE.equals(itemMap.get("isEmbedded"));
                            if (!literalItem && itemMap.containsKey(KEY_EMBEDDED_CONFIG) && itemMap.get(KEY_EMBEDDED_CONFIG) instanceof Map) {
                                @SuppressWarnings("unchecked")
                                Map<String, Object> subMap = (Map<String, Object>) itemMap.get(KEY_EMBEDDED_CONFIG);
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
                if (configMap.containsKey(KEY_TRANSITION_MATRIX) && configMap.get(KEY_TRANSITION_MATRIX) instanceof Map) {
                    @SuppressWarnings("unchecked")
                    Map<String, Map<String, Object>> rawMatrix = (Map<String, Map<String, Object>>) configMap.get(KEY_TRANSITION_MATRIX);
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
                if (configMap.containsKey(KEY_SELECTION_STRATEGY) && configMap.get(KEY_SELECTION_STRATEGY) != null) {
                    try {
                        listConfig.selectionStrategy(ListVariableConfig.SelectionStrategy.valueOf(((String) configMap.get(KEY_SELECTION_STRATEGY)).toUpperCase()));
                    } catch (Exception e) {
                        // ignore or default
                    }
                }
                if (configMap.containsKey(KEY_ITEM_ORDER) && configMap.get(KEY_ITEM_ORDER) instanceof List) {
                    List<?> rawOrder = (List<?>) configMap.get(KEY_ITEM_ORDER);
                    List<String> parsedOrder = new ArrayList<>();
                    for (Object obj : rawOrder) {
                        if (obj != null) parsedOrder.add(String.valueOf(obj));
                    }
                    listConfig.setItemOrder(parsedOrder);
                }
                return listConfig;

            case BOOLEAN:
                BooleanVariableConfig boolConfig = createBoolean(id);
                if (configMap.containsKey(KEY_PATTERN) && configMap.get(KEY_PATTERN) != null) {
                    try {
                        boolConfig.pattern(GenerationPattern.valueOf(((String) configMap.get(KEY_PATTERN)).toUpperCase()));
                    } catch (Exception ignored) {}
                }
                if (configMap.containsKey(KEY_CURRENT_VALUE) && configMap.get(KEY_CURRENT_VALUE) != null)
                    boolConfig.constantValue((Boolean) configMap.get(KEY_CURRENT_VALUE));
                if (configMap.containsKey(KEY_ON_DURATION_TICKS) && configMap.get(KEY_ON_DURATION_TICKS) != null)
                    boolConfig.onDurationTicks(((Number) configMap.get(KEY_ON_DURATION_TICKS)).intValue());
                if (configMap.containsKey(KEY_OFF_DURATION_TICKS) && configMap.get(KEY_OFF_DURATION_TICKS) != null)
                    boolConfig.offDurationTicks(((Number) configMap.get(KEY_OFF_DURATION_TICKS)).intValue());
                if (configMap.containsKey(KEY_ALTERNATION_INTERVAL) && configMap.get(KEY_ALTERNATION_INTERVAL) != null)
                    boolConfig.alternationInterval(((Number) configMap.get(KEY_ALTERNATION_INTERVAL)).intValue());
                if (configMap.containsKey(KEY_TRUE_PROBABILITY) && configMap.get(KEY_TRUE_PROBABILITY) != null)
                    boolConfig.trueProbability(((Number) configMap.get(KEY_TRUE_PROBABILITY)).doubleValue());
                if (configMap.containsKey(KEY_FLIP_INTERVAL) && configMap.get(KEY_FLIP_INTERVAL) != null)
                    boolConfig.flipInterval(((Number) configMap.get(KEY_FLIP_INTERVAL)).intValue());
                if (configMap.containsKey(KEY_BURST_DURATION_TICKS) && configMap.get(KEY_BURST_DURATION_TICKS) != null)
                    boolConfig.burstDurationTicks(((Number) configMap.get(KEY_BURST_DURATION_TICKS)).intValue());
                if (configMap.containsKey(KEY_BURST_IDLE_TICKS) && configMap.get(KEY_BURST_IDLE_TICKS) != null)
                    boolConfig.burstIdleTicks(((Number) configMap.get(KEY_BURST_IDLE_TICKS)).intValue());
                if (configMap.containsKey(KEY_P_TRUE_TO_TRUE) && configMap.get(KEY_P_TRUE_TO_TRUE) != null)
                    boolConfig.pTrueToTrue(((Number) configMap.get(KEY_P_TRUE_TO_TRUE)).doubleValue());
                if (configMap.containsKey(KEY_P_FALSE_TO_TRUE) && configMap.get(KEY_P_FALSE_TO_TRUE) != null)
                    boolConfig.pFalseToTrue(((Number) configMap.get(KEY_P_FALSE_TO_TRUE)).doubleValue());
                return boolConfig;

            case TEMPORAL:
                TemporalVariableConfig dateConfig = createTemporal(id);
                if (configMap.containsKey("dateFormat"))
                    dateConfig.dateFormat((String) configMap.get("dateFormat"));
                if (configMap.containsKey("timeZone"))
                    dateConfig.timeZone((String) configMap.get("timeZone"));
                if (configMap.containsKey("temporalType"))
                    dateConfig.temporalType((String) configMap.get("temporalType"));
                if (configMap.containsKey(KEY_TIME_ADVANCE_MODE) && configMap.get(KEY_TIME_ADVANCE_MODE) != null)
                    dateConfig.timeAdvanceMode(String.valueOf(configMap.get(KEY_TIME_ADVANCE_MODE)));
                if (configMap.containsKey(KEY_CLOCK_DRIFT_ENABLED) && configMap.get(KEY_CLOCK_DRIFT_ENABLED) != null)
                    dateConfig.clockDriftEnabled((Boolean) configMap.get(KEY_CLOCK_DRIFT_ENABLED));
                if (configMap.containsKey(KEY_MAX_DRIFT_MS) && configMap.get(KEY_MAX_DRIFT_MS) != null)
                    dateConfig.maxDriftMs(((Number) configMap.get(KEY_MAX_DRIFT_MS)).longValue());
                if (configMap.containsKey(KEY_DRIFT_TYPE) && configMap.get(KEY_DRIFT_TYPE) != null)
                    dateConfig.driftType(String.valueOf(configMap.get(KEY_DRIFT_TYPE)));
                if (configMap.containsKey(KEY_DRIFT_RATE_MS_PER_TICK) && configMap.get(KEY_DRIFT_RATE_MS_PER_TICK) != null)
                    dateConfig.driftRateMsPerTick(((Number) configMap.get(KEY_DRIFT_RATE_MS_PER_TICK)).doubleValue());
                if (configMap.containsKey(KEY_BACKFILL_STRATEGY) && configMap.get(KEY_BACKFILL_STRATEGY) != null)
                    dateConfig.backfillStrategy(String.valueOf(configMap.get(KEY_BACKFILL_STRATEGY)));
                if (configMap.containsKey(KEY_INCREMENT_MS) && configMap.get(KEY_INCREMENT_MS) != null)
                    dateConfig.incrementMillis(((Number) configMap.get(KEY_INCREMENT_MS)).longValue());
                if (configMap.containsKey(KEY_START_DATE) && configMap.get(KEY_START_DATE) != null) {
                    try {
                        dateConfig.startDate(java.time.Instant.parse(String.valueOf(configMap.get(KEY_START_DATE))));
                    } catch (Exception ignored) {}
                }
                if (configMap.containsKey(KEY_FIXED_DATE) && configMap.get(KEY_FIXED_DATE) != null) {
                    try {
                        dateConfig.fixedDate(java.time.Instant.parse(String.valueOf(configMap.get(KEY_FIXED_DATE))));
                    } catch (Exception ignored) {}
                }
                if (configMap.containsKey(KEY_RANGE_START) && configMap.get(KEY_RANGE_START) != null) {
                    try {
                        java.time.Instant rStart = java.time.Instant.parse(String.valueOf(configMap.get(KEY_RANGE_START)));
                        java.time.Instant rEnd = configMap.containsKey(KEY_RANGE_END) && configMap.get(KEY_RANGE_END) != null
                            ? java.time.Instant.parse(String.valueOf(configMap.get(KEY_RANGE_END)))
                            : rStart.plusSeconds(3600);
                        dateConfig.range(rStart, rEnd);
                    } catch (Exception ignored) {}
                }
                return dateConfig;

            case POINT:
                PointVariableConfig pointConfig = createPoint(id);
                if (configMap.containsKey(KEY_PATTERN)) {
                    try {
                        pointConfig.pattern(GenerationPattern.valueOf(configMap.get(KEY_PATTERN).toString().toUpperCase()));
                    } catch (Exception ignored) {}
                }
                if (configMap.containsKey("coordinateSystem")) {
                    try {
                        pointConfig.coordinateSystem(CoordinateSystem.valueOf(configMap.get("coordinateSystem").toString()));
                    } catch (Exception ignored) {}
                }
                if (configMap.containsKey("geospatialFormat")) {
                    try {
                        pointConfig.geospatialFormat(GeospatialFormat.valueOf(configMap.get("geospatialFormat").toString()));
                    } catch (Exception ignored) {}
                }
                if (configMap.containsKey("boundaryBehavior")) {
                    try {
                        pointConfig.boundaryBehavior(BoundaryBehavior.valueOf(configMap.get("boundaryBehavior").toString()));
                    } catch (Exception ignored) {}
                }
                if (configMap.get("fixedPoint") instanceof Map<?, ?> fpMap) {
                    double fx = fpMap.containsKey("x") ? ((Number) fpMap.get("x")).doubleValue() : (fpMap.containsKey("lat") ? ((Number) fpMap.get("lat")).doubleValue() : 0.0);
                    double fy = fpMap.containsKey("y") ? ((Number) fpMap.get("y")).doubleValue() : (fpMap.containsKey("lon") ? ((Number) fpMap.get("lon")).doubleValue() : 0.0);
                    double fz = fpMap.containsKey("z") ? ((Number) fpMap.get("z")).doubleValue() : (fpMap.containsKey("alt") ? ((Number) fpMap.get("alt")).doubleValue() : 0.0);
                    pointConfig.fixedPoint(fx, fy, fz);
                }
                // The editor stores the route as "waypoints"; "path" is the legacy key
                Object waypointsObj = configMap.containsKey("waypoints") ? configMap.get("waypoints") : configMap.get("path");
                if (waypointsObj instanceof List<?> pathList) {
                    for (Object item : pathList) {
                        if (item instanceof Map<?, ?> ptMap) {
                            double[] wp = parsePointCoords(ptMap);
                            pointConfig.addPathPoint(wp[0], wp[1], wp[2]);
                        }
                    }
                }
                if (configMap.get("loopPath") != null) {
                    pointConfig.loopPath(parseBooleanHelper(configMap.get("loopPath"), true));
                }
                if (configMap.containsKey("maxStepDistance"))
                    pointConfig.maxStepDistance(((Number) configMap.get("maxStepDistance")).doubleValue());
                if (configMap.containsKey("inertia"))
                    pointConfig.inertia(((Number) configMap.get("inertia")).doubleValue());
                // The orbit centre and radius may grow the bounding box to fit the orbit; range() below
                // runs afterwards, so the region configured in the editor always wins
                if (configMap.get("orbitCenter") instanceof Map<?, ?> ocMap) {
                    double[] oc = parsePointCoords(ocMap);
                    pointConfig.orbitCenter(oc[0], oc[1], oc[2]);
                }
                if (configMap.containsKey("orbitRadius"))
                    pointConfig.orbitRadius(((Number) configMap.get("orbitRadius")).doubleValue());
                if (configMap.containsKey("angularSpeed"))
                    pointConfig.angularSpeed(((Number) configMap.get("angularSpeed")).doubleValue());
                if (configMap.containsKey("spiralRate"))
                    pointConfig.spiralRate(((Number) configMap.get("spiralRate")).doubleValue());
                if (configMap.containsKey("jitterRadius"))
                    pointConfig.jitterRadius(((Number) configMap.get("jitterRadius")).doubleValue());
                if (configMap.containsKey("gpsNoiseEnabled"))
                    pointConfig.gpsNoiseEnabled(Boolean.TRUE.equals(configMap.get("gpsNoiseEnabled")));
                if (configMap.get(KEY_INTERPOLATION_STEPS) != null)
                    pointConfig.interpolationSteps(Math.max(1, parseIntHelper(configMap.get(KEY_INTERPOLATION_STEPS), 1)));

                // 3D shape: the UI stores the type in lower case ("sphere"); unknown types ("custom") keep CUBE
                if (configMap.get("shape3DType") != null) {
                    try {
                        pointConfig.shape3DType(PointVariableConfig.Shape3DType.valueOf(
                                configMap.get("shape3DType").toString().trim().toUpperCase(java.util.Locale.ROOT)));
                    } catch (IllegalArgumentException ignored) {}
                }
                if (configMap.get("shape3DWidth") != null)
                    pointConfig.shape3DWidth(parseDoubleHelper(configMap.get("shape3DWidth"), 100.0));
                if (configMap.get("shape3DLength") != null)
                    pointConfig.shape3DLength(parseDoubleHelper(configMap.get("shape3DLength"), 100.0));
                if (configMap.get("shape3DHeight") != null)
                    pointConfig.shape3DHeight(parseDoubleHelper(configMap.get("shape3DHeight"), 100.0));
                if (configMap.get("shape3DRadius") != null)
                    pointConfig.shape3DRadius(parseDoubleHelper(configMap.get("shape3DRadius"), 50.0));

                if (configMap.containsKey("altitudeUnit")) {
                    try {
                        pointConfig.altitudeUnit(PointVariableConfig.AltitudeUnit.valueOf(configMap.get("altitudeUnit").toString().toUpperCase()));
                    } catch (Exception ignored) {}
                }
                if (configMap.containsKey("altitudeReference")) {
                    try {
                        pointConfig.altitudeReference(PointVariableConfig.AltitudeReference.valueOf(configMap.get("altitudeReference").toString().toUpperCase()));
                    } catch (Exception ignored) {}
                }
                if (configMap.containsKey("altitudePattern")) {
                    try {
                        pointConfig.altitudePattern(PointVariableConfig.AltitudePattern.valueOf(configMap.get("altitudePattern").toString().toUpperCase()));
                    } catch (Exception ignored) {}
                }
                if (configMap.containsKey(KEY_INITIAL_ALTITUDE) && configMap.get(KEY_INITIAL_ALTITUDE) != null) {
                    pointConfig.initialAltitude(((Number) configMap.get(KEY_INITIAL_ALTITUDE)).doubleValue());
                }
                if (configMap.containsKey("maxVerticalStep")) {
                    pointConfig.maxVerticalStep(((Number) configMap.get("maxVerticalStep")).doubleValue());
                }
                if (configMap.containsKey("altitudeOscillationSpeed")) {
                    pointConfig.altitudeOscillationSpeed(((Number) configMap.get("altitudeOscillationSpeed")).doubleValue());
                }

                // Deserialization of minPoint / maxPoint range bounds (defaults match the UI: 0..100 on every axis)
                double minX = 0.0, maxX = 100.0, minY = 0.0, maxY = 100.0, minZ = 0.0, maxZ = 100.0;

                if (configMap.get("minPoint") instanceof Map<?, ?> minMap) {
                    minX = minMap.containsKey("x") ? ((Number) minMap.get("x")).doubleValue() : (minMap.containsKey("lat") ? ((Number) minMap.get("lat")).doubleValue() : 0.0);
                    minY = minMap.containsKey("y") ? ((Number) minMap.get("y")).doubleValue() : (minMap.containsKey("lon") ? ((Number) minMap.get("lon")).doubleValue() : 0.0);
                    minZ = minMap.containsKey("z") ? ((Number) minMap.get("z")).doubleValue() : (minMap.containsKey("alt") ? ((Number) minMap.get("alt")).doubleValue() : 0.0);
                }
                if (configMap.get("maxPoint") instanceof Map<?, ?> maxMap) {
                    maxX = maxMap.containsKey("x") ? ((Number) maxMap.get("x")).doubleValue() : (maxMap.containsKey("lat") ? ((Number) maxMap.get("lat")).doubleValue() : 100.0);
                    maxY = maxMap.containsKey("y") ? ((Number) maxMap.get("y")).doubleValue() : (maxMap.containsKey("lon") ? ((Number) maxMap.get("lon")).doubleValue() : 100.0);
                    maxZ = maxMap.containsKey("z") ? ((Number) maxMap.get("z")).doubleValue() : (maxMap.containsKey("alt") ? ((Number) maxMap.get("alt")).doubleValue() : 100.0);
                }

                if (configMap.containsKey("minLat")) { minX = ((Number) configMap.get("minLat")).doubleValue(); }
                if (configMap.containsKey("maxLat")) { maxX = ((Number) configMap.get("maxLat")).doubleValue(); }
                if (configMap.containsKey("minLon")) { minY = ((Number) configMap.get("minLon")).doubleValue(); }
                if (configMap.containsKey("maxLon")) { maxY = ((Number) configMap.get("maxLon")).doubleValue(); }
                if (configMap.containsKey("minAlt")) { minZ = ((Number) configMap.get("minAlt")).doubleValue(); }
                if (configMap.containsKey("maxAlt")) { maxZ = ((Number) configMap.get("maxAlt")).doubleValue(); }
                if (configMap.containsKey("minZ")) { minZ = ((Number) configMap.get("minZ")).doubleValue(); }
                if (configMap.containsKey("maxZ")) { maxZ = ((Number) configMap.get("maxZ")).doubleValue(); }

                // Without range keys the UI shows 0..100 on every axis: generate in that same region
                pointConfig.range(minX, maxX, minY, maxY, minZ, maxZ);

                if (configMap.get("boundaryPolygon") instanceof List<?> polyList) {
                    for (Object item : polyList) {
                        if (item instanceof Map<?, ?> ptMap) {
                            double px = ptMap.containsKey("x") ? ((Number) ptMap.get("x")).doubleValue() : (ptMap.containsKey("lat") ? ((Number) ptMap.get("lat")).doubleValue() : 0.0);
                            double py = ptMap.containsKey("y") ? ((Number) ptMap.get("y")).doubleValue() : (ptMap.containsKey("lon") ? ((Number) ptMap.get("lon")).doubleValue() : 0.0);
                            double pz = ptMap.containsKey("z") ? ((Number) ptMap.get("z")).doubleValue() : (ptMap.containsKey("alt") ? ((Number) ptMap.get("alt")).doubleValue() : 0.0);
                            pointConfig.addBoundaryPolygonPoint(px, py, pz);
                        }
                    }
                    // In 3D the shape is the region: the polygon does not re-range the bounding box
                    if (!pointConfig.getBoundaryPolygon().isEmpty()
                            && pointConfig.getCoordinateSystem() != CoordinateSystem.CARTESIAN_3D) {
                        double pMinX = Double.MAX_VALUE, pMaxX = -Double.MAX_VALUE;
                        double pMinY = Double.MAX_VALUE, pMaxY = -Double.MAX_VALUE;
                        for (PointVariableConfig.Point3D pt : pointConfig.getBoundaryPolygon()) {
                            pMinX = Math.min(pMinX, pt.x);
                            pMaxX = Math.max(pMaxX, pt.x);
                            pMinY = Math.min(pMinY, pt.y);
                            pMaxY = Math.max(pMaxY, pt.y);
                        }
                        // Always preserve user-configured minZ and maxZ altitude range
                        pointConfig.range(pMinX, pMaxX, pMinY, pMaxY, minZ, maxZ);
                    }
                }

                if (configMap.get("obstacles") instanceof List<?> obsList) {
                    for (Object item : obsList) {
                        if (item instanceof Map<?, ?> obsMap) {
                            String obsName = obsMap.containsKey("name") ? obsMap.get("name").toString() : "Obstacle";
                            String typeStr = obsMap.containsKey("type") ? obsMap.get("type").toString() : "WALL_SEGMENT";
                            BoundaryObstacle.ObstacleType obsType;
                            try {
                                obsType = BoundaryObstacle.ObstacleType.valueOf(typeStr.toUpperCase());
                            } catch (Exception ignored) {
                                obsType = BoundaryObstacle.ObstacleType.WALL_SEGMENT;
                            }
                            BoundaryObstacle obstacle = new BoundaryObstacle().name(obsName).type(obsType);
                            if (obsMap.containsKey("id") && obsMap.get("id") != null) {
                                obstacle.id(obsMap.get("id").toString());
                            }
                            if (obsMap.containsKey(KEY_ENABLED) && obsMap.get(KEY_ENABLED) != null) {
                                obstacle.enabled(Boolean.TRUE.equals(obsMap.get(KEY_ENABLED)));
                            }
                            if (obsMap.get("points") instanceof List<?> ptsList) {
                                for (Object pItem : ptsList) {
                                    if (pItem instanceof Map<?, ?> ptMap) {
                                        double px = ptMap.containsKey("x") ? ((Number) ptMap.get("x")).doubleValue() : 0.0;
                                        double py = ptMap.containsKey("y") ? ((Number) ptMap.get("y")).doubleValue() : 0.0;
                                        double pz = ptMap.containsKey("z") ? ((Number) ptMap.get("z")).doubleValue() : 0.0;
                                        obstacle.addPoint(px, py, pz);
                                    }
                                }
                            }
                            pointConfig.addObstacle(obstacle);
                        }
                    }
                }

                // Deserialization of Graph Route Nodes (only coordinates strictly required; auto-assign id/name if omitted)
                Object nodesObj = configMap.containsKey("graphNodes") ? configMap.get("graphNodes") : configMap.get("nodes");
                if (nodesObj instanceof List<?> gNodesList) {
                    int nodeIdx = 1;
                    for (Object item : gNodesList) {
                        if (item instanceof Map<?, ?> nMap) {
                            String nId = nMap.containsKey("id") && nMap.get("id") != null ? nMap.get("id").toString() : "node-" + nodeIdx;
                            String nName = nMap.containsKey("name") && nMap.get("name") != null ? nMap.get("name").toString() : nId;
                            
                            double nx = nMap.containsKey("x") ? ((Number) nMap.get("x")).doubleValue() : (nMap.containsKey("lat") ? ((Number) nMap.get("lat")).doubleValue() : (nMap.containsKey("latitude") ? ((Number) nMap.get("latitude")).doubleValue() : 0.0));
                            double ny = nMap.containsKey("y") ? ((Number) nMap.get("y")).doubleValue() : (nMap.containsKey("lon") ? ((Number) nMap.get("lon")).doubleValue() : (nMap.containsKey("lng") ? ((Number) nMap.get("lng")).doubleValue() : (nMap.containsKey("longitude") ? ((Number) nMap.get("longitude")).doubleValue() : 0.0)));
                            double nz = nMap.containsKey("z") ? ((Number) nMap.get("z")).doubleValue() : (nMap.containsKey("alt") ? ((Number) nMap.get("alt")).doubleValue() : (nMap.containsKey("altitude") ? ((Number) nMap.get("altitude")).doubleValue() : 0.0));

                            pointConfig.addGraphNode(new com.gensynth.core.flow.variables.config.GraphNode(nId, nName, nx, ny, nz));
                            nodeIdx++;
                        }
                    }
                }

                // Deserialization of Graph Route Edges
                Object edgesObj = configMap.containsKey("graphEdges") ? configMap.get("graphEdges") : configMap.get("edges");
                if (edgesObj instanceof List<?> gEdgesList) {
                    int edgeIdx = 1;
                    for (Object item : gEdgesList) {
                        if (item instanceof Map<?, ?> eMap) {
                            String eId = eMap.containsKey("id") && eMap.get("id") != null ? eMap.get("id").toString() : "edge-" + edgeIdx;
                            String fromId = eMap.containsKey(KEY_FROM_NODE_ID) && eMap.get(KEY_FROM_NODE_ID) != null ? eMap.get(KEY_FROM_NODE_ID).toString() : (eMap.containsKey(KEY_SOURCE_ID) && eMap.get(KEY_SOURCE_ID) != null ? eMap.get(KEY_SOURCE_ID).toString() : (eMap.containsKey("from") && eMap.get("from") != null ? eMap.get("from").toString() : ""));
                            String toId = eMap.containsKey(KEY_TO_NODE_ID) && eMap.get(KEY_TO_NODE_ID) != null ? eMap.get(KEY_TO_NODE_ID).toString() : (eMap.containsKey(KEY_TARGET_ID) && eMap.get(KEY_TARGET_ID) != null ? eMap.get(KEY_TARGET_ID).toString() : (eMap.containsKey("to") && eMap.get("to") != null ? eMap.get("to").toString() : ""));
                            boolean bi = !eMap.containsKey("bidirectional") || Boolean.TRUE.equals(eMap.get("bidirectional"));

                            pointConfig.addGraphEdge(new com.gensynth.core.flow.variables.config.GraphEdge(eId, fromId, toId, bi));
                            edgeIdx++;
                        }
                    }
                }

                // Deserialization of Graph Route Navigation & Parameters
                if (configMap.containsKey(KEY_GRAPH_NAVIGATION_MODE) && configMap.get(KEY_GRAPH_NAVIGATION_MODE) != null) {
                    try {
                        pointConfig.graphNavigationMode(PointVariableConfig.GraphNavigationMode.valueOf(configMap.get(KEY_GRAPH_NAVIGATION_MODE).toString().toUpperCase()));
                    } catch (Exception ignored) {}
                } else if (configMap.containsKey(KEY_NAVIGATION_MODE) && configMap.get(KEY_NAVIGATION_MODE) != null) {
                    try {
                        pointConfig.graphNavigationMode(PointVariableConfig.GraphNavigationMode.valueOf(configMap.get(KEY_NAVIGATION_MODE).toString().toUpperCase()));
                    } catch (Exception ignored) {}
                }

                Object seqObj = configMap.containsKey("graphSequence") ? configMap.get("graphSequence") : configMap.get("sequence");
                if (seqObj instanceof List<?> seqList) {
                    List<String> sequence = new ArrayList<>();
                    for (Object item : seqList) {
                        if (item != null) sequence.add(item.toString());
                    }
                    pointConfig.graphSequence(sequence);
                }

                Object loopObj = configMap.containsKey("graphLoopSequence") ? configMap.get("graphLoopSequence") : configMap.get("loopSequence");
                if (loopObj != null) {
                    pointConfig.graphLoopSequence(parseBooleanHelper(loopObj, false));
                }

                Object stopProbObj = configMap.containsKey("graphStopProbability") ? configMap.get("graphStopProbability") : configMap.get("stopProbability");
                if (stopProbObj == null) stopProbObj = configMap.get("pauseProbability");
                if (stopProbObj != null) {
                    pointConfig.graphStopProbability(parseDoubleHelper(stopProbObj, 0.0));
                }

                Object stopTicksObj = configMap.containsKey("graphStopTicks") ? configMap.get("graphStopTicks") : configMap.get("stopTicks");
                if (stopTicksObj == null) stopTicksObj = configMap.get("pauseTicks");
                if (stopTicksObj == null) stopTicksObj = configMap.get("pauseDurationTicks");
                if (stopTicksObj != null) {
                    pointConfig.graphStopTicks(parseIntHelper(stopTicksObj, 0));
                }

                Object preventCyclesObj = configMap.containsKey("graphPreventCycles") ? configMap.get("graphPreventCycles") : configMap.get("preventCycles");
                if (preventCyclesObj == null) preventCyclesObj = configMap.get("antiBacktracking");
                if (preventCyclesObj != null) {
                    pointConfig.graphPreventCycles(parseBooleanHelper(preventCyclesObj, true));
                }

                Object stepsObj = configMap.containsKey("graphInterpolationSteps") ? configMap.get("graphInterpolationSteps") : configMap.get("stepsPerEdge");
                if (stepsObj != null) {
                    pointConfig.graphInterpolationSteps(parseIntHelper(stepsObj, 1));
                } else if (configMap.get(KEY_INTERPOLATION_STEPS) != null) {
                    // Fallback to the waypoint steps, clamped like them
                    pointConfig.graphInterpolationSteps(Math.max(1, parseIntHelper(configMap.get(KEY_INTERPOLATION_STEPS), 1)));
                }

                return pointConfig;

            default:
                throw new IllegalArgumentException("Unknown variable type: " + type);
        }
    }

    /**
     * Reads x/y/z (or lat/lon/alt) from a point map; missing coordinates are 0.
     */
    private static double[] parsePointCoords(Map<?, ?> ptMap) {
        Object x = ptMap.containsKey("x") ? ptMap.get("x") : ptMap.get("lat");
        Object y = ptMap.containsKey("y") ? ptMap.get("y") : ptMap.get("lon");
        Object z = ptMap.containsKey("z") ? ptMap.get("z") : ptMap.get("alt");
        return new double[] { parseDoubleHelper(x, 0.0), parseDoubleHelper(y, 0.0), parseDoubleHelper(z, 0.0) };
    }

    private static double parseDoubleHelper(Object val, double defaultValue) {
        if (val == null) return defaultValue;
        if (val instanceof Number n) return n.doubleValue();
        try {
            String s = val.toString().trim().replace(',', '.');
            return Double.parseDouble(s);
        } catch (Exception e) {
            return defaultValue;
        }
    }

    private static int parseIntHelper(Object val, int defaultValue) {
        if (val == null) return defaultValue;
        if (val instanceof Number n) return n.intValue();
        try {
            String s = val.toString().trim();
            return Integer.parseInt(s);
        } catch (Exception e) {
            return defaultValue;
        }
    }

    private static boolean parseBooleanHelper(Object val, boolean defaultValue) {
        if (val == null) return defaultValue;
        if (val instanceof Boolean b) return b;
        String s = val.toString().trim().toLowerCase();
        if ("true".equals(s) || "1".equals(s)) return true;
        if ("false".equals(s) || "0".equals(s)) return false;
        return defaultValue;
    }

    /**
     * Create configurable variable from configuration
     */
    public static ConfigurableVariable createFromConfig(VariableConfiguration config) {
        return new ConfigurableVariable(config);
    }
}
