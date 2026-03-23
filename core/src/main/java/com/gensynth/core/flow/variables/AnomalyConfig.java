package com.gensynth.core.flow.variables;

/**
 * Configuration of anomalies for any variable.
 * Anomalies inject anomalous behaviors into the data.
 */
public class AnomalyConfig {
    private AnomalyType type;
    
    // Tick-based anomalies
    private long whenTicks;
    private long whenTicksRangeMin;
    private long whenTicksRangeMax;
    
    // Probability-based anomalies
    private double probabilityRatio;  // 0.0 to 100.0 (percentage)
    private boolean enableProbabilityMode;
    
    // Common
    private Object anomalousValue;
    private long keepNTimes;
    private double breakTrendProbability;
    private boolean enabled;

    public AnomalyConfig() {
        this.enabled = false;
        this.breakTrendProbability = 0.0;
        this.probabilityRatio = 0.0;
        this.enableProbabilityMode = false;
    }

    // Builder pattern
    public AnomalyConfig type(AnomalyType type) {
        this.type = type;
        return this;
    }

    public AnomalyConfig whenTicks(long ticks) {
        this.whenTicks = ticks;
        this.whenTicksRangeMin = ticks;
        this.whenTicksRangeMax = ticks;
        return this;
    }

    public AnomalyConfig whenTicksRange(long min, long max) {
        this.whenTicksRangeMin = min;
        this.whenTicksRangeMax = max;
        return this;
    }

    public AnomalyConfig anomalousValue(Object value) {
        this.anomalousValue = value;
        this.enabled = true;
        return this;
    }

    public AnomalyConfig keepNTimes(long n) {
        this.keepNTimes = n;
        return this;
    }

    public AnomalyConfig breakTrendProbability(double probability) {
        this.breakTrendProbability = probability;
        return this;
    }

    /**
     * Enable probability-based anomalies.
     * Anomaly occurs based on random probability each tick.
     * @param probabilityRatio probability from 0.0 to 100.0 (percentage)
     *                         Example: 0.5 means 0.5% chance, 0.00001 means 0.00001% chance
     */
    public AnomalyConfig probabilityRatio(double probabilityRatio) {
        if (probabilityRatio < 0.0 || probabilityRatio > 100.0) {
            throw new IllegalArgumentException(
                "Probability ratio must be between 0.0 and 100.0, got: " + probabilityRatio
            );
        }
        this.probabilityRatio = probabilityRatio;
        this.enableProbabilityMode = true;
        return this;
    }

    /**
     * Disable probability-based mode and revert to tick-based anomalies.
     */
    public AnomalyConfig disableProbabilityMode() {
        this.enableProbabilityMode = false;
        return this;
    }

    // Getters
    public AnomalyType getType() { return type; }
    public long getWhenTicks() { return whenTicks; }
    public long getWhenTicksRangeMin() { return whenTicksRangeMin; }
    public long getWhenTicksRangeMax() { return whenTicksRangeMax; }
    public double getProbabilityRatio() { return probabilityRatio; }
    public boolean isEnabledProbabilityMode() { return enableProbabilityMode; }
    public Object getAnomalousValue() { return anomalousValue; }
    public long getKeepNTimes() { return keepNTimes; }
    public double getBreakTrendProbability() { return breakTrendProbability; }
    public boolean isEnabled() { return enabled; }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }
}
