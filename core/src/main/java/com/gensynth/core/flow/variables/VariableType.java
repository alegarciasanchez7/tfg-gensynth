package com.gensynth.core.flow.variables;

/**
 * Enum that defines the types of variables supported in the system.
 * 
 * Each type has specific generation and configuration characteristics.
 */
public enum VariableType {
    NUMERIC("Numeric - Numbers with patterns"),
    STRING("String - Random text generation"),
    LIST("List - Fixed set of values"),
    TEMPORAL("Temporal - Date and time values"),
    POINT("Point - Coordinates (X,Y,Z)"),
    BOOLEAN("Boolean - True/False values");

    private final String description;

    VariableType(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }
}
