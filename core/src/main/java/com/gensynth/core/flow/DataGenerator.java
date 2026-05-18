package com.gensynth.core.flow;

import com.gensynth.core.model.Variable;
import java.util.Map;
import com.gensynth.core.flow.variables.VariableFactory;
import com.gensynth.core.flow.variables.ConfigurableVariable;
import com.gensynth.core.flow.variables.VariableConfiguration;
import java.util.concurrent.ConcurrentHashMap;

public class DataGenerator {

    private final Map<String, ConfigurableVariable> variableCache;

    public DataGenerator() {
        this.variableCache = new ConcurrentHashMap<>();
    }

    public Object generateValue(Variable variable) {
        String type = variable.getType();
        Map<String, Object> config = variable.getConfig();

        try {
            ConfigurableVariable cv = variableCache.computeIfAbsent(variable.getId(), id -> {
                VariableConfiguration varConfig = VariableFactory.createFromMap(variable.getName(), type, config);
                return VariableFactory.createFromConfig(varConfig);
            });
            return cv.getValue();
        } catch (Exception e) {
            System.err.println("Error generating value for " + variable.getName() + ": " + e.getMessage());
            return variable.getDefaultValue();
        }
    }

    public void clearCache() {
        this.variableCache.clear();
    }

    public void removeCachedVariable(String variableId) {
        if (variableId != null) {
            this.variableCache.remove(variableId);
        }
    }
}
