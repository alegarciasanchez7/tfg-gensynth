package com.gensynth.core.flow.variables;

/**
 * Defines boundary collision and limit behavior for Point movement simulations.
 */
public enum BoundaryBehavior {
    /**
     * Rebound direction vector when hitting coordinate boundaries.
     */
    BOUNCE,

    /**
     * Stop movement at the defined min/max coordinate bounds.
     */
    CLAMP,

    /**
     * Wrap position around to opposite bound (toroidal topology).
     */
    WRAP
}
