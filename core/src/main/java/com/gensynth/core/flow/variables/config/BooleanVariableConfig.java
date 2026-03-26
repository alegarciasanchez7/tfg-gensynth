package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Generates boolean values using different strategies.
 * Supports: constant ON/OFF, alternating patterns, and duty cycle modes.
 */
public class BooleanVariableConfig extends VariableConfiguration {
    
    // Constants
    private static final int DEFAULT_TICKS = 1;
    private static final boolean DEFAULT_START_VALUE = true;
    
    // State management
    private boolean currentValue;          // Current boolean state
    private int ticksInCurrentState;       // Counter within current state
    private int onDurationTicks;           // How long to stay TRUE
    private int offDurationTicks;          // How long to stay FALSE
    private boolean startWithTrue;         // Start cycle with TRUE or FALSE
    
    // Pattern-specific
    private int alternationInterval;       // For ALTERNATING pattern

    // Anomaly state
    private long cachedWhenTicks = -1;
    private boolean isAnomalous;
    private long anomalyStartTick;

    public BooleanVariableConfig() {
        this.type = VariableType.BOOLEAN;
        this.pattern = GenerationPattern.CONSTANT_BOOLEAN;
        this.currentValue = DEFAULT_START_VALUE;
        this.ticksInCurrentState = 0;
        this.onDurationTicks = DEFAULT_TICKS;
        this.offDurationTicks = DEFAULT_TICKS;
        this.alternationInterval = DEFAULT_TICKS;
        this.startWithTrue = DEFAULT_START_VALUE;
        this.isAnomalous = false;
        this.anomalyStartTick = 0;
    }

    /**
     * Set constant boolean value (for CONSTANT_BOOLEAN pattern).
     */
    public BooleanVariableConfig constantValue(boolean value) {
        this.currentValue = value;
        this.startWithTrue = value;
        return this;
    }

    /**
     * Set duty cycle parameters (for DUTY_CYCLE pattern).
     * Example: onDurationTicks(3).offDurationTicks(2) → ON 3 ticks, OFF 2 ticks, repeat
     */
    public BooleanVariableConfig onDurationTicks(int ticks) {
        if (ticks <= 0) {
            throw new IllegalArgumentException("Ticks must be positive");
        }
        this.onDurationTicks = ticks;
        return this;
    }

    public BooleanVariableConfig offDurationTicks(int ticks) {
        if (ticks <= 0) {
            throw new IllegalArgumentException("Ticks must be positive");
        }
        this.offDurationTicks = ticks;
        return this;
    }

    /**
     * Set starting state for cycle (TRUE or FALSE).
     */
    public BooleanVariableConfig startWithTrue(boolean startTrue) {
        this.startWithTrue = startTrue;
        this.currentValue = startTrue;
        return this;
    }

    /**
     * Set alternation interval (for ALTERNATING_BOOLEAN pattern).
     * intervalTicks(2) → TRUE, TRUE, FALSE, FALSE, TRUE, TRUE, ...
     */
    public BooleanVariableConfig alternationInterval(int intervalTicks) {
        if (intervalTicks <= 0) {
            throw new IllegalArgumentException("Interval must be positive");
        }
        this.alternationInterval = intervalTicks;
        return this;
    }

    /**
     * Get current boolean state (for testing).
     */
    public boolean getCurrentValue() {
        return currentValue;
    }

    /**
     * Get ticks in current state (for testing).
     */
    public int getTicksInCurrentState() {
        return ticksInCurrentState;
    }

    @Override
    public Object generateNextValue() {
        tickCounter++;
        checkAnomalyCondition();
        
        if (isAnomalous) {
            return anomalyConfig.getAnomalousValue();
        }
        
        switch (pattern) {
            case CONSTANT_BOOLEAN:
                return generateConstant();
            case DUTY_CYCLE:
                return generateDutyCycle();
            case ALTERNATING_BOOLEAN:
                return generateAlternating();
            default:
                return currentValue;
        }
    }

    /**
     * Constant mode: always return same boolean value.
     */
    private Object generateConstant() {
        return currentValue;
    }

