package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import net.objecthunter.exp4j.Expression;
import net.objecthunter.exp4j.ExpressionBuilder;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Configuration for numerical variables.
 * Supports multiple patterns: Random, Constant, Sequential, Trend.
 */
public class NumericVariableConfig extends VariableConfiguration {
    
    // Range and format
    private double fromValue;
    private double toValue;
    private double initialValue;
    private int steps;
    private String format;

    // Advanced config
    private String formula;
    private String precision = "DOUBLE"; // "INTEGER", "FLOAT", "DOUBLE"
    private String distribution = "UNIFORM"; // "UNIFORM", "NORMAL", "EXPONENTIAL"
    
    // Pattern: SEQUENTIAL
    private SequentialConfig sequentialConfig;
    
    // Pattern: TREND
    private TrendConfig trendConfig;
    
    // Pattern: RANDOM / CONSTANT
    private double constantValue;
    
    // Internal state
    private double currentValue;
    private boolean isAnomalous;
    private long anomalyStartTick;
    
    // Performance optimization: cache for tick-based anomalies
    private long cachedWhenTicks = -1;  // -1 means not calculated yet
    private double stepSize;  // Pre-calculated for sequential pattern

    public NumericVariableConfig() {
        super();
        this.type = VariableType.NUMERIC;
        this.pattern = GenerationPattern.RANDOM;
        this.format = "%.2f";
        this.steps = 100;
        this.sequentialConfig = new SequentialConfig();
        this.trendConfig = new TrendConfig();
        calculateStepSize();
    }

    @Override
    public java.util.Set<String> getDependencies() {
        java.util.Set<String> deps = super.getDependencies();
        if (formula != null && !formula.trim().isEmpty()) {
            // Very basic heuristic: extract variable names from formula via regex or simply 
            // relying on context injecting all. For now, we will return empty set for formula 
            // because building AST to find variables is expensive, and we will just 
            // inject the entire context into exp4j. 
            // BUT wait, we must return them for topological sort!
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\[([a-zA-Z0-9_-]+)\\]").matcher(formula);
            while (m.find()) {
                deps.add(m.group(1));
            }
        }
        return deps;
    }

    @Override
    public Object generateNextValue() {
        tickCounter++;
        checkAnomalyCondition();
        
        if (isAnomalous) {
            return anomalyConfig.getAnomalousValue();
        }
        
        if (formula != null && !formula.trim().isEmpty()) {
            currentValue = evaluateFormula();
            return formatValue(currentValue);
        }

        switch (pattern) {
            case RANDOM:
                currentValue = generateDistribution();
                break;
            case CONSTANT:
                currentValue = constantValue;
                break;
            case SEQUENTIAL:
                currentValue = generateSequential();
                break;
            case TREND:
                currentValue = generateTrend();
                break;
            default:
                currentValue = initialValue;
        }
        
        return formatValue(currentValue);
    }

    private double generateDistribution() {
        if ("NORMAL".equalsIgnoreCase(distribution)) {
            double mean = (fromValue + toValue) / 2.0;
            double stdDev = (toValue - fromValue) / 6.0; // 99.7% of values within range
            double val = mean + ThreadLocalRandom.current().nextGaussian() * stdDev;
            return Math.min(Math.max(val, fromValue), toValue);
        } else if ("EXPONENTIAL".equalsIgnoreCase(distribution)) {
            double val = fromValue - Math.log(ThreadLocalRandom.current().nextDouble()) * ((toValue - fromValue) / 5.0);
            return Math.min(Math.max(val, fromValue), toValue);
        } else {
            // UNIFORM
            return fromValue + (toValue - fromValue) * ThreadLocalRandom.current().nextDouble();
        }
    }

