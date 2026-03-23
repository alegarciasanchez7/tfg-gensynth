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
    
    // String patterns
    RANDOM_STRING("Random String - Randomized characters"),
    
    // List patterns
    RANDOM_FROM_LIST("Random from List - Pick randomly"),
    SEQUENTIAL_FROM_LIST("Sequential from List - Sequential pick"),
    CONSTANT_FROM_LIST("Constant from List - Fixed item"),
    
    // Date patterns
    FIXED_DATE("Fixed Date - Constant date/time"),
    SYSTEM_NOW("System Now - Current date/time"),
    START_PLUS_INCREMENT("Start + Increment - Increasing from start"),
    DATE_RANGE("Date Range - Random within range");

    private final String description;

    GenerationPattern(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }
}
