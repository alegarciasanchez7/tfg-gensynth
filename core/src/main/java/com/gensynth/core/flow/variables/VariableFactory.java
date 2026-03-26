package com.gensynth.core.flow.variables;

import com.gensynth.core.flow.variables.config.*;

/**
 * Factory for creating configurable variables fluently.
 * Provides base methods - domain-specific convenience methods belong in client code.
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
     * Create date variable configuration
     */
    public static DateVariableConfig createDate(String id) {
        return new DateVariableConfig()
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
}
