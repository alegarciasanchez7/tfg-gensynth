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

    private static final org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger(DataGenerator.class);

    public Object generateValue(Variable variable, Map<String, Object> context) {
        String type = variable.getType();
        Map<String, Object> config = variable.getConfig();

        try {
            ConfigurableVariable cv = variableCache.computeIfAbsent(variable.getId(), id -> {
                VariableConfiguration varConfig = VariableFactory.createFromMap(variable.getName(), type, config);
                return VariableFactory.createFromConfig(varConfig);
            });
            if (context != null) {
                cv.setContext(context);
            }
            return cv.getValue();
        } catch (Exception e) {
            logger.warn("Error generating value for {}: {}", variable.getName(), e.getMessage());
            return variable.getDefaultValue();
        }
    }

    public Object generateValue(Variable variable) {
        return generateValue(variable, null);
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
