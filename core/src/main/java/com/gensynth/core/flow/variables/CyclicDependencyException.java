package com.gensynth.core.flow.variables;

import java.util.List;

/**
 * Thrown when a circular dependency between variables is detected.
 */
public class CyclicDependencyException extends Exception {
    private final List<String> cycle;

    public CyclicDependencyException(String message, List<String> cycle) {
        super(message);
        this.cycle = cycle;
    }

    public List<String> getCycle() { return cycle; }
}
