package com.gensynth.core.flow.variables;

/**
 * Format options for geospatial coordinate output representation.
 */
public enum GeospatialFormat {
    /**
     * Standard numeric floating point coordinates (e.g. 40.7128, -74.0060).
     */
    DECIMAL_DEGREES,

    /**
     * Formatted Degrees, Minutes, Seconds string representation (e.g. 40° 42' 46.08" N, 74° 0' 21.60" W).
     */
    DEGREES_MINUTES_SECONDS
}
