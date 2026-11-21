package com.gensynth.core.flow;

import com.gensynth.core.model.Variable;
import java.util.Map;
import java.util.function.Supplier;
import com.gensynth.core.flow.variables.VariableFactory;
import com.gensynth.core.flow.variables.ConfigurableVariable;
import com.gensynth.core.flow.variables.VariableConfiguration;
import java.util.concurrent.ConcurrentHashMap;

public class DataGenerator {

    /** Tick of a value generated outside the tick clock: it is never shared. */
    public static final long NO_TICK = -1;

    private static final String CONFIG_SUFFIX = "_config";

    private final Map<String, ConfigurableVariable> variableCache;
    /** Last value of each GROUP or GLOBAL variable, with the tick it belongs to. */
    private final Map<String, SharedValue> sharedValues;

    /** Value a shared variable gave on a tick; its monitor serializes generation of that variable. */
    private static final class SharedValue {
        private long tick = NO_TICK;
        private Object value;
    }

    public DataGenerator() {
        this.variableCache = new ConcurrentHashMap<>();
        this.sharedValues = new ConcurrentHashMap<>();
    }

    private static final org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger(DataGenerator.class);

    public Object generateValue(Variable variable, Map<String, Object> context) {
        try {
            ConfigurableVariable cv = generatorOf(variable);
            if (context != null) {
                putGenerator(variable, cv, context);
            }
            // A cached variable may be shared by flows generating on different threads
            // (GLOBAL/GROUP scope): its context and internal state must change atomically.
            synchronized (cv) {
                if (context != null) {
                    cv.setContext(context);
                }
                return cv.getValue();
            }
        } catch (Exception e) {
            logger.warn("Error generating value for {}: {}", variable.getName(), e.getMessage());
            return variable.getDefaultValue();
        }
    }

    public Object generateValue(Variable variable) {
        return generateValue(variable, null);
    }

    /**
     * Value of a GROUP or GLOBAL variable on a tick: the first flow that asks for it on that
     * tick generates it, and every other flow gets the same value. A flow that asks for an older
     * tick (it lagged behind the clock) gets the latest value instead of a new one, so the
     * variable never advances more than once per tick.
     *
     * @param variable the shared variable
     * @param tick     the global tick, or {@link #NO_TICK} to generate a new value on every call
     * @param generate generates a new value of the variable
     * @return the variable's value on that tick
     */
    public Object sharedValue(Variable variable, long tick, Supplier<Object> generate) {
        if (tick == NO_TICK || variable.getId() == null) {
            return generate.get();
        }
        SharedValue shared = sharedValues.computeIfAbsent(variable.getId(), id -> new SharedValue());
        // The caller resolves the dependencies before: no other shared lock is taken while this
        // one is held, so flows that need several shared variables cannot deadlock
        synchronized (shared) {
            if (shared.tick == NO_TICK || tick > shared.tick) {
                shared.value = generate.get();
                shared.tick = tick;
            }
            return shared.value;
        }
    }

    /**
     * @param variable a shared variable
     * @param tick     the global tick
     * @return true when the variable already has its value of that tick (or of a later one), so
     *         {@link #sharedValue} will not generate a new one
     */
    public boolean hasSharedValue(Variable variable, long tick) {
        if (tick == NO_TICK || variable.getId() == null) {
            return false;
        }
        SharedValue shared = sharedValues.get(variable.getId());
        if (shared == null) {
            return false;
        }
        synchronized (shared) {
            return shared.tick != NO_TICK && tick <= shared.tick;
        }
    }

    /**
     * Puts the variable's generator in a message context under {@code <id>_config} and
     * {@code <name>_config}, where sub-properties and inheriting variables read it.
     *
     * @param variable the variable
     * @param context  the context of one message
     */
    public void exposeGenerator(Variable variable, Map<String, Object> context) {
        try {
            putGenerator(variable, generatorOf(variable), context);
        } catch (Exception e) {
            logger.warn("Error preparing generator for {}: {}", variable.getName(), e.getMessage());
        }
    }

    private ConfigurableVariable generatorOf(Variable variable) {
        return variableCache.computeIfAbsent(variable.getId(), id -> {
            VariableConfiguration varConfig = VariableFactory.createFromMap(variable.getName(), variable.getType(), variable.getConfig());
            return VariableFactory.createFromConfig(varConfig);
        });
    }

    private static void putGenerator(Variable variable, ConfigurableVariable cv, Map<String, Object> context) {
        if (variable.getId() != null) {
            context.put(variable.getId() + CONFIG_SUFFIX, cv);
        }
        if (variable.getName() != null) {
            context.put(variable.getName() + CONFIG_SUFFIX, cv);
        }
    }

    public void clearCache() {
        this.variableCache.clear();
        this.sharedValues.clear();
    }

    public void removeCachedVariable(String variableId) {
        if (variableId != null) {
            this.variableCache.remove(variableId);
            this.sharedValues.remove(variableId);
        }
    }
}
