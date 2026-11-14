package com.gensynth.core.flow.variables;

import com.gensynth.core.flow.variables.config.*;
import java.util.Map;
import java.util.HashMap;
import java.util.List;
import java.util.ArrayList;
import java.util.function.Consumer;

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
    private static final String KEY_CONDITIONAL_RULES = "conditionalRules";
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
    // Keys shared by the nested maps (points, list items, obstacles, graph nodes and edges)
    private static final String KEY_ID = "id";
    private static final String KEY_NAME = "name";
    private static final String KEY_TYPE = "type";
    private static final String KEY_X = "x";
    private static final String KEY_Y = "y";
    private static final String KEY_Z = "z";
    private static final String KEY_LAT = "lat";
    private static final String KEY_LON = "lon";
    private static final String KEY_ALT = "alt";

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
        if (finalConfig != null) {
            applyConditionalRules(finalConfig, configMap);
            applySourceListFields(finalConfig, configMap);
            List<String> errors = finalConfig.validate();
            if (!errors.isEmpty()) {
                throw new InvalidVariableConfigException(id, type, errors);
            }
        }
        return finalConfig;
    }

    /**
     * Sets the conditional rules of the map; a malformed rule list leaves the config without rules.
     */
    private static void applyConditionalRules(VariableConfiguration config, Map<String, Object> configMap) {
        if (!configMap.containsKey(KEY_CONDITIONAL_RULES)) {
            return;
        }
        try {
            config.setConditionalRules(parseConditionalRules(configMap.get(KEY_CONDITIONAL_RULES)));
        } catch (RuntimeException e) {
            // ignore parsing exceptions
        }
    }

    private static List<VariableConfiguration.ConditionalRule> parseConditionalRules(Object rulesObj) {
        List<VariableConfiguration.ConditionalRule> rulesList = new ArrayList<>();
        if (rulesObj instanceof List<?> rawRules) {
            for (Object item : rawRules) {
                if (item instanceof Map<?, ?> ruleMap) {
                    rulesList.add(conditionalRuleFromMap(ruleMap));
                }
            }
        }
        return rulesList;
    }

    private static VariableConfiguration.ConditionalRule conditionalRuleFromMap(Map<?, ?> ruleMap) {
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
            rule.overrides = new HashMap<>(ovr);
        }
        return rule;
    }

    private static void applySourceListFields(VariableConfiguration config, Map<String, Object> configMap) {
        // A list cannot inherit from another list: projects saved when it could keep only their own items
        if (config instanceof ListVariableConfig) {
            return;
        }
        ifPresent(configMap, KEY_SOURCE_LIST_VARIABLE_ID, v -> config.setSourceListVariableId(String.valueOf(v)));
        ifPresent(configMap, KEY_SOURCE_LIST_SELECTION_MODE, v -> config.setSourceListSelectionMode(String.valueOf(v)));
        ifPresent(configMap, KEY_SELECTED_LIST_ITEM_ID, v -> config.setSelectedListItemId(String.valueOf(v)));
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
        Map<String, Object> map = configMap != null ? configMap : Map.of();
        VariableType variableType = VariableType.fromName(type);
        if (variableType == null) {
            throw new IllegalArgumentException("Unknown variable type: " + type);
        }
        return switch (variableType) {
            case NUMERIC -> numericFromMap(id, map);
            case STRING -> stringFromMap(id, map);
            case LIST -> listFromMap(id, map);
            case BOOLEAN -> booleanFromMap(id, map);
            case TEMPORAL -> temporalFromMap(id, map);
            case POINT -> pointFromMap(id, map);
        };
    }

    // ---------------------------------------------------------------- map access helpers
    // Each parse line keeps the condition it always had: some only check the key (a null value
    // then fails as before), others also skip null values.

    /** Runs the setter with the value when the key exists, even if the value is null. */
    private static void ifKey(Map<String, Object> map, String key, Consumer<Object> setter) {
        if (map.containsKey(key)) {
            setter.accept(map.get(key));
        }
    }

    /** Runs the setter with the value when the key exists with a non-null value. */
    private static void ifPresent(Map<String, Object> map, String key, Consumer<Object> setter) {
        if (isPresent(map, key)) {
            setter.accept(map.get(key));
        }
    }

    private static boolean isPresent(Map<String, Object> map, String key) {
        return map.containsKey(key) && map.get(key) != null;
    }

    /** Like {@link #ifKey}, but an invalid value (bad cast, unknown enum name...) is ignored. */
    private static void ifKeyLenient(Map<String, Object> map, String key, Consumer<Object> setter) {
        if (map.containsKey(key)) {
            acceptLenient(setter, map.get(key));
        }
    }

    /** Like {@link #ifPresent}, but an invalid value (bad cast, unknown enum name...) is ignored. */
    private static void ifPresentLenient(Map<String, Object> map, String key, Consumer<Object> setter) {
        if (isPresent(map, key)) {
            acceptLenient(setter, map.get(key));
        }
    }

    private static void acceptLenient(Consumer<Object> setter, Object value) {
        try {
            setter.accept(value);
        } catch (RuntimeException ignored) {
            // Invalid value: the default is kept
        }
    }

    /** Value of the key if the map has it, otherwise the value of its legacy key. */
    private static Object valueOrLegacy(Map<String, Object> map, String key, String legacyKey) {
        return map.get(map.containsKey(key) ? key : legacyKey);
    }

    /**
     * Reads the number under the first of the keys the map contains.
     *
     * @return that number, or the default when the map has none of the keys
     */
    private static double numberAt(Map<?, ?> map, double defaultValue, String... keys) {
        for (String key : keys) {
            if (map.containsKey(key)) {
                return ((Number) map.get(key)).doubleValue();
            }
        }
        return defaultValue;
    }

    /**
     * Reads the text under the first of the keys that has a value.
     *
     * @return that text, or the default when none of the keys has a value
     */
    private static String textAt(Map<?, ?> map, String defaultValue, String... keys) {
        for (String key : keys) {
            Object value = map.get(key);
            if (value != null) {
                return value.toString();
            }
        }
        return defaultValue;
    }

    private static double asDouble(Object value) {
        return ((Number) value).doubleValue();
    }

    private static int asInt(Object value) {
        return ((Number) value).intValue();
    }

    private static long asLong(Object value) {
        return ((Number) value).longValue();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> asGraph(Object value) {
        return (List<Map<String, Object>>) value;
    }

    // ---------------------------------------------------------------- numeric

    private static NumericVariableConfig numericFromMap(String id, Map<String, Object> configMap) {
        NumericVariableConfig numConfig = createNumeric(id);
        applyNumericBase(configMap, numConfig);
        applyNumericSineAndDrift(configMap, numConfig);
        applyNumericNoiseAndSpikes(configMap, numConfig);
        // Some setters (constant) switch the pattern: the selected pattern wins over leftover keys
        GenerationPattern numPattern = explicitPattern(configMap);
        if (numPattern != null) {
            numConfig.pattern(numPattern);
        }
        return numConfig;
    }

    private static void applyNumericBase(Map<String, Object> configMap, NumericVariableConfig numConfig) {
        ifKey(configMap, "min", v -> numConfig.from(asDouble(v)));
        ifKey(configMap, "max", v -> numConfig.to(asDouble(v)));
        ifKey(configMap, "precision", v -> numConfig.precision((String) v));
        ifKey(configMap, "formula", v -> numConfig.formula((String) v));
        ifKey(configMap, "distribution", v -> numConfig.distribution((String) v));
        ifKeyLenient(configMap, KEY_PATTERN, v -> numConfig.pattern(GenerationPattern.valueOf(((String) v).toUpperCase())));
        ifKey(configMap, "decimalPlaces", v -> numConfig.decimalPlaces(asInt(v)));
        ifKey(configMap, "integerFormat", v -> numConfig.integerFormat((String) v));
        ifKey(configMap, "prefix", v -> numConfig.prefix((String) v));
        ifKey(configMap, "suffix", v -> numConfig.suffix((String) v));
        String initialKey = isPresent(configMap, KEY_INITIAL_VALUE) ? KEY_INITIAL_VALUE : KEY_INITIAL;
        ifPresent(configMap, initialKey, v -> numConfig.initial(asDouble(v)));
        ifPresent(configMap, "step", v -> numConfig.step(asDouble(v)));
        ifKey(configMap, KEY_CONSTANT_VALUE, v -> numConfig.constant(asDouble(v)));
        ifKey(configMap, "constantMargin", v -> numConfig.constantMargin(asDouble(v)));
        ifKey(configMap, "distributionType", v -> numConfig.distributionType((String) v));
        ifKey(configMap, "boundaryMode", v -> numConfig.boundaryMode((String) v));
        ifKey(configMap, "sequentialGraph", v -> numConfig.sequentialGraph(asGraph(v)));
        ifKey(configMap, "customDistributionGraph", v -> numConfig.customDistributionGraph(asGraph(v)));
    }

    private static void applyNumericSineAndDrift(Map<String, Object> configMap, NumericVariableConfig numConfig) {
        // Sinusoidal
        ifPresent(configMap, KEY_SINE_FREQUENCY, v -> numConfig.sineFrequency(asDouble(v)));
        ifPresent(configMap, KEY_SINE_AMPLITUDE, v -> numConfig.sineAmplitude(asDouble(v)));
        ifPresent(configMap, KEY_SINE_PHASE, v -> numConfig.sinePhase(asDouble(v)));
        ifPresent(configMap, KEY_SINE_OFFSET, v -> numConfig.sineOffset(asDouble(v)));
        // Drift
        ifPresent(configMap, KEY_DRIFT_RATE, v -> numConfig.driftRate(asDouble(v)));
        ifPresent(configMap, KEY_DRIFT_INITIAL_VALUE, v -> numConfig.driftInitialValue(asDouble(v)));
        ifKey(configMap, "driftLimitMode", v -> numConfig.driftLimitMode((String) v));
        // Virtual Clock
        ifPresent(configMap, KEY_SIMULATION_TIME_STEP, v -> numConfig.simulationTimeStep(asDouble(v)));
    }

    private static void applyNumericNoiseAndSpikes(Map<String, Object> configMap, NumericVariableConfig numConfig) {
        // Noise Layer
        ifPresent(configMap, KEY_NOISE_ENABLED, v -> numConfig.noiseEnabled((Boolean) v));
        ifKey(configMap, "noiseType", v -> numConfig.noiseType((String) v));
        ifPresent(configMap, KEY_NOISE_AMPLITUDE, v -> numConfig.noiseAmplitude(asDouble(v)));
        ifPresent(configMap, KEY_NOISE_STD_DEV, v -> numConfig.noiseStdDev(asDouble(v)));
        // Spike Layer
        ifPresent(configMap, KEY_SPIKE_ENABLED, v -> numConfig.spikeEnabled((Boolean) v));
        ifPresent(configMap, KEY_SPIKE_PROBABILITY, v -> numConfig.spikeProbability(asDouble(v)));
        ifKey(configMap, "spikeMode", v -> numConfig.spikeMode((String) v));
        ifPresent(configMap, KEY_SPIKE_MAGNITUDE, v -> numConfig.spikeMagnitude(asDouble(v)));
        ifPresent(configMap, KEY_SPIKE_MIN, v -> numConfig.spikeMin(asDouble(v)));
        ifPresent(configMap, KEY_SPIKE_MAX, v -> numConfig.spikeMax(asDouble(v)));
        ifPresent(configMap, KEY_SPIKE_MULTIPLIER, v -> numConfig.spikeMultiplier(asDouble(v)));
    }

    // ---------------------------------------------------------------- string

    private static StringVariableConfig stringFromMap(String id, Map<String, Object> configMap) {
        StringVariableConfig strConfig = createString(id);
        ifKey(configMap, "fixedLength", v -> strConfig.fixedSize(asInt(v)));
        ifKey(configMap, "regexPattern", v -> strConfig.regex((String) v));
        ifKeyLenient(configMap, KEY_PATTERN, v -> strConfig.pattern(GenerationPattern.valueOf(((String) v).toUpperCase())));
        ifKey(configMap, KEY_CONSTANT_VALUE, v -> strConfig.constant((String) v));
        ifKey(configMap, "template", v -> strConfig.template((String) v));
        ifKey(configMap, "formattedMaskType", v -> strConfig.formattedMaskType((String) v));
        ifKey(configMap, "customMask", v -> strConfig.customMask((String) v));
        ifKey(configMap, "alphanumericCase", v -> strConfig.alphanumericCase((String) v));
        ifPresent(configMap, KEY_CORRUPTION_ENABLED, v -> strConfig.corruptionEnabled((Boolean) v));
        ifPresent(configMap, KEY_CORRUPTION_PROBABILITY, v -> strConfig.corruptionProbability(asDouble(v)));
        ifKey(configMap, "corruptionMode", v -> strConfig.corruptionMode((String) v));
        ifPresent(configMap, KEY_CORRUPTION_MAGNITUDE, v -> strConfig.corruptionMagnitude(asInt(v)));
        // constant/template/mask setters switch the pattern: the selected pattern wins over leftover keys
        GenerationPattern strPattern = explicitPattern(configMap);
        if (strPattern != null) {
            strConfig.pattern(strPattern);
        }
        return strConfig;
    }

    // ---------------------------------------------------------------- list

    private static ListVariableConfig listFromMap(String id, Map<String, Object> configMap) {
        ListVariableConfig listConfig = createList(id);
        if (configMap.get(KEY_ITEMS) instanceof List<?> rawItems) {
            listConfig.items(parseListItems(id, rawItems));
        }
        if (configMap.get(KEY_TRANSITION_MATRIX) instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Map<String, Object>> rawMatrix = (Map<String, Map<String, Object>>) configMap.get(KEY_TRANSITION_MATRIX);
            listConfig.transitionMatrix(parseTransitionMatrix(rawMatrix));
        }
        ifPresentLenient(configMap, KEY_SELECTION_STRATEGY, v -> listConfig.selectionStrategy(
                ListVariableConfig.SelectionStrategy.valueOf(((String) v).toUpperCase())));
        if (configMap.get(KEY_ITEM_ORDER) instanceof List<?> rawOrder) {
            listConfig.setItemOrder(nonNullTexts(rawOrder));
        }
        return listConfig;
    }

    private static List<ListVariableConfig.ListItem> parseListItems(String listId, List<?> rawItems) {
        List<ListVariableConfig.ListItem> parsedItems = new ArrayList<>();
        for (Object rawItem : rawItems) {
            if (rawItem instanceof Map<?, ?> itemMap) {
                parsedItems.add(listItemFromMap(listId, itemMap));
            } else if (rawItem instanceof ListVariableConfig.ListItem listItem) {
                parsedItems.add(listItem);
            } else {
                parsedItems.add(new ListVariableConfig.ListItem(null, rawItem, 1.0));
            }
        }
        return parsedItems;
    }

    private static ListVariableConfig.ListItem listItemFromMap(String listId, Map<?, ?> itemMap) {
        String itemId = itemMap.containsKey(KEY_ID) ? String.valueOf(itemMap.get(KEY_ID)) : null;
        Object val = itemMap.get("value");
        double weight = itemMap.containsKey("weight") ? ((Number) itemMap.get("weight")).doubleValue() : 1.0;
        ListVariableConfig.ListItem item = new ListVariableConfig.ListItem(itemId, val, weight);

        // The UI keeps a default embeddedConfig on literal items: isEmbedded decides when present
        boolean literalItem = Boolean.FALSE.equals(itemMap.get("isEmbedded"));
        if (!literalItem && itemMap.get(KEY_EMBEDDED_CONFIG) instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> subMap = (Map<String, Object>) itemMap.get(KEY_EMBEDDED_CONFIG);
            String subType = itemMap.containsKey("embeddedType") ? String.valueOf(itemMap.get("embeddedType")) : "NUMERIC";
            if (subMap.containsKey(KEY_TYPE)) {
                subType = String.valueOf(subMap.get(KEY_TYPE));
            }
            String subId = listId + "_embedded_" + item.getId();
            item.setEmbeddedConfig(createFromMapInternal(subId, subType, subMap));
        }
        return item;
    }

    private static Map<String, Map<String, Double>> parseTransitionMatrix(Map<String, Map<String, Object>> rawMatrix) {
        Map<String, Map<String, Double>> matrix = new HashMap<>();
        for (Map.Entry<String, Map<String, Object>> entry : rawMatrix.entrySet()) {
            matrix.put(entry.getKey(), parseTransitionRow(entry.getValue()));
        }
        return matrix;
    }

    /** Probabilities of one matrix row; non-number cells are skipped and a null row is empty. */
    private static Map<String, Double> parseTransitionRow(Map<String, Object> rawRow) {
        Map<String, Double> innerMap = new HashMap<>();
        if (rawRow != null) {
            for (Map.Entry<String, Object> innerEntry : rawRow.entrySet()) {
                if (innerEntry.getValue() instanceof Number probability) {
                    innerMap.put(innerEntry.getKey(), probability.doubleValue());
                }
            }
        }
        return innerMap;
    }

    private static List<String> nonNullTexts(List<?> rawValues) {
        List<String> texts = new ArrayList<>();
        for (Object obj : rawValues) {
            if (obj != null) {
                texts.add(String.valueOf(obj));
            }
        }
        return texts;
    }

    // ---------------------------------------------------------------- boolean

    private static BooleanVariableConfig booleanFromMap(String id, Map<String, Object> configMap) {
        BooleanVariableConfig boolConfig = createBoolean(id);
        ifPresentLenient(configMap, KEY_PATTERN, v -> boolConfig.pattern(GenerationPattern.valueOf(((String) v).toUpperCase())));
        ifPresent(configMap, KEY_CURRENT_VALUE, v -> boolConfig.constantValue((Boolean) v));
        ifPresent(configMap, KEY_ON_DURATION_TICKS, v -> boolConfig.onDurationTicks(asInt(v)));
        ifPresent(configMap, KEY_OFF_DURATION_TICKS, v -> boolConfig.offDurationTicks(asInt(v)));
        ifPresent(configMap, KEY_ALTERNATION_INTERVAL, v -> boolConfig.alternationInterval(asInt(v)));
        ifPresent(configMap, KEY_TRUE_PROBABILITY, v -> boolConfig.trueProbability(asDouble(v)));
        ifPresent(configMap, KEY_FLIP_INTERVAL, v -> boolConfig.flipInterval(asInt(v)));
        ifPresent(configMap, KEY_BURST_DURATION_TICKS, v -> boolConfig.burstDurationTicks(asInt(v)));
        ifPresent(configMap, KEY_BURST_IDLE_TICKS, v -> boolConfig.burstIdleTicks(asInt(v)));
        ifPresent(configMap, KEY_P_TRUE_TO_TRUE, v -> boolConfig.pTrueToTrue(asDouble(v)));
        ifPresent(configMap, KEY_P_FALSE_TO_TRUE, v -> boolConfig.pFalseToTrue(asDouble(v)));
        return boolConfig;
    }

    // ---------------------------------------------------------------- temporal

    private static TemporalVariableConfig temporalFromMap(String id, Map<String, Object> configMap) {
        TemporalVariableConfig dateConfig = createTemporal(id);
        ifKey(configMap, "dateFormat", v -> dateConfig.dateFormat((String) v));
        ifKey(configMap, "timeZone", v -> dateConfig.timeZone((String) v));
        ifKey(configMap, "temporalType", v -> dateConfig.temporalType((String) v));
        ifPresent(configMap, KEY_TIME_ADVANCE_MODE, v -> dateConfig.timeAdvanceMode(String.valueOf(v)));
        ifPresent(configMap, KEY_CLOCK_DRIFT_ENABLED, v -> dateConfig.clockDriftEnabled((Boolean) v));
        ifPresent(configMap, KEY_MAX_DRIFT_MS, v -> dateConfig.maxDriftMs(asLong(v)));
        ifPresent(configMap, KEY_DRIFT_TYPE, v -> dateConfig.driftType(String.valueOf(v)));
        ifPresent(configMap, KEY_DRIFT_RATE_MS_PER_TICK, v -> dateConfig.driftRateMsPerTick(asDouble(v)));
        ifPresent(configMap, KEY_BACKFILL_STRATEGY, v -> dateConfig.backfillStrategy(String.valueOf(v)));
        ifPresent(configMap, KEY_INCREMENT_MS, v -> dateConfig.incrementMillis(asLong(v)));
        ifPresentLenient(configMap, KEY_START_DATE, v -> dateConfig.startDate(java.time.Instant.parse(String.valueOf(v))));
        ifPresentLenient(configMap, KEY_FIXED_DATE, v -> dateConfig.fixedDate(java.time.Instant.parse(String.valueOf(v))));
        ifPresentLenient(configMap, KEY_RANGE_START, v -> applyTemporalRange(configMap, dateConfig, v));
        return dateConfig;
    }

    /** Range from rangeStart to rangeEnd, or one hour long when rangeEnd is missing. */
    private static void applyTemporalRange(Map<String, Object> configMap, TemporalVariableConfig dateConfig, Object rawStart) {
        java.time.Instant rStart = java.time.Instant.parse(String.valueOf(rawStart));
        java.time.Instant rEnd = isPresent(configMap, KEY_RANGE_END)
                ? java.time.Instant.parse(String.valueOf(configMap.get(KEY_RANGE_END)))
                : rStart.plusSeconds(3600);
        dateConfig.range(rStart, rEnd);
    }

    // ---------------------------------------------------------------- point

    private static PointVariableConfig pointFromMap(String id, Map<String, Object> configMap) {
        PointVariableConfig pointConfig = createPoint(id);
        applyPointModes(configMap, pointConfig);
        applyPointPath(configMap, pointConfig);
        applyPointMotion(configMap, pointConfig);
        applyPointShape3D(configMap, pointConfig);
        applyPointAltitude(configMap, pointConfig);

        // Without range keys the UI shows 0..100 on every axis: generate in that same region
        double[] range = pointRange(configMap);
        pointConfig.range(range[0], range[1], range[2], range[3], range[4], range[5]);
        applyBoundaryPolygon(configMap, pointConfig, range[4], range[5]);
        applyObstacles(configMap, pointConfig);

        applyGraphNodes(configMap, pointConfig);
        applyGraphEdges(configMap, pointConfig);
        applyGraphNavigation(configMap, pointConfig);
        applyGraphStops(configMap, pointConfig);
        return pointConfig;
    }

    private static void applyPointModes(Map<String, Object> configMap, PointVariableConfig pointConfig) {
        ifKeyLenient(configMap, KEY_PATTERN, v -> pointConfig.pattern(GenerationPattern.valueOf(v.toString().toUpperCase())));
        ifKeyLenient(configMap, "coordinateSystem", v -> pointConfig.coordinateSystem(CoordinateSystem.valueOf(v.toString())));
        ifKeyLenient(configMap, "geospatialFormat", v -> pointConfig.geospatialFormat(GeospatialFormat.valueOf(v.toString())));
        ifKeyLenient(configMap, "boundaryBehavior", v -> pointConfig.boundaryBehavior(BoundaryBehavior.valueOf(v.toString())));
    }

    private static void applyPointPath(Map<String, Object> configMap, PointVariableConfig pointConfig) {
        if (configMap.get("fixedPoint") instanceof Map<?, ?> fpMap) {
            double[] fp = pointCoords(fpMap, 0.0);
            pointConfig.fixedPoint(fp[0], fp[1], fp[2]);
        }
        // The editor stores the route as "waypoints"; "path" is the legacy key
        if (valueOrLegacy(configMap, "waypoints", "path") instanceof List<?> pathList) {
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
        ifKey(configMap, "maxStepDistance", v -> pointConfig.maxStepDistance(asDouble(v)));
        ifKey(configMap, "inertia", v -> pointConfig.inertia(asDouble(v)));
    }

    private static void applyPointMotion(Map<String, Object> configMap, PointVariableConfig pointConfig) {
        // The orbit centre and radius may grow the bounding box to fit the orbit; range() runs
        // afterwards, so the region configured in the editor always wins
        if (configMap.get("orbitCenter") instanceof Map<?, ?> ocMap) {
            double[] oc = parsePointCoords(ocMap);
            pointConfig.orbitCenter(oc[0], oc[1], oc[2]);
        }
        ifKey(configMap, "orbitRadius", v -> pointConfig.orbitRadius(asDouble(v)));
        ifKey(configMap, "angularSpeed", v -> pointConfig.angularSpeed(asDouble(v)));
        ifKey(configMap, "spiralRate", v -> pointConfig.spiralRate(asDouble(v)));
        ifKey(configMap, "jitterRadius", v -> pointConfig.jitterRadius(asDouble(v)));
        ifKey(configMap, "gpsNoiseEnabled", v -> pointConfig.gpsNoiseEnabled(Boolean.TRUE.equals(v)));
        ifPresent(configMap, KEY_INTERPOLATION_STEPS,
                v -> pointConfig.interpolationSteps(Math.max(1, parseIntHelper(v, 1))));
    }

    private static void applyPointShape3D(Map<String, Object> configMap, PointVariableConfig pointConfig) {
        // 3D shape: the UI stores the type in lower case ("sphere"); unknown types ("custom") keep CUBE
        if (configMap.get("shape3DType") != null) {
            try {
                pointConfig.shape3DType(PointVariableConfig.Shape3DType.valueOf(
                        configMap.get("shape3DType").toString().trim().toUpperCase(java.util.Locale.ROOT)));
            } catch (IllegalArgumentException ignored) {
                // Invalid value: the default is kept
            }
        }
        ifPresent(configMap, "shape3DWidth", v -> pointConfig.shape3DWidth(parseDoubleHelper(v, 100.0)));
        ifPresent(configMap, "shape3DLength", v -> pointConfig.shape3DLength(parseDoubleHelper(v, 100.0)));
        ifPresent(configMap, "shape3DHeight", v -> pointConfig.shape3DHeight(parseDoubleHelper(v, 100.0)));
        ifPresent(configMap, "shape3DRadius", v -> pointConfig.shape3DRadius(parseDoubleHelper(v, 50.0)));
    }

    private static void applyPointAltitude(Map<String, Object> configMap, PointVariableConfig pointConfig) {
        ifKeyLenient(configMap, "altitudeUnit", v -> pointConfig.altitudeUnit(
                PointVariableConfig.AltitudeUnit.valueOf(v.toString().toUpperCase())));
        ifKeyLenient(configMap, "altitudeReference", v -> pointConfig.altitudeReference(
                PointVariableConfig.AltitudeReference.valueOf(v.toString().toUpperCase())));
        ifKeyLenient(configMap, "altitudePattern", v -> pointConfig.altitudePattern(
                PointVariableConfig.AltitudePattern.valueOf(v.toString().toUpperCase())));
        ifPresent(configMap, KEY_INITIAL_ALTITUDE, v -> pointConfig.initialAltitude(asDouble(v)));
        ifKey(configMap, "maxVerticalStep", v -> pointConfig.maxVerticalStep(asDouble(v)));
        ifKey(configMap, "altitudeOscillationSpeed", v -> pointConfig.altitudeOscillationSpeed(asDouble(v)));
    }

    /**
     * Range bounds as {minX, maxX, minY, maxY, minZ, maxZ}: minPoint / maxPoint first (defaults match
     * the UI: 0..100 on every axis), then the flat min/max keys override them.
     */
    private static double[] pointRange(Map<String, Object> configMap) {
        double[] min = { 0.0, 0.0, 0.0 };
        double[] max = { 100.0, 100.0, 100.0 };
        if (configMap.get("minPoint") instanceof Map<?, ?> minMap) {
            min = pointCoords(minMap, 0.0);
        }
        if (configMap.get("maxPoint") instanceof Map<?, ?> maxMap) {
            max = pointCoords(maxMap, 100.0);
        }
        double[] range = { min[0], max[0], min[1], max[1], min[2], max[2] };
        String[] flatKeys = { "minLat", "maxLat", "minLon", "maxLon", "minAlt", "maxAlt", "minZ", "maxZ" };
        int[] positions = { 0, 1, 2, 3, 4, 5, 4, 5 };
        // In this order: minZ / maxZ win over minAlt / maxAlt
        for (int i = 0; i < flatKeys.length; i++) {
            if (configMap.containsKey(flatKeys[i])) {
                range[positions[i]] = asDouble(configMap.get(flatKeys[i]));
            }
        }
        return range;
    }

    private static void applyBoundaryPolygon(Map<String, Object> configMap, PointVariableConfig pointConfig,
                                             double minZ, double maxZ) {
        if (!(configMap.get("boundaryPolygon") instanceof List<?> polyList)) {
            return;
        }
        for (Object item : polyList) {
            if (item instanceof Map<?, ?> ptMap) {
                double[] p = pointCoords(ptMap, 0.0);
                pointConfig.addBoundaryPolygonPoint(p[0], p[1], p[2]);
            }
        }
        // In 3D the shape is the region: the polygon does not re-range the bounding box
        if (!pointConfig.getBoundaryPolygon().isEmpty()
                && pointConfig.getCoordinateSystem() != CoordinateSystem.CARTESIAN_3D) {
            fitRangeToPolygon(pointConfig, minZ, maxZ);
        }
    }

    private static void fitRangeToPolygon(PointVariableConfig pointConfig, double minZ, double maxZ) {
        double pMinX = Double.MAX_VALUE;
        double pMaxX = -Double.MAX_VALUE;
        double pMinY = Double.MAX_VALUE;
        double pMaxY = -Double.MAX_VALUE;
        for (PointVariableConfig.Point3D pt : pointConfig.getBoundaryPolygon()) {
            pMinX = Math.min(pMinX, pt.x);
            pMaxX = Math.max(pMaxX, pt.x);
            pMinY = Math.min(pMinY, pt.y);
            pMaxY = Math.max(pMaxY, pt.y);
        }
        // Always preserve user-configured minZ and maxZ altitude range
        pointConfig.range(pMinX, pMaxX, pMinY, pMaxY, minZ, maxZ);
    }

    private static void applyObstacles(Map<String, Object> configMap, PointVariableConfig pointConfig) {
        if (configMap.get("obstacles") instanceof List<?> obsList) {
            for (Object item : obsList) {
                if (item instanceof Map<?, ?> obsMap) {
                    pointConfig.addObstacle(obstacleFromMap(obsMap));
                }
            }
        }
    }

    private static BoundaryObstacle obstacleFromMap(Map<?, ?> obsMap) {
        String obsName = obsMap.containsKey(KEY_NAME) ? obsMap.get(KEY_NAME).toString() : "Obstacle";
        String typeStr = obsMap.containsKey(KEY_TYPE) ? obsMap.get(KEY_TYPE).toString() : "WALL_SEGMENT";
        BoundaryObstacle obstacle = new BoundaryObstacle().name(obsName).type(obstacleTypeOf(typeStr));
        if (obsMap.containsKey(KEY_ID) && obsMap.get(KEY_ID) != null) {
            obstacle.id(obsMap.get(KEY_ID).toString());
        }
        if (obsMap.containsKey(KEY_ENABLED) && obsMap.get(KEY_ENABLED) != null) {
            obstacle.enabled(Boolean.TRUE.equals(obsMap.get(KEY_ENABLED)));
        }
        if (obsMap.get("points") instanceof List<?> ptsList) {
            for (Object pItem : ptsList) {
                if (pItem instanceof Map<?, ?> ptMap) {
                    obstacle.addPoint(numberAt(ptMap, 0.0, KEY_X), numberAt(ptMap, 0.0, KEY_Y), numberAt(ptMap, 0.0, KEY_Z));
                }
            }
        }
        return obstacle;
    }

    private static BoundaryObstacle.ObstacleType obstacleTypeOf(String typeStr) {
        try {
            return BoundaryObstacle.ObstacleType.valueOf(typeStr.toUpperCase());
        } catch (RuntimeException ignored) {
            return BoundaryObstacle.ObstacleType.WALL_SEGMENT;
        }
    }

    /** Graph route nodes: only coordinates are strictly required; id and name are auto-assigned if omitted. */
    private static void applyGraphNodes(Map<String, Object> configMap, PointVariableConfig pointConfig) {
        if (valueOrLegacy(configMap, "graphNodes", "nodes") instanceof List<?> gNodesList) {
            int nodeIdx = 1;
            for (Object item : gNodesList) {
                if (item instanceof Map<?, ?> nMap) {
                    pointConfig.addGraphNode(graphNodeFromMap(nMap, nodeIdx));
                    nodeIdx++;
                }
            }
        }
    }

    private static GraphNode graphNodeFromMap(Map<?, ?> nMap, int nodeIdx) {
        String nId = textAt(nMap, "node-" + nodeIdx, KEY_ID);
        String nName = textAt(nMap, nId, KEY_NAME);
        double nx = numberAt(nMap, 0.0, KEY_X, KEY_LAT, "latitude");
        double ny = numberAt(nMap, 0.0, KEY_Y, KEY_LON, "lng", "longitude");
        double nz = numberAt(nMap, 0.0, KEY_Z, KEY_ALT, "altitude");
        return new GraphNode(nId, nName, nx, ny, nz);
    }

    private static void applyGraphEdges(Map<String, Object> configMap, PointVariableConfig pointConfig) {
        if (valueOrLegacy(configMap, "graphEdges", "edges") instanceof List<?> gEdgesList) {
            int edgeIdx = 1;
            for (Object item : gEdgesList) {
                if (item instanceof Map<?, ?> eMap) {
                    pointConfig.addGraphEdge(graphEdgeFromMap(eMap, edgeIdx));
                    edgeIdx++;
                }
            }
        }
    }

    private static GraphEdge graphEdgeFromMap(Map<?, ?> eMap, int edgeIdx) {
        String eId = textAt(eMap, "edge-" + edgeIdx, KEY_ID);
        String fromId = textAt(eMap, "", KEY_FROM_NODE_ID, KEY_SOURCE_ID, "from");
        String toId = textAt(eMap, "", KEY_TO_NODE_ID, KEY_TARGET_ID, "to");
        boolean bi = !eMap.containsKey("bidirectional") || Boolean.TRUE.equals(eMap.get("bidirectional"));
        return new GraphEdge(eId, fromId, toId, bi);
    }

    private static void applyGraphNavigation(Map<String, Object> configMap, PointVariableConfig pointConfig) {
        String modeKey = isPresent(configMap, KEY_GRAPH_NAVIGATION_MODE) ? KEY_GRAPH_NAVIGATION_MODE : KEY_NAVIGATION_MODE;
        ifPresentLenient(configMap, modeKey, v -> pointConfig.graphNavigationMode(
                PointVariableConfig.GraphNavigationMode.valueOf(v.toString().toUpperCase())));

        if (valueOrLegacy(configMap, "graphSequence", "sequence") instanceof List<?> seqList) {
            List<String> sequence = new ArrayList<>();
            for (Object item : seqList) {
                if (item != null) {
                    sequence.add(item.toString());
                }
            }
            pointConfig.graphSequence(sequence);
        }

        Object loopObj = valueOrLegacy(configMap, "graphLoopSequence", "loopSequence");
        if (loopObj != null) {
            pointConfig.graphLoopSequence(parseBooleanHelper(loopObj, false));
        }
    }

    private static void applyGraphStops(Map<String, Object> configMap, PointVariableConfig pointConfig) {
        Object stopProbObj = valueOrLegacy(configMap, "graphStopProbability", "stopProbability");
        if (stopProbObj == null) {
            stopProbObj = configMap.get("pauseProbability");
        }
        if (stopProbObj != null) {
            pointConfig.graphStopProbability(parseDoubleHelper(stopProbObj, 0.0));
        }

        Object stopTicksObj = valueOrLegacy(configMap, "graphStopTicks", "stopTicks");
        if (stopTicksObj == null) {
            stopTicksObj = configMap.get("pauseTicks");
        }
        if (stopTicksObj == null) {
            stopTicksObj = configMap.get("pauseDurationTicks");
        }
        if (stopTicksObj != null) {
            pointConfig.graphStopTicks(parseIntHelper(stopTicksObj, 0));
        }

        Object preventCyclesObj = valueOrLegacy(configMap, "graphPreventCycles", "preventCycles");
        if (preventCyclesObj == null) {
            preventCyclesObj = configMap.get("antiBacktracking");
        }
        if (preventCyclesObj != null) {
            pointConfig.graphPreventCycles(parseBooleanHelper(preventCyclesObj, true));
        }

        Object stepsObj = valueOrLegacy(configMap, "graphInterpolationSteps", "stepsPerEdge");
        if (stepsObj != null) {
            pointConfig.graphInterpolationSteps(parseIntHelper(stepsObj, 1));
        } else if (configMap.get(KEY_INTERPOLATION_STEPS) != null) {
            // Fallback to the waypoint steps, clamped like them
            pointConfig.graphInterpolationSteps(Math.max(1, parseIntHelper(configMap.get(KEY_INTERPOLATION_STEPS), 1)));
        }
    }

    /**
     * Reads x/y/z (or lat/lon/alt) as numbers; a missing coordinate takes the default, and a null or
     * non-number value fails.
     */
    private static double[] pointCoords(Map<?, ?> ptMap, double defaultValue) {
        return new double[] {
                numberAt(ptMap, defaultValue, KEY_X, KEY_LAT),
                numberAt(ptMap, defaultValue, KEY_Y, KEY_LON),
                numberAt(ptMap, defaultValue, KEY_Z, KEY_ALT) };
    }

    /**
     * Reads x/y/z (or lat/lon/alt) from a point map; missing coordinates are 0.
     */
    private static double[] parsePointCoords(Map<?, ?> ptMap) {
        Object x = ptMap.containsKey(KEY_X) ? ptMap.get(KEY_X) : ptMap.get(KEY_LAT);
        Object y = ptMap.containsKey(KEY_Y) ? ptMap.get(KEY_Y) : ptMap.get(KEY_LON);
        Object z = ptMap.containsKey(KEY_Z) ? ptMap.get(KEY_Z) : ptMap.get(KEY_ALT);
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
