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
     * Create configurable variable from configuration
     */
    public static ConfigurableVariable createFromConfig(VariableConfiguration config) {
        return new ConfigurableVariable(config);
    }

    /**
     * Instantiates a specific VariableConfiguration based on type and config map.
     */
    public static VariableConfiguration createFromMap(String id, String type, Map<String, Object> configMap) {
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
                return numConfig;

            case "STRING":
                StringVariableConfig strConfig = createString(id);
                if (configMap.containsKey("fixedLength"))
                    strConfig.fixedSize(((Number) configMap.get("fixedLength")).intValue());
                if (configMap.containsKey("regexPattern"))
                    strConfig.regex((String) configMap.get("regexPattern"));
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
}