    /**
     * Duty cycle mode: alternates between ON and OFF with configurable durations.
     * Example: 3 ticks ON, 2 ticks OFF, repeat
     */
    private Object generateDutyCycle() {
        Object result = currentValue;
        ticksInCurrentState++;
        
        if (currentValue) {
            // In ON state - check if should switch to OFF
            if (ticksInCurrentState >= onDurationTicks) {
                currentValue = false;
                ticksInCurrentState = 0;
            }
        } else {
            // In OFF state - check if should switch to ON
            if (ticksInCurrentState >= offDurationTicks) {
                currentValue = true;
                ticksInCurrentState = 0;
            }
        }
        
        return result;
    }

    /**
     * Alternating mode: toggle every N ticks.
     * Example: alternationInterval(2) → TT FF TT FF ...
     */
    private Object generateAlternating() {
        Object result = currentValue;
        ticksInCurrentState++;
        
        if (ticksInCurrentState >= alternationInterval) {
            currentValue = !currentValue;
            ticksInCurrentState = 0;
        }
        
        return result;
    }

    @Override
    public void reset() {
        tickCounter = 0;
        currentValue = startWithTrue;
        ticksInCurrentState = 0;
        isAnomalous = false;
        anomalyStartTick = 0;
        cachedWhenTicks = -1;
    }

    @Override
    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>(8);
        map.put("identifier", identifier);
        map.put("type", type.toString());
        map.put("pattern", pattern.toString());
        map.put("currentValue", currentValue);
        map.put("onDurationTicks", onDurationTicks);
        map.put("offDurationTicks", offDurationTicks);
        map.put("alternationInterval", alternationInterval);
        
        if (anomalyConfig != null && anomalyConfig.isEnabled()) {
            map.put("anomalyEnabled", true);
            map.put("anomalyType", anomalyConfig.getType().toString());
        }
        
        return map;
    }

    @Override
    public BooleanVariableConfig identifier(String id) {
        this.identifier = id;
        return this;
    }

    @Override
    public BooleanVariableConfig pattern(GenerationPattern p) {
        this.pattern = p;
        return this;
    }

    @Override
    public BooleanVariableConfig defaultValue(Object value) {
        this.defaultValue = value;
        return this;
    }

    @Override
    public BooleanVariableConfig anomaly(AnomalyConfig config) {
        this.anomalyConfig = config;
        this.cachedWhenTicks = -1;
        return this;
    }

    /**
     * Check if anomaly condition is met (tick-based or probability-based).
     */
    private void checkAnomalyCondition() {
        if (anomalyConfig == null || !anomalyConfig.isEnabled()) {
            isAnomalous = false;
            return;
        }

        if (isAnomalous) {
            long elapsedTicks = tickCounter - anomalyStartTick;
            handleAnomalyDuration(elapsedTicks);
            return;
        }

        boolean shouldTrigger = false;

        if (anomalyConfig.getWhenTicks() > 0) {
            if (cachedWhenTicks == -1) {
                cachedWhenTicks = anomalyConfig.getWhenTicks();
            }
            shouldTrigger = (tickCounter == cachedWhenTicks);
        } else if (anomalyConfig.getProbabilityRatio() > 0) {
            double random100 = ThreadLocalRandom.current().nextDouble(100.0);
            shouldTrigger = (random100 < anomalyConfig.getProbabilityRatio());
        }

        if (shouldTrigger) {
            isAnomalous = true;
            anomalyStartTick = tickCounter;
        }
    }

    /**
     * Handle anomaly duration logic.
     */
    private void handleAnomalyDuration(long elapsedTicks) {
        switch (anomalyConfig.getType()) {
            case MAKE_AND_BACK:
                if (elapsedTicks >= 1) {
                    isAnomalous = false;
                    cachedWhenTicks = -1;
                }
                break;
            case MAKE_AND_KEEP:
                break;
            case MAKE_AND_KEEP_N_TIMES:
                if (elapsedTicks >= anomalyConfig.getKeepNTimes()) {
                    isAnomalous = false;
                    cachedWhenTicks = -1;
                }
                break;
        }
    }

    // Getters

    public int getOnDurationTicks() {
        return onDurationTicks;
    }

    public int getOffDurationTicks() {
        return offDurationTicks;
    }

    public GenerationPattern getPattern() {
        return pattern;
    }
}