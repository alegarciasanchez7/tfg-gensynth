package com.gensynth.core.flow;

import com.gensynth.core.api.IVariable;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Represents a single Flow with multiple variables.
 *
 * A Flow is a set of variables that are sent together as a unit.
 * Each flow can have a different combination of variables.
 *
 * Each flow:
 * - Has a unique ID (e.g., "flow_0", "flow_1")
 * - Contains multiple variables (temperature, pressure, humidity, etc.)
 * - Can have ANY combination of variables (flexible)
 * - Can generate data events for each variable periodically
 *
 * Example:
 * ```java
 * Flow flow = new Flow("flow_0");
 * flow.addVariable(new SimpleVariable("temperature", 20.0));
 * flow.addVariable(new SimpleVariable("pressure", 1013.0));
 *
 * List<DataEvent> events = flow.generateEvents();
 * // → 2 DataEvent objects (one per variable)
 * ```
 */
public class Flow {

    private final String flowId;
    private final Map<String, IVariable> variables;
    private volatile boolean enabled = true;
    private final long createdAt;

    /**
     * Constructor for Flow.
     *
     * @param flowId Unique identifier for this flow (e.g., "flow_0")
     */
    public Flow(String flowId) {
        if (flowId == null || flowId.isEmpty()) {
            throw new IllegalArgumentException("flowId cannot be null or empty");
        }
        this.flowId = flowId;
        this.variables = new ConcurrentHashMap<>();
        this.createdAt = System.currentTimeMillis();
    }

    /**
     * Add a variable to this flow.
     *
     * @param variable The variable to add
     * @throws IllegalArgumentException if variable is null or ID already exists
     */
    public void addVariable(IVariable variable) {
        if (variable == null) {
            throw new IllegalArgumentException("variable cannot be null");
        }
        String varId = variable.getId();
        if (variables.containsKey(varId)) {
            throw new IllegalArgumentException(
                String.format("Variable %s already exists in flow %s",
                    varId, flowId));
        }
        variables.put(varId, variable);
    }

    /**
     * Get a variable by ID.
     *
     * @return Optional containing the variable, or empty if not found
     */
    public Optional<IVariable> getVariable(String variableId) {
        return Optional.ofNullable(variables.get(variableId));
    }

    private volatile List<IVariable> sortedVariablesCache = null;

    /**
     * Generate data events from all variables.
     *
     * Creates one DataEvent per variable with the next generated value.
     * 
     * Behavior:
     * - SimpleVariable: calls generateNextValue() explicitly
     * - ConfigurableVariable: getValue() automatically generates next value
     * - Any IVariable: getValue() should return the appropriate value
     *
     * @return List of DataEvent objects (one per variable)
     */
    public List<DataEvent> generateEvents() {
        List<DataEvent> events = new ArrayList<>();
        long now = System.currentTimeMillis();
        
        List<IVariable> sortedVariables = getTopologicalSortedVariables();
        Map<String, Object> context = new HashMap<>();

        for (IVariable variable : sortedVariables) {
            String variableId = variable.getId();

            // Provide context for formula evaluation or conditional rules
            variable.setContext(context);

            if (variable instanceof SimpleVariable) {
                ((SimpleVariable) variable).generateNextValue();
            }

            Object currentValue = variable.getValue();
            context.put(variableId, currentValue);
            // Also put by name to allow referencing by name in formulas and conditional rules.
            if (variable.getName() != null) {
                context.put(variable.getName(), currentValue);
            }

            DataEvent event = new DataEvent(
                now,
                this.flowId,
                variableId,
                currentValue,
                variable.getType()
            );
            events.add(event);
        }

        return events;
    }

    private List<IVariable> getTopologicalSortedVariables() {
        if (sortedVariablesCache != null && sortedVariablesCache.size() == variables.size()) {
            return sortedVariablesCache;
        }

        List<IVariable> sorted = new ArrayList<>();
        Set<String> visited = new HashSet<>();
        Set<String> visiting = new HashSet<>();

        for (IVariable var : variables.values()) {
            if (!visited.contains(var.getId())) {
                topologicalSortUtil(var.getId(), visited, visiting, sorted);
            }
        }

        sortedVariablesCache = sorted;
        return sorted;
    }

    private void topologicalSortUtil(String varId, Set<String> visited, Set<String> visiting, List<IVariable> sorted) {
        IVariable variable = variables.get(varId);
        if (variable == null) return; // ignore missing dependencies

        visiting.add(varId);

        for (String dep : variable.getDependencies()) {
            if (visiting.contains(dep)) {
                // Circular dependency detected, ignore or log
                continue;
            }
            if (!visited.contains(dep)) {
                topologicalSortUtil(dep, visited, visiting, sorted);
            }
        }

        visiting.remove(varId);
        visited.add(varId);
        sorted.add(variable);
    }

    /**
     * Get flow ID.
     */
    public String getFlowId() {
        return flowId;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    /**
     * Get device ID (alias for getFlowId for backwards compatibility).
     */
    @Deprecated(since = "1.1", forRemoval = true)
    public String getDeviceId() {
        return flowId;
    }

    /**
     * Get number of variables in this flow.
     */
    public int getVariableCount() {
        return variables.size();
    }

    /**
     * Get all variable IDs.
     */
    public Set<String> getVariableIds() {
        return Collections.unmodifiableSet(variables.keySet());
    }

    /**
     * Get all variables.
     */
    public Collection<IVariable> getVariables() {
        return Collections.unmodifiableCollection(variables.values());
    }

    /**
     * Get time since flow creation (in milliseconds).
     */
    public long getUptimeMs() {
        return System.currentTimeMillis() - createdAt;
    }

    @Override
    public String toString() {
        return String.format("Flow{id=%s, variables=%d, uptime=%dms}",
            flowId, variables.size(), getUptimeMs());
    }
}