    private double evaluateFormula() {
        try {
            // Replace [var] with actual variable names for exp4j
            String parsedFormula = formula.replaceAll("\\[([a-zA-Z0-9_-]+)\\]", "$1");
            ExpressionBuilder builder = new ExpressionBuilder(parsedFormula);
            
            Map<String, Double> vars = new HashMap<>();
            for (Map.Entry<String, Object> entry : currentContext.entrySet()) {
                if (entry.getValue() instanceof Number) {
                    builder.variable(entry.getKey());
                    vars.put(entry.getKey(), ((Number) entry.getValue()).doubleValue());
                }
            }
            
            Expression expression = builder.build();
            expression.setVariables(vars);
            return expression.evaluate();
        } catch (Exception e) {
            System.err.println("Error evaluating formula: " + formula + " -> " + e.getMessage());
            return 0.0;
        }
    }

    private void checkAnomalyCondition() {
        if (!anomalyConfig.isEnabled()) return;
        
        if (anomalyConfig.isEnabledProbabilityMode()) {
            // Probability-based: each tick has a chance to trigger
            double probabilityThreshold = anomalyConfig.getProbabilityRatio() / 100.0;
            if (ThreadLocalRandom.current().nextDouble() < probabilityThreshold && !isAnomalous) {
                isAnomalous = true;
                anomalyStartTick = tickCounter;
            }
        } else {
            // Tick-based: calculate once, then check
            if (cachedWhenTicks == -1) {
                cachedWhenTicks = getRandomLongInRange(
                    anomalyConfig.getWhenTicksRangeMin(),
                    anomalyConfig.getWhenTicksRangeMax()
                );
            }
            
            if (tickCounter == cachedWhenTicks && !isAnomalous) {
                isAnomalous = true;
                anomalyStartTick = tickCounter;
            }
        }
        
        // Handle anomaly duration (same logic for both modes)
        if (isAnomalous) {
            handleAnomalyDuration();
        }
    }

    /**
     * Unified anomaly duration logic - extracted to avoid duplication.
     */
    private void handleAnomalyDuration() {
        switch (anomalyConfig.getType()) {
            case MAKE_AND_BACK:
                // Anomaly lasts only 1 tick
                if (tickCounter > anomalyStartTick) {
                    isAnomalous = false;
                }
                break;
            case MAKE_AND_KEEP:
                // Anomaly lasts forever
                break;
            case MAKE_AND_KEEP_N_TIMES:
                // Anomaly lasts N ticks
                if (tickCounter > anomalyStartTick + anomalyConfig.getKeepNTimes()) {
                    isAnomalous = false;
                }
                break;
        }
    }

    private double generateSequential() {
        if (sequentialConfig.descending) {
            currentValue -= stepSize;  // Pre-calculated, no division needed
            if (currentValue < fromValue) {
                if (sequentialConfig.goBack) {
                    currentValue = fromValue;
                    sequentialConfig.descending = false;
                } else {
                    currentValue = toValue;
                }
            }
        } else {
            currentValue += stepSize;  // Pre-calculated
            if (currentValue > toValue) {
                if (sequentialConfig.goBack) {
                    currentValue = toValue;
                    sequentialConfig.descending = true;
                } else {
                    currentValue = fromValue;
                }
            }
        }
        return currentValue;
    }

    private double generateTrend() {
        int intervalIndex = (int) ((tickCounter / trendConfig.intervalSize) % trendConfig.getIntervalCount());
        double intervalMin = fromValue + (intervalIndex * (toValue - fromValue) / trendConfig.getIntervalCount());
        double intervalMax = fromValue + ((intervalIndex + 1) * (toValue - fromValue) / trendConfig.getIntervalCount());
        
        return intervalMin + (intervalMax - intervalMin) * ThreadLocalRandom.current().nextDouble();
    }

    private Object formatValue(double value) {
        if ("INTEGER".equalsIgnoreCase(precision)) {
            return (long) value;
        } else if ("FLOAT".equalsIgnoreCase(precision)) {
            return (float) value;
        }
        return value; // DOUBLE
    }

