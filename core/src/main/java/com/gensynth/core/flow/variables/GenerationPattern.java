package com.gensynth.core.flow.variables;

/**
 * Enum that defines generation patterns for variables.
 * 
 * Different patterns produce different behaviors in the data.
 */
public enum GenerationPattern {
    // Numeric patterns
    RANDOM("Random - Pure random values"),
    CONSTANT("Constant - Fixed value"),
    SEQUENTIAL("Sequential - Incremental/decremental sequence"),
    TREND("Trend - Statistical trend (normal/gradual/jumping)"),
    DISTRIBUTION("Distribution - Values based on probability distribution"),
    FORMULA("Formula - Value based on mathematical equation"),
    SINUSOIDAL("Sinusoidal - Periodic wave with frequency, amplitude, phase and offset"),
    DRIFT("Drift - Cumulative linear increase/decrease over simulation time"),
    
    // String patterns
    RANDOM_STRING("Random String - Randomized characters"),
    
    // List patterns
    RANDOM_FROM_LIST("Random from List - Pick randomly"),
    SEQUENTIAL_FROM_LIST("Sequential from List - Sequential pick"),
    CONSTANT_FROM_LIST("Constant from List - Fixed item"),
    
    // Date patterns
    FIXED_TEMPORAL("Fixed Temporal - Constant date/time"),
    SYSTEM_NOW("System Now - Current date/time"),
    START_PLUS_INCREMENT("Start + Increment - Increasing from start"),
    TEMPORAL_RANGE("Temporal Range - Random within range"),

    // Point patterns
    FIXED_POINT("Fixed Point - Constant XYZ coordinates"),
    RANDOM_POINT("Random Point - Random XYZ within bounds"),
    PATH_INTERPOLATOR("Path Interpolator - Interpolate across path points"),
    CONTINUOUS_MOVEMENT("Continuous Movement - Random walk within bounds"),

    // Boolean patterns
    CONSTANT_BOOLEAN("Constant Boolean - Fixed TRUE/FALSE"),
    DUTY_CYCLE("Duty Cycle - ON/OFF with durations"),
    ALTERNATING_BOOLEAN("Alternating Boolean - Toggle at intervals");

    private final String description;

    GenerationPattern(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }
}
