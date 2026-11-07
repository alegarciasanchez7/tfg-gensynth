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

    /**
     * Resolves a variable type name to its constant, ignoring case and surrounding spaces.
     * The UI calls the temporal type {@code "temporal"} while the Core stores it as
     * {@code "date"} (see {@code VariableCommandHandler.normalizeVariableTypeForCore}), so both
     * names resolve to {@link #TEMPORAL}. Every type check must go through this method (or
     * {@link #matches(String)}) instead of comparing type strings.
     *
     * @param name stored or wire type name (e.g. "numeric", "date", "TEMPORAL")
     * @return the matching type, or {@code null} if the name is null or unknown
     */
    public static VariableType fromName(String name) {
        if (name == null) {
            return null;
        }
        String normalized = name.trim().toUpperCase(java.util.Locale.ROOT);
        if ("DATE".equals(normalized)) {
            return TEMPORAL;
        }
        for (VariableType type : values()) {
            if (type.name().equals(normalized)) {
                return type;
            }
        }
        return null;
    }

    /**
     * Whether a type name designates this type (aliases included, see {@link #fromName(String)}).
     *
     * @param name stored or wire type name
     * @return {@code true} if the name resolves to this type
     */
    public boolean matches(String name) {
        return fromName(name) == this;
    }
}
