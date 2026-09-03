package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Generates boolean values using different strategies designed for digital states
 * (ON/OFF, switches, relays, alarms activated/deactivated).
 * Supports: constant ON/OFF, alternating patterns, duty cycle, probability,
 * flip interval, burst mode, and Markov chains.
 */
public class BooleanVariableConfig extends VariableConfiguration {
    
    // Constants
    private static final int DEFAULT_TICKS = 1;
    private static final boolean DEFAULT_START_VALUE = true;
    private static final double DEFAULT_PROBABILITY = 0.5;
    private static final double DEFAULT_P_TRUE_TO_TRUE = 0.8;
    private static final double DEFAULT_P_FALSE_TO_TRUE = 0.2;
    private static final int DEFAULT_BURST_TICKS = 5;
    
    // State management
    private boolean currentValue;          // Current boolean state
    private int ticksInCurrentState;       // Counter within current state
    private int onDurationTicks;           // How long to stay TRUE in duty cycle
    private int offDurationTicks;          // How long to stay FALSE in duty cycle
    private boolean startWithTrue;         // Start cycle with TRUE or FALSE
    
    // Pattern-specific
    private int alternationInterval;       // For ALTERNATING_BOOLEAN pattern
    private double trueProbability;        // For PROBABILITY pattern (0.0 to 1.0)
    private int flipInterval;              // For FLIP_INTERVAL pattern (N cycles)
    private int burstDurationTicks;        // For BURST_MODE (N cycles true)
    private int burstIdleTicks;            // For BURST_MODE (M cycles false)
    private double pTrueToTrue;            // For MARKOV: P(true -> true)
    private double pFalseToTrue;           // For MARKOV: P(false -> true)

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
        this.trueProbability = DEFAULT_PROBABILITY;
        this.flipInterval = DEFAULT_TICKS;
        this.burstDurationTicks = DEFAULT_BURST_TICKS;
        this.burstIdleTicks = DEFAULT_BURST_TICKS;
        this.pTrueToTrue = DEFAULT_P_TRUE_TO_TRUE;
        this.pFalseToTrue = DEFAULT_P_FALSE_TO_TRUE;
        this.isAnomalous = false;
        this.anomalyStartTick = 0;
    }

    /**
     * Set constant boolean value (for CONSTANT_BOOLEAN pattern).
     * @param value Fixed boolean state
     * @return this instance for method chaining
     */
    public BooleanVariableConfig constantValue(boolean value) {
        this.currentValue = value;
        this.startWithTrue = value;
        return this;
    }

    /**
     * Set duty cycle parameters (for DUTY_CYCLE pattern).
     * @param ticks Ticks to stay ON
     * @return this instance for method chaining
     */
    public BooleanVariableConfig onDurationTicks(int ticks) {
        if (ticks <= 0) {
            throw new IllegalArgumentException("Ticks must be positive");
        }
        this.onDurationTicks = ticks;
        return this;
    }

    /**
     * Set duty cycle parameters (for DUTY_CYCLE pattern).
     * @param ticks Ticks to stay OFF
     * @return this instance for method chaining
     */
    public BooleanVariableConfig offDurationTicks(int ticks) {
        if (ticks <= 0) {
            throw new IllegalArgumentException("Ticks must be positive");
        }
        this.offDurationTicks = ticks;
        return this;
    }

    /**
     * Set starting state for cycle (TRUE or FALSE).
     * @param startTrue Initial boolean value
     * @return this instance for method chaining
     */
    public BooleanVariableConfig startWithTrue(boolean startTrue) {
        this.startWithTrue = startTrue;
        this.currentValue = startTrue;
        return this;
    }

    /**
     * Set alternation interval (for ALTERNATING_BOOLEAN pattern).
     * @param intervalTicks Number of ticks per toggle
     * @return this instance for method chaining
     */
    public BooleanVariableConfig alternationInterval(int intervalTicks) {
        if (intervalTicks <= 0) {
            throw new IllegalArgumentException("Interval must be positive");
        }
        this.alternationInterval = intervalTicks;
        return this;
    }

    /**
     * Set probability of generating true (for PROBABILITY pattern).
     * @param probability Probability ratio between 0.0 and 1.0
     * @return this instance for method chaining
     */
    public BooleanVariableConfig trueProbability(double probability) {
        if (probability < 0.0 || probability > 1.0) {
            throw new IllegalArgumentException("Probability must be between 0.0 and 1.0");
        }
        this.trueProbability = probability;
        return this;
    }

    /**
     * Set flip interval in cycles (for FLIP_INTERVAL pattern).
     * @param interval Number of cycles before inverting state
     * @return this instance for method chaining
     */
    public BooleanVariableConfig flipInterval(int interval) {
        if (interval <= 0) {
            throw new IllegalArgumentException("Flip interval must be positive");
        }
        this.flipInterval = interval;
        return this;
    }

    /**
     * Set burst duration in ticks for BURST_MODE.
     * @param ticks Number of cycles to remain true during a burst
     * @return this instance for method chaining
     */
    public BooleanVariableConfig burstDurationTicks(int ticks) {
        if (ticks <= 0) {
            throw new IllegalArgumentException("Burst duration ticks must be positive");
        }
        this.burstDurationTicks = ticks;
        return this;
    }

    /**
     * Set burst idle duration in ticks for BURST_MODE.
     * @param ticks Number of cycles to remain false between bursts
     * @return this instance for method chaining
     */
    public BooleanVariableConfig burstIdleTicks(int ticks) {
        if (ticks < 0) {
            throw new IllegalArgumentException("Burst idle ticks cannot be negative");
        }
        this.burstIdleTicks = ticks;
        return this;
    }

    /**
     * Set transition probability P(true -> true) for MARKOV pattern.
     * @param prob Probability ratio between 0.0 and 1.0
     * @return this instance for method chaining
     */
    public BooleanVariableConfig pTrueToTrue(double prob) {
        if (prob < 0.0 || prob > 1.0) {
            throw new IllegalArgumentException("Probability must be between 0.0 and 1.0");
        }
        this.pTrueToTrue = prob;
        return this;
    }

    /**
     * Set transition probability P(false -> true) for MARKOV pattern.
     * @param prob Probability ratio between 0.0 and 1.0
     * @return this instance for method chaining
     */
    public BooleanVariableConfig pFalseToTrue(double prob) {
        if (prob < 0.0 || prob > 1.0) {
            throw new IllegalArgumentException("Probability must be between 0.0 and 1.0");
        }
        this.pFalseToTrue = prob;
        return this;
    }

    /**
     * Get current boolean state (for testing).
     * @return current boolean value
     */
    public boolean getCurrentValue() {
        return currentValue;
    }

    /**
     * Get ticks in current state (for testing).
     * @return counter of ticks spent in current state
     */
    public int getTicksInCurrentState() {
        return ticksInCurrentState;
    }

    @Override
    public java.util.List<String> validate() {
        java.util.List<String> errors = new java.util.ArrayList<>();
        if (trueProbability < 0.0 || trueProbability > 1.0) {
            errors.add("trueProbability must be between 0.0 and 1.0");
        }
        if (flipInterval <= 0) {
            errors.add("flipInterval must be positive");
        }
        if (burstDurationTicks <= 0) {
            errors.add("burstDurationTicks must be positive");
        }
        if (burstIdleTicks < 0) {
            errors.add("burstIdleTicks cannot be negative");
        }
        if (pTrueToTrue < 0.0 || pTrueToTrue > 1.0) {
            errors.add("pTrueToTrue must be between 0.0 and 1.0");
        }
        if (pFalseToTrue < 0.0 || pFalseToTrue > 1.0) {
            errors.add("pFalseToTrue must be between 0.0 and 1.0");
        }
        return errors;
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
            case PROBABILITY:
                return generateProbability();
            case FLIP_INTERVAL:
                return generateFlipInterval();
            case BURST_MODE:
                return generateBurstMode();
            case MARKOV:
                return generateMarkov();
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
     */
    private Object generateDutyCycle() {
        Object result = currentValue;
        ticksInCurrentState++;
        
        if (currentValue) {
            if (ticksInCurrentState >= onDurationTicks) {
                currentValue = false;
                ticksInCurrentState = 0;
            }
        } else {
            if (ticksInCurrentState >= offDurationTicks) {
                currentValue = true;
                ticksInCurrentState = 0;
            }
        }
        
        return result;
    }

    /**
     * Alternating mode: toggle every N ticks.
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

    /**
     * Probability mode: generates true with configurable P(true) probability per tick.
     */
    private Object generateProbability() {
        double rand = ThreadLocalRandom.current().nextDouble();
        currentValue = (rand < trueProbability);
        return currentValue;
    }

    /**
     * Flip interval mode: inverts state every N cycles.
     */
    private Object generateFlipInterval() {
        Object result = currentValue;
        ticksInCurrentState++;
        
        if (ticksInCurrentState >= flipInterval) {
            currentValue = !currentValue;
            ticksInCurrentState = 0;
        }
        
        return result;
    }

    /**
     * Burst mode: stays true for N cycles then returns to false for M cycles.
     */
    private Object generateBurstMode() {
        Object result = currentValue;
        ticksInCurrentState++;
        
        if (currentValue) {
            if (ticksInCurrentState >= burstDurationTicks) {
                currentValue = false;
                ticksInCurrentState = 0;
            }
        } else {
            if (ticksInCurrentState >= burstIdleTicks) {
                currentValue = true;
                ticksInCurrentState = 0;
            }
        }
        
        return result;
    }

    /**
     * Markov mode: state transition matrix for 2 digital states.
     */
    private Object generateMarkov() {
        double rand = ThreadLocalRandom.current().nextDouble();
        if (currentValue) {
            currentValue = (rand < pTrueToTrue);
        } else {
            currentValue = (rand < pFalseToTrue);
        }
        return currentValue;
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
        Map<String, Object> map = new HashMap<>(16);
        map.put("identifier", identifier);
        map.put("type", type.toString());
        map.put("pattern", pattern.toString());
        map.put("currentValue", currentValue);
        map.put("onDurationTicks", onDurationTicks);
        map.put("offDurationTicks", offDurationTicks);
        map.put("alternationInterval", alternationInterval);
        map.put("trueProbability", trueProbability);
        map.put("flipInterval", flipInterval);
        map.put("burstDurationTicks", burstDurationTicks);
        map.put("burstIdleTicks", burstIdleTicks);
        map.put("pTrueToTrue", pTrueToTrue);
        map.put("pFalseToTrue", pFalseToTrue);
        
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

    public double getTrueProbability() {
        return trueProbability;
    }

    public int getFlipInterval() {
        return flipInterval;
    }

    public int getBurstDurationTicks() {
        return burstDurationTicks;
    }

    public int getBurstIdleTicks() {
        return burstIdleTicks;
    }

    public double getPTrueToTrue() {
        return pTrueToTrue;
    }

    public double getPFalseToTrue() {
        return pFalseToTrue;
    }
}