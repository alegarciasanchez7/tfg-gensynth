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
    private Double initialValue;
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

    // New Advanced Custom Fields
    private int decimalPlaces = 2;
    private String integerFormat = "";
    private String prefix = "";
    private String suffix = "";
    private double step = 0.0;
    private double constantMargin = 0.0;
    private String distributionType = "UNIFORM";
    private String boundaryMode = "RIGHT"; // "LEFT", "RIGHT", "SPLIT"
    private List<Map<String, Object>> sequentialGraph = new ArrayList<>();
    private List<Map<String, Object>> customDistributionGraph = new ArrayList<>();

    // Internal state
    private double currentValue;
    private boolean isAnomalous;
    private long anomalyStartTick;

    // Performance optimization: cache for tick-based anomalies
    private long cachedWhenTicks = -1; // -1 means not calculated yet
    private double stepSize; // Pre-calculated for sequential pattern

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
        if (pattern == GenerationPattern.FORMULA && formula != null && !formula.trim().isEmpty()) {
            // Very basic heuristic: extract variable names from formula via regex
            java.util.regex.Matcher m = java.util.regex.Pattern
                    .compile("(?:\\x5B|\\x7B\\x7B)([a-zA-Z0-9_-]+)(?:\\x5D|\\x7D\\x7D)").matcher(formula);
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

        if (pattern == GenerationPattern.FORMULA) {
            if (formula != null && !formula.trim().isEmpty()) {
                currentValue = evaluateFormula();
            } else {
                currentValue = 0.0;
            }
            return formatValue(currentValue);
        }

        if (tickCounter == 1 && initialValue != null) {
            if (pattern == GenerationPattern.RANDOM || (pattern == GenerationPattern.SEQUENTIAL
                    && (sequentialGraph == null || sequentialGraph.isEmpty()))) {
                currentValue = initialValue;
                return formatValue(currentValue);
            }
        }

        switch (pattern) {
            case RANDOM:
                if (step > 0 && (toValue - fromValue) > 0) {
                    double range = toValue - fromValue;
                    long numSteps = (long) (range / step);
                    if (numSteps > 0) {
                        long randomStep = ThreadLocalRandom.current().nextLong(0, numSteps + 1);
                        currentValue = fromValue + (randomStep * step);
                        currentValue = Math.min(currentValue, toValue);
                    } else {
                        currentValue = fromValue;
                    }
                } else {
                    currentValue = generateDistribution();
                }
                break;
            case CONSTANT:
                if (constantMargin > 0.0) {
                    double randomOffset = ThreadLocalRandom.current().nextDouble(-constantMargin, constantMargin);
                    currentValue = constantValue + randomOffset;
                } else {
                    currentValue = constantValue;
                }
                break;
            case SEQUENTIAL:
                currentValue = generateSequential();
                break;
            case DISTRIBUTION:
                if ("CUSTOM".equalsIgnoreCase(distributionType)) {
                    currentValue = generateCustomDistribution();
                } else {
                    currentValue = generateDistribution();
                }
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
        String dist = (distributionType != null && !distributionType.equalsIgnoreCase("UNIFORM")) ? distributionType
                : distribution;
        if ("NORMAL".equalsIgnoreCase(dist)) {
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
            // Replace [var] or {{var}} with actual variable names for exp4j
            String parsedFormula = formula.replaceAll("(?:\\x5B|\\x7B\\x7B)([a-zA-Z0-9_-]+)(?:\\x5D|\\x7D\\x7D)", "$1");
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
        if (!anomalyConfig.isEnabled())
            return;

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
                        anomalyConfig.getWhenTicksRangeMax());
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

    private double generateOriginalSequential() {
        if (sequentialConfig.descending) {
            currentValue -= stepSize; // Pre-calculated, no division needed
            if (currentValue < fromValue) {
                if (sequentialConfig.goBack) {
                    currentValue = fromValue;
                    sequentialConfig.descending = false;
                } else {
                    currentValue = toValue;
                }
            }
        } else {
            currentValue += stepSize; // Pre-calculated
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

    private double generateSequential() {
        if (sequentialGraph == null || sequentialGraph.isEmpty()) {
            return generateOriginalSequential();
        }

        // Find max x in the graph
        double maxX = 0;
        for (Map<String, Object> pt : sequentialGraph) {
            Number xNum = (Number) pt.get("x");
            if (xNum != null && xNum.doubleValue() > maxX) {
                maxX = xNum.doubleValue();
            }
        }

        if (maxX <= 0) {
            return fromValue;
        }

        // Current index in the loop
        double index = (tickCounter - 1) % maxX; // tickCounter is already incremented in generateNextValue()

        // Find the bracket points
        Map<String, Object> before = null;
        Map<String, Object> after = null;

        for (Map<String, Object> pt : sequentialGraph) {
            Number xNum = (Number) pt.get("x");
            if (xNum == null)
                continue;
            double px = xNum.doubleValue();
            if (px == index) {
                Number yNum = (Number) pt.get("y");
                return yNum != null ? yNum.doubleValue() : fromValue;
            }
            if (px < index) {
                if (before == null || px > ((Number) before.get("x")).doubleValue()) {
                    before = pt;
                }
            }
            if (px > index) {
                if (after == null || px < ((Number) after.get("x")).doubleValue()) {
                    after = pt;
                }
            }
        }

        // Interpolate
        if (before != null && after != null) {
            double x1 = ((Number) before.get("x")).doubleValue();
            double y1 = ((Number) before.get("y")).doubleValue();
            double x2 = ((Number) after.get("x")).doubleValue();
            double y2 = ((Number) after.get("y")).doubleValue();
            return y1 + (y2 - y1) * (index - x1) / (x2 - x1);
        } else if (before != null) {
            return ((Number) before.get("y")).doubleValue();
        } else if (after != null) {
            return ((Number) after.get("y")).doubleValue();
        }

        return fromValue;
    }

    private double generateRandomInInterval(double f, double t) {
        if ("LEFT".equalsIgnoreCase(boundaryMode)) {
            return t - (t - f) * ThreadLocalRandom.current().nextDouble();
        } else if ("SPLIT".equalsIgnoreCase(boundaryMode)) {
            if (ThreadLocalRandom.current().nextBoolean()) {
                return t - (t - f) * ThreadLocalRandom.current().nextDouble();
            } else {
                return f + (t - f) * ThreadLocalRandom.current().nextDouble();
            }
        } else {
            return f + (t - f) * ThreadLocalRandom.current().nextDouble();
        }
    }

    private double generateCustomDistribution() {
        if (customDistributionGraph == null || customDistributionGraph.isEmpty()) {
            return fromValue + (toValue - fromValue) * ThreadLocalRandom.current().nextDouble();
        }

        double totalWeight = 0;
        for (Map<String, Object> pt : customDistributionGraph) {
            Number wNum = (Number) pt.get("weight");
            if (wNum != null) {
                totalWeight += wNum.doubleValue();
            }
        }

        if (totalWeight <= 0) {
            Map<String, Object> first = customDistributionGraph.get(0);
            Number fromNum = (Number) first.get("from");
            Number toNum = (Number) first.get("to");
            if (fromNum != null && toNum != null) {
                return generateRandomInInterval(fromNum.doubleValue(), toNum.doubleValue());
            }
            Number valNum = (Number) first.get("value");
            return valNum != null ? valNum.doubleValue() : fromValue;
        }

        double r = ThreadLocalRandom.current().nextDouble() * totalWeight;
        double cumulativeWeight = 0;
        for (Map<String, Object> pt : customDistributionGraph) {
            Number wNum = (Number) pt.get("weight");
            if (wNum == null)
                continue;
            cumulativeWeight += wNum.doubleValue();
            if (r <= cumulativeWeight) {
                Number fromNum = (Number) pt.get("from");
                Number toNum = (Number) pt.get("to");
                if (fromNum != null && toNum != null) {
                    return generateRandomInInterval(fromNum.doubleValue(), toNum.doubleValue());
                }
                Number valNum = (Number) pt.get("value");
                return valNum != null ? valNum.doubleValue() : fromValue;
            }
        }

        Map<String, Object> last = customDistributionGraph.get(customDistributionGraph.size() - 1);
        Number fromNum = (Number) last.get("from");
        Number toNum = (Number) last.get("to");
        if (fromNum != null && toNum != null) {
            return generateRandomInInterval(fromNum.doubleValue(), toNum.doubleValue());
        }
        Number valNum = (Number) last.get("value");
        return valNum != null ? valNum.doubleValue() : fromValue;
    }

    private double generateTrend() {
        int intervalIndex = (int) ((tickCounter / trendConfig.intervalSize) % trendConfig.getIntervalCount());
        double intervalMin = fromValue + (intervalIndex * (toValue - fromValue) / trendConfig.getIntervalCount());
        double intervalMax = fromValue + ((intervalIndex + 1) * (toValue - fromValue) / trendConfig.getIntervalCount());

        return intervalMin + (intervalMax - intervalMin) * ThreadLocalRandom.current().nextDouble();
    }

    private Object formatValue(double value) {
        String activePrefix = this.prefix != null ? this.prefix : "";
        String activeSuffix = this.suffix != null ? this.suffix : "";
        String numberFormat = "";
        boolean hasFormatSpec = false;

        if (integerFormat != null && !integerFormat.isEmpty()) {
            if (integerFormat.contains("(") && integerFormat.contains(")")) {
                int start = integerFormat.indexOf('(');
                int end = integerFormat.indexOf(')');
                if (start < end) {
                    if (activePrefix.isEmpty()) {
                        activePrefix = integerFormat.substring(start + 1, end);
                    }
                    numberFormat = integerFormat.substring(end + 1);
                    hasFormatSpec = true;
                }
            } else {
                numberFormat = integerFormat;
                hasFormatSpec = true;
            }
        }

        if ("INTEGER".equalsIgnoreCase(precision)) {
            long intVal = (long) value;
            String formattedNum;
            if (hasFormatSpec && numberFormat.matches("0*1?")) {
                int padLen = numberFormat.length();
                if (padLen > 0) {
                    formattedNum = String.format("%0" + padLen + "d", intVal);
                } else {
                    formattedNum = String.valueOf(intVal);
                }
            } else {
                formattedNum = String.valueOf(intVal);
            }

            if (!activePrefix.isEmpty() || !activeSuffix.isEmpty()) {
                return activePrefix + formattedNum + activeSuffix;
            }
            return hasFormatSpec ? formattedNum : intVal;
        } else {
            double roundedValue = value;
            int activeDecimalPlaces = this.decimalPlaces;
            if (pattern == GenerationPattern.CONSTANT) {
                if (constantMargin == 0.0) {
                    if (constantValue % 1.0 == 0.0) {
                        activeDecimalPlaces = 0;
                    }
                } else {
                    if (constantMargin % 1.0 == 0.0 && constantValue % 1.0 == 0.0) {
                        activeDecimalPlaces = 0;
                    }
                }
            }

            if (activeDecimalPlaces >= 0) {
                double scale = Math.pow(10, activeDecimalPlaces);
                roundedValue = Math.round(value * scale) / scale;
            }

            if (hasFormatSpec || !activePrefix.isEmpty() || !activeSuffix.isEmpty()) {
                String formattedNum;
                String strValue = String.format(Locale.US,
                        "%." + (activeDecimalPlaces >= 0 ? activeDecimalPlaces : 2) + "f", roundedValue);
                int dotIdx = strValue.indexOf('.');
                String intPartStr = dotIdx >= 0 ? strValue.substring(0, dotIdx) : strValue;
                String decPartStr = dotIdx >= 0 ? strValue.substring(dotIdx) : "";

                boolean isNegative = intPartStr.startsWith("-");
                if (isNegative) {
                    intPartStr = intPartStr.substring(1);
                }

                if (hasFormatSpec && numberFormat.matches("0*1?")) {
                    int padLen = numberFormat.length();
                    if (padLen > 0) {
                        try {
                            long intPartVal = Long.parseLong(intPartStr);
                            intPartStr = String.format("%0" + padLen + "d", intPartVal);
                        } catch (NumberFormatException e) {
                            // ignore, keep original
                        }
                    }
                }

                formattedNum = (isNegative ? "-" : "") + intPartStr + decPartStr;
                return activePrefix + formattedNum + activeSuffix;
            }

            if ("FLOAT".equalsIgnoreCase(precision)) {
                return (float) roundedValue;
            }
            return roundedValue; // DOUBLE
        }
    }

    private long getRandomLongInRange(long min, long max) {
        if (min == max)
            return min;
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
        currentValue = initialValue != null ? initialValue : fromValue;
        tickCounter = 0;
        isAnomalous = false;
        anomalyStartTick = 0;
    }

    @Override
    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>(16);
        map.put("identifier", identifier);
        map.put("type", type.name());
        map.put("pattern", pattern.name());
        map.put("from", fromValue);
        map.put("to", toValue);
        map.put("min", fromValue);
        map.put("max", toValue);
        map.put("initial", initialValue);
        map.put("initialValue", initialValue);
        map.put("steps", steps);
        map.put("format", format);
        map.put("formula", formula);
        map.put("precision", precision);
        map.put("distribution", distribution);
        map.put("decimalPlaces", decimalPlaces);
        map.put("integerFormat", integerFormat);
        map.put("prefix", prefix);
        map.put("suffix", suffix);
        map.put("step", step);
        map.put("constantValue", constantValue);
        map.put("constantMargin", constantMargin);
        map.put("distributionType", distributionType);
        map.put("boundaryMode", boundaryMode);
        map.put("sequentialGraph", sequentialGraph);
        map.put("customDistributionGraph", customDistributionGraph);
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
        this.cachedWhenTicks = -1; // Reset cache when anomaly config changes
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

    public NumericVariableConfig decimalPlaces(int decimalPlaces) {
        this.decimalPlaces = decimalPlaces;
        return this;
    }

    public NumericVariableConfig integerFormat(String integerFormat) {
        this.integerFormat = integerFormat;
        return this;
    }

    public NumericVariableConfig prefix(String prefix) {
        this.prefix = prefix;
        return this;
    }

    public NumericVariableConfig suffix(String suffix) {
        this.suffix = suffix;
        return this;
    }

    public NumericVariableConfig step(double step) {
        this.step = step;
        return this;
    }

    public NumericVariableConfig constantMargin(double constantMargin) {
        this.constantMargin = constantMargin;
        return this;
    }

    public NumericVariableConfig distributionType(String distributionType) {
        this.distributionType = distributionType;
        return this;
    }

    public NumericVariableConfig sequentialGraph(List<Map<String, Object>> sequentialGraph) {
        this.sequentialGraph = sequentialGraph;
        return this;
    }

    public NumericVariableConfig customDistributionGraph(List<Map<String, Object>> customDistributionGraph) {
        this.customDistributionGraph = customDistributionGraph;
        return this;
    }

    public NumericVariableConfig boundaryMode(String boundaryMode) {
        this.boundaryMode = boundaryMode;
        return this;
    }

    // Getters
    public double getFromValue() {
        return fromValue;
    }

    public double getToValue() {
        return toValue;
    }

    public double getInitialValue() {
        return initialValue != null ? initialValue : fromValue;
    }

    public double getCurrentValue() {
        return currentValue;
    }

    public int getSteps() {
        return steps;
    }

    public String getFormat() {
        return format;
    }

    public SequentialConfig getSequentialConfig() {
        return sequentialConfig;
    }

    public TrendConfig getTrendConfig() {
        return trendConfig;
    }

    public int getDecimalPlaces() {
        return decimalPlaces;
    }

    public void setDecimalPlaces(int decimalPlaces) {
        this.decimalPlaces = decimalPlaces;
    }

    public String getIntegerFormat() {
        return integerFormat;
    }

    public void setIntegerFormat(String integerFormat) {
        this.integerFormat = integerFormat;
    }

    public String getPrefix() {
        return prefix;
    }

    public void setPrefix(String prefix) {
        this.prefix = prefix;
    }

    public String getSuffix() {
        return suffix;
    }

    public void setSuffix(String suffix) {
        this.suffix = suffix;
    }

    public double getStep() {
        return step;
    }

    public void setStep(double step) {
        this.step = step;
    }

    public double getConstantMargin() {
        return constantMargin;
    }

    public void setConstantMargin(double constantMargin) {
        this.constantMargin = constantMargin;
    }

    public String getDistributionType() {
        return distributionType;
    }

    public void setDistributionType(String distributionType) {
        this.distributionType = distributionType;
    }

    public List<Map<String, Object>> getSequentialGraph() {
        return sequentialGraph;
    }

    public void setSequentialGraph(List<Map<String, Object>> sequentialGraph) {
        this.sequentialGraph = sequentialGraph;
    }

    public List<Map<String, Object>> getCustomDistributionGraph() {
        return customDistributionGraph;
    }

    public void setCustomDistributionGraph(List<Map<String, Object>> customDistributionGraph) {
        this.customDistributionGraph = customDistributionGraph;
    }

    public String getBoundaryMode() {
        return boundaryMode;
    }

    public void setBoundaryMode(String boundaryMode) {
        this.boundaryMode = boundaryMode;
    }

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
        public enum TrendMode {
            NORMAL, GRADUAL, JUMPING
        }

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

        public int getIntervalCount() {
            return intervalCount;
        }
    }
}
