package com.gensynth.core.flow.variables;

import java.util.List;

/**
 * Thrown when a VariableConfiguration fails its internal validation.
 * Contains the list of specific errors to report to the user.
 */
public class InvalidVariableConfigException extends RuntimeException {
    private final String variableId;
    private final String variableType;
    private final List<String> errors;

    public InvalidVariableConfigException(String variableId, String variableType, List<String> errors) {
        super("Invalid configuration for variable '" + variableId + "' (" + variableType + "): " + errors);
        this.variableId = variableId;
        this.variableType = variableType;
        this.errors = errors;
    }

    public String getVariableId() { return variableId; }
    public String getVariableType() { return variableType; }
    public List<String> getErrors() { return errors; }
}
