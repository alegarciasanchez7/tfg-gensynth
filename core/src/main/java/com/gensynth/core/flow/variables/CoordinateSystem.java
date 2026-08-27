package com.gensynth.core.flow.variables;

/**
 * Defines the spatial coordinate system for Point variable simulation.
 */
public enum CoordinateSystem {
    /**
     * 2D Cartesian plane (X, Y).
     */
    CARTESIAN_2D,

    /**
     * 3D Cartesian space (X, Y, Z).
     */
    CARTESIAN_3D,

    /**
     * Geographic satellite positioning (Latitude, Longitude, Altitude).
     */
    GEOSPATIAL
}