    private long getRandomLongInRange(long min, long max) {
        if (min == max) return min;
        return ThreadLocalRandom.current().nextLong(min, max + 1);
    }

    /**
     * Pre-calculates step size for sequential pattern.
     * Called whenever from, to, or steps values change.
     */
    private void calculateStepSize() {
        this.stepSize = (toValue - fromValue) / steps;
    }

    @Override
    public void reset() {
        currentValue = initialValue;
        tickCounter = 0;
        isAnomalous = false;
        anomalyStartTick = 0;
    }

    @Override
    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>(8);
        map.put("identifier", identifier);
        map.put("type", type.name());
        map.put("pattern", pattern.name());
        map.put("from", fromValue);
        map.put("to", toValue);
        map.put("initial", initialValue);
        map.put("steps", steps);
        map.put("format", format);
        map.put("formula", formula);
        map.put("precision", precision);
        map.put("distribution", distribution);
        return map;
    }

    // Builder methods
    @Override
    public NumericVariableConfig identifier(String id) {
        super.identifier(id);
        return this;
    }

    @Override
    public NumericVariableConfig pattern(GenerationPattern pattern) {
        super.pattern(pattern);
        return this;
    }

    @Override
    public NumericVariableConfig defaultValue(Object value) {
        super.defaultValue(value);
        return this;
    }

    @Override
    public NumericVariableConfig anomaly(AnomalyConfig config) {
        super.anomaly(config);
        this.cachedWhenTicks = -1;  // Reset cache when anomaly config changes
        return this;
    }

    public NumericVariableConfig from(double value) {
        this.fromValue = value;
        calculateStepSize();
        return this;
    }

    public NumericVariableConfig to(double value) {
        this.toValue = value;
        calculateStepSize();
        return this;
    }

    public NumericVariableConfig initial(double value) {
        this.initialValue = value;
        this.currentValue = value;
        return this;
    }

    public NumericVariableConfig steps(int steps) {
        this.steps = steps;
        calculateStepSize();
        return this;
    }

    public NumericVariableConfig format(String format) {
        this.format = format;
        return this;
    }

    public NumericVariableConfig constant(double value) {
        this.constantValue = value;
        this.pattern = GenerationPattern.CONSTANT;
        return this;
    }

    public NumericVariableConfig formula(String formula) {
        this.formula = formula;
        return this;
    }

    public NumericVariableConfig precision(String precision) {
        this.precision = precision;
        return this;
    }

    public NumericVariableConfig distribution(String distribution) {
        this.distribution = distribution;
        return this;
    }

    // Getters
    public double getFromValue() { return fromValue; }
    public double getToValue() { return toValue; }
    public double getInitialValue() { return initialValue; }
    public double getCurrentValue() { return currentValue; }
    public int getSteps() { return steps; }
    public String getFormat() { return format; }
    public SequentialConfig getSequentialConfig() { return sequentialConfig; }
    public TrendConfig getTrendConfig() { return trendConfig; }

    /**
     * Configuration for Sequential pattern
     */
    public static class SequentialConfig {
        public boolean descending = false;
        public boolean goBack = true;
        public boolean proportional = true;
        
        public SequentialConfig descending(boolean desc) {
            this.descending = desc;
            return this;
        }

        public SequentialConfig goBack(boolean back) {
            this.goBack = back;
            return this;
        }

        public SequentialConfig proportional(boolean prop) {
            this.proportional = prop;
            return this;
        }
    }

    /**
     * Configuration for trend pattern
     */
    public static class TrendConfig {
        public enum TrendMode { NORMAL, GRADUAL, JUMPING }
        
        public TrendMode mode = TrendMode.NORMAL;
        public int intervalCount = 10;
        public int intervalSize = 1;
        
        public TrendConfig mode(TrendMode mode) {
            this.mode = mode;
            return this;
        }

        public TrendConfig intervalCount(int count) {
            this.intervalCount = count;
            return this;
        }

        public int getIntervalCount() { return intervalCount; }
    }
}
