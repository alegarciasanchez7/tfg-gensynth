package com.gensynth.core.flow.variables;

import java.util.*;

/**
 * Resolves variable generation order using topological sort (DFS with cycle detection).
 * Throws CyclicDependencyException if a circular dependency is found.
 */
public class DependencyResolver {

    private enum Color { WHITE, GRAY, BLACK }

    /**
     * Returns the topological order of variable identifiers.
     * @param configs map of variableId -> VariableConfiguration
     * @return ordered list of variable identifiers (dependencies first)
     * @throws CyclicDependencyException if a cycle is detected
     * @throws IllegalArgumentException if a variable references a nonexistent target
     */
    public List<String> resolve(Map<String, VariableConfiguration> configs) throws CyclicDependencyException {
        List<String> result = new ArrayList<>();
        Map<String, Color> color = new HashMap<>();
        for (String id : configs.keySet()) {
            color.put(id, Color.WHITE);
        }

        Deque<String> path = new ArrayDeque<>();
        for (String id : configs.keySet()) {
            if (color.get(id) == Color.WHITE) {
                visit(id, configs, color, result, path);
            }
        }
        return result;
    }

    private void visit(String id, Map<String, VariableConfiguration> configs,
                       Map<String, Color> color, List<String> result,
                       Deque<String> path) throws CyclicDependencyException {
        color.put(id, Color.GRAY);
        path.addLast(id);

        VariableConfiguration config = configs.get(id);
        if (config != null) {
            Set<String> deps = config.getDependencies();
            for (String dep : deps) {
                if (!configs.containsKey(dep)) {
                    throw new IllegalArgumentException("Variable '" + id + "' references a nonexistent variable '" + dep + "'");
                }
                Color depColor = color.get(dep);
                if (depColor == Color.GRAY) {
                    // Cycle detected! Extract the cyclic path.
                    List<String> cycle = new ArrayList<>();
                    boolean foundStart = false;
                    for (String node : path) {
                        if (node.equals(dep)) {
                            foundStart = true;
                        }
                        if (foundStart) {
                            cycle.add(node);
                        }
                    }
                    cycle.add(dep); // complete the cycle loop visually
                    throw new CyclicDependencyException("Circular dependency detected: " + String.join(" -> ", cycle), cycle);
                } else if (depColor == Color.WHITE) {
                    visit(dep, configs, color, result, path);
                }
            }
        }

        color.put(id, Color.BLACK);
        path.removeLast();
        result.add(id);
    }
}
