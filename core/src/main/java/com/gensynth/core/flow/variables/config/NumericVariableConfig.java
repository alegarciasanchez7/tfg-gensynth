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
    private static final String UNIFORM = "UNIFORM";
    private static final String CLAMP = "CLAMP";
    private static final String FIXED_OFFSET = "FIXED_OFFSET";
    private static final String WEIGHT = "weight";
    private static final String VALUE = "value";

    // Range and format
    private double fromValue = 0.0;
    private double toValue = 100.0;
    private Double initialValue;
    private int steps;
    private String format;

    // Advanced config
    private String formula;
    private String precision = "DOUBLE"; // "INTEGER", "FLOAT", "DOUBLE"
    private String distribution = UNIFORM; // "UNIFORM", "NORMAL", "EXPONENTIAL"

    // Pattern: SEQUENTIAL
    private final SequentialConfig sequentialConfig;

    // Pattern: TREND
    private final TrendConfig trendConfig;

    // Pattern: RANDOM / CONSTANT
    private double constantValue;

    // New Advanced Custom Fields
    private int decimalPlaces = 2;
    private String integerFormat = "";
    private String prefix = "";
    private String suffix = "";
    private double step = 0.0;
    private double constantMargin = 0.0;
    private String distributionType = UNIFORM;
    private String boundaryMode = "RIGHT"; // "LEFT", "RIGHT", "SPLIT"
    private List<Map<String, Object>> sequentialGraph = new ArrayList<>();
    private List<Map<String, Object>> customDistributionGraph = new ArrayList<>();

    // Pattern: SINUSOIDAL
    private double sineFrequency = 0.05; // 20 s period: 1 Hz sampled every second would be flat
    private double sineAmplitude = 10.0;
    private double sinePhase = 0.0;
    private double sineOffset = 0.0;

    // Pattern: DRIFT
    private double driftRate = 0.5;
    private Double driftInitialValue = null;
    private String driftLimitMode = CLAMP; // "CLAMP", "WRAP", "RESET", "BOUNCE"

    // Virtual Simulation Clock
    private double simulationTimeStep = 1.0; // Seconds per tick

    // Noise Modifier Layer
    private boolean noiseEnabled = false;
    private String noiseType = "GAUSSIAN"; // "GAUSSIAN", "UNIFORM"
    private double noiseAmplitude = 1.0;
    private double noiseStdDev = 1.0;

    // Spike Anomaly Modifier Layer
    private boolean spikeEnabled = false;
    private double spikeProbability = 0.05; // 0.0 to 1.0 (or 0 to 100%)
    private String spikeMode = FIXED_OFFSET; // "FIXED_OFFSET", "RANGE_SPIKE", "MULTIPLIER"
    private double spikeMagnitude = 50.0;
    private double spikeMin = 100.0;
    private double spikeMax = 200.0;
    private double spikeMultiplier = 2.0;

    // Internal state
    private double currentValue;
    /** Last emitted number, before prefix/suffix formatting; read by formulas of other variables. */
    private Double lastNumericValue;
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

    private static final java.util.logging.Logger configLogger = java.util.logging.Logger.getLogger(NumericVariableConfig.class.getName());

    @Override
    public java.util.List<String> validate() {
        java.util.List<String> errors = new java.util.ArrayList<>();
        validateRangeAndStep(errors);
        if (pattern == GenerationPattern.SEQUENTIAL && steps <= 0) {
            errors.add("Steps must be > 0 for SEQUENTIAL pattern");
        }
        if (pattern == GenerationPattern.FORMULA && !hasFormula()) {
            errors.add("Formula pattern requires a non-empty formula expression");
        }
        if (pattern == GenerationPattern.DISTRIBUTION && isCustomDistribution()) {
            validateCustomDistribution(errors);
        }
        return errors;
    }

    private void validateRangeAndStep(List<String> errors) {
        if (fromValue > toValue) {
            errors.add("Numeric range is invalid: min must be <= max");
        }
        if (initialValue != null && (initialValue < fromValue || initialValue > toValue)) {
            errors.add("Initial value " + initialValue + " is outside [min, max] range [" + fromValue + ", " + toValue + "]");
        }
        if (step < 0) {
            errors.add("Step cannot be negative");
        }
        if (step > 0 && step > (toValue - fromValue)) {
            errors.add("Step " + step + " exceeds the range [min, max]: no value can be generated");
        }
    }

    private void validateCustomDistribution(List<String> errors) {
        if (customDistributionGraph == null || customDistributionGraph.isEmpty()) {
            errors.add("Custom distribution requires at least one segment");
        } else if (sumCustomWeights() <= 0) {
            errors.add("Custom distribution: all weights are zero or negative");
        }
    }

    private boolean hasFormula() {
        return formula != null && !formula.trim().isEmpty();
    }

    private boolean isCustomDistribution() {
        return "CUSTOM".equalsIgnoreCase(distributionType);
    }

    /** Sum of the segment weights of the custom distribution; segments without a weight count as 0. */
    private double sumCustomWeights() {
        double totalWeight = 0;
        for (Map<String, Object> pt : customDistributionGraph) {
            Number wNum = (Number) pt.get(WEIGHT);
            if (wNum != null) {
                totalWeight += wNum.doubleValue();
            }
        }
        return totalWeight;
    }

    @Override
    public java.util.Set<String> getDependencies() {
        java.util.Set<String> deps = super.getDependencies();
        if (pattern == GenerationPattern.FORMULA && hasFormula()) {
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

        if (sourceListVariableId != null && !sourceListVariableId.trim().isEmpty()) {
            Object referenced = valueFromListReference();
            if (referenced != null) {
                return referenced;
            }
        }

        currentValue = computeBaseValue();
        applyModifierLayers();
        return formatValue(currentValue);
    }

    /**
     * Value taken from the referenced list item, with the modifier layers applied.
     *
     * @return the formatted value, or {@code null} to fall back to the standard generation
     */
    private Object valueFromListReference() {
        Object refVal = resolveListReferenceValue();
        if (refVal == null) {
            return null;
        }
        try {
            if (refVal instanceof Number number) {
                currentValue = number.doubleValue();
            } else {
                currentValue = Double.parseDouble(refVal.toString().trim());
            }
            applyModifierLayers();
            return formatValue(currentValue);
        } catch (Exception ignored) {
            // Fallback to standard numeric generation
            return null;
        }
    }

    /** Applies the noise layer and then the spike layer, when enabled, to {@code currentValue}. */
    private void applyModifierLayers() {
        if (noiseEnabled) {
            currentValue = applyNoise(currentValue);
        }
        if (spikeEnabled) {
            currentValue = applySpike(currentValue);
        }
    }

    private double computeBaseValue() {
        if (pattern == GenerationPattern.FORMULA) {
            return hasFormula() ? evaluateFormula() : 0.0;
        }
        if (tickCounter == 1 && initialValue != null
                && (pattern == GenerationPattern.RANDOM || pattern == GenerationPattern.SEQUENTIAL)) {
            return initialValue;
        }
        return switch (pattern) {
            case RANDOM -> generateRandomPatternValue();
            case CONSTANT -> generateConstant();
            case SEQUENTIAL -> generateSequential();
            case DISTRIBUTION -> isCustomDistribution() ? generateCustomDistribution() : generateDistribution();
            case TREND -> generateTrend();
            case SINUSOIDAL -> generateSinusoidal();
            case DRIFT -> generateDrift();
            default -> initialValue != null ? initialValue : fromValue;
        };
    }

    /** Random pattern: a whole number of steps above min when a step is set, otherwise {@link #generateRandom()}. */
    private double generateRandomPatternValue() {
        if (step > 0 && (toValue - fromValue) > 0) {
            double range = toValue - fromValue;
            long numSteps = (long) (range / step);
            if (numSteps > 0) {
                long randomStep = ThreadLocalRandom.current().nextLong(0, numSteps + 1);
                return Math.clamp(fromValue + (randomStep * step), fromValue, toValue);
            }
            return fromValue;
        }
        return generateRandom();
    }

    /** Constant pattern: the constant, moved by a random offset within the margin when one is set. */
    private double generateConstant() {
        if (constantMargin > 0.0) {
            double randomOffset = ThreadLocalRandom.current().nextDouble(-constantMargin, constantMargin);
            double baseValue = constantValue + randomOffset;
            if (fromValue < toValue) {
                baseValue = Math.clamp(baseValue, fromValue, toValue);
            }
            return baseValue;
        }
        return constantValue;
    }

    private double generateSinusoidal() {
        // Relative simulation time t in seconds
        double t = (tickCounter - 1) * simulationTimeStep;
        return sineOffset + sineAmplitude * Math.sin(2.0 * Math.PI * sineFrequency * t + sinePhase);
    }

    private double generateDrift() {
        double startVal;
        if (driftInitialValue != null) {
            startVal = driftInitialValue;
        } else {
            startVal = initialValue != null ? initialValue : fromValue;
        }
        double t = (tickCounter - 1) * simulationTimeStep;
        double rawVal = startVal + driftRate * t;

        if (fromValue < toValue) {
            return limitDrift(rawVal);
        }
        return rawVal;
    }

    /** Keeps a drifted value in [min, max] following the drift limit mode (CLAMP when unknown). */
    private double limitDrift(double rawVal) {
        String mode = driftLimitMode != null ? driftLimitMode.toUpperCase() : CLAMP;
        return switch (mode) {
            case "BOUNCE" -> bounceInRange(rawVal);
            case "WRAP", "RESET" -> wrapInRange(rawVal);
            default -> Math.clamp(rawVal, fromValue, toValue);
        };
    }

    /** Triangle wave: the value goes back and forth between the limits like a reflection. */
    private double bounceInRange(double rawVal) {
        double range = toValue - fromValue;
        double offset = (rawVal - fromValue) % (2 * range);
        if (offset < 0) {
            offset += 2 * range;
        }
        return offset <= range ? fromValue + offset : toValue - (offset - range);
    }

    /** Saw-tooth: a value past one limit starts again from the other one. */
    private double wrapInRange(double rawVal) {
        double range = toValue - fromValue;
        if (rawVal > toValue) {
            return fromValue + ((rawVal - fromValue) % range);
        }
        if (rawVal < fromValue) {
            return toValue - ((toValue - rawVal) % range);
        }
        return rawVal;
    }

    private double applyNoise(double val) {
        if (UNIFORM.equalsIgnoreCase(noiseType)) {
            double jitter = ThreadLocalRandom.current().nextDouble(-noiseAmplitude, noiseAmplitude);
            return val + jitter;
        } else { // GAUSSIAN
            double noise = ThreadLocalRandom.current().nextGaussian() * noiseStdDev;
            return val + noise;
        }
    }

    private double applySpike(double val) {
        double probThreshold = spikeProbability > 1.0 ? spikeProbability / 100.0 : spikeProbability;
        if (ThreadLocalRandom.current().nextDouble() < probThreshold) {
            String mode = spikeMode != null ? spikeMode.toUpperCase() : FIXED_OFFSET;
            switch (mode) {
                case "RANGE_SPIKE", "OUT_OF_RANGE":
                    if (spikeMin < spikeMax) {
                        return spikeMin + (spikeMax - spikeMin) * ThreadLocalRandom.current().nextDouble();
                    }
                    return spikeMin;
                case "MULTIPLIER":
                    return val * spikeMultiplier;
                case FIXED_OFFSET:
                default:
                    boolean positive = ThreadLocalRandom.current().nextBoolean();
                    return val + (positive ? spikeMagnitude : -spikeMagnitude);
            }
        }
        return val;
    }

    private double generateDistribution() {
        String dist = (distributionType != null && !distributionType.equalsIgnoreCase(UNIFORM)) ? distributionType
                : distribution;
        return sampleDistribution(dist);
    }

    /**
     * Random pattern: uniform in [min, max] (both included for INTEGER precision). Only the legacy
     * {@code distribution} key can change the shape; {@code distributionType} belongs to the
     * Distribution pattern and may be a leftover from it.
     */
    private double generateRandom() {
        if (distribution != null && !UNIFORM.equalsIgnoreCase(distribution)) {
            return sampleDistribution(distribution);
        }
        if ("INTEGER".equalsIgnoreCase(precision) && Math.ceil(fromValue) <= Math.floor(toValue)) {
            return (double) getRandomLongInRange((long) Math.ceil(fromValue), (long) Math.floor(toValue));
        }
        return fromValue + (toValue - fromValue) * ThreadLocalRandom.current().nextDouble();
    }

    /**
     * Keeps the value in [min, max]. A range with min above max (rejected by {@link #validate()})
     * gives max, as before {@link Math#clamp(double, double, double)} was used.
     */
    private double clampToRange(double value) {
        return Double.compare(fromValue, toValue) <= 0 ? Math.clamp(value, fromValue, toValue) : toValue;
    }

    private double sampleDistribution(String dist) {
        if ("NORMAL".equalsIgnoreCase(dist)) {
            double mean = (fromValue + toValue) / 2.0;
            double stdDev = (toValue - fromValue) / 6.0; // 99.7% of values within range
            double val = mean + ThreadLocalRandom.current().nextGaussian() * stdDev;
            return clampToRange(val);
        } else if ("EXPONENTIAL".equalsIgnoreCase(dist)) {
            double val = fromValue - Math.log(ThreadLocalRandom.current().nextDouble()) * ((toValue - fromValue) / 5.0);
            return clampToRange(val);
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
                Double numeric = toFormulaOperand(entry.getKey(), entry.getValue());
                if (numeric != null) {
                    builder.variable(entry.getKey());
                    vars.put(entry.getKey(), numeric);
                }
            }

            Expression expression = builder.build();
            expression.setVariables(vars);
            return expression.evaluate();
        } catch (Exception e) {
            configLogger.warning("Error evaluating formula: " + formula + " -> " + e.getMessage());
            return 0.0;
        }
    }

    /**
     * Numeric value of a context entry for a formula. A numeric variable with a prefix, suffix or
     * integer format is emitted as text, so its last raw number is read from its generator instead.
     */
    private Double toFormulaOperand(String key, Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value == null || key.endsWith("_config")) {
            return null;
        }
        Object generator = currentContext.get(key + "_config");
        if (generator instanceof com.gensynth.core.flow.variables.ConfigurableVariable cv
                && cv.getConfiguration() instanceof NumericVariableConfig numeric) {
            return numeric.getLastNumericValue();
        }
        return null;
    }

    /**
     * Last number produced by this variable, after rounding and before any prefix, suffix or
     * integer format turns it into text.
     *
     * @return the last emitted number, or {@code null} if no value has been generated yet
     */
    public Double getLastNumericValue() {
        return lastNumericValue;
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

        double maxX = maxGraphX();
        if (maxX <= 0) {
            return fromValue;
        }

        // Current index in the loop: every drawn point, from x=0 to x=maxX, is played once per cycle
        double index = (tickCounter - 1) % (maxX + 1); // tickCounter is already incremented in generateNextValue()

        Optional<Map<String, Object>> exact = graphPointAt(index);
        if (exact.isPresent()) {
            Number yNum = (Number) exact.get().get("y");
            return yNum != null ? yNum.doubleValue() : fromValue;
        }
        return interpolateGraph(closestGraphPointBelow(index), closestGraphPointAbove(index), index);
    }

    /** Largest x of the sequential graph, or 0 when no point has a positive x. */
    private double maxGraphX() {
        double maxX = 0;
        for (Map<String, Object> pt : sequentialGraph) {
            Number xNum = (Number) pt.get("x");
            if (xNum != null && xNum.doubleValue() > maxX) {
                maxX = xNum.doubleValue();
            }
        }
        return maxX;
    }

    /** First graph point drawn exactly at {@code index}, if any. */
    private Optional<Map<String, Object>> graphPointAt(double index) {
        for (Map<String, Object> pt : sequentialGraph) {
            Number xNum = (Number) pt.get("x");
            if (xNum != null && xNum.doubleValue() == index) {
                return Optional.of(pt);
            }
        }
        return Optional.empty();
    }

    /** Nearest graph point below {@code index} (the first drawn on equal x), or {@code null}. */
    private Map<String, Object> closestGraphPointBelow(double index) {
        Map<String, Object> before = null;
        for (Map<String, Object> pt : sequentialGraph) {
            Number xNum = (Number) pt.get("x");
            if (xNum != null && xNum.doubleValue() < index
                    && (before == null || xNum.doubleValue() > graphX(before))) {
                before = pt;
            }
        }
        return before;
    }

    /** Nearest graph point above {@code index} (the first drawn on equal x), or {@code null}. */
    private Map<String, Object> closestGraphPointAbove(double index) {
        Map<String, Object> after = null;
        for (Map<String, Object> pt : sequentialGraph) {
            Number xNum = (Number) pt.get("x");
            if (xNum != null && xNum.doubleValue() > index
                    && (after == null || xNum.doubleValue() < graphX(after))) {
                after = pt;
            }
        }
        return after;
    }

    /** Linear interpolation between the bracket points, or the only bracket point found. */
    private double interpolateGraph(Map<String, Object> before, Map<String, Object> after, double index) {
        if (before != null && after != null) {
            double x1 = graphX(before);
            double y1 = graphY(before);
            double x2 = graphX(after);
            double y2 = graphY(after);
            return y1 + (y2 - y1) * (index - x1) / (x2 - x1);
        } else if (before != null) {
            return graphY(before);
        } else if (after != null) {
            return graphY(after);
        }
        return fromValue;
    }

    private static double graphX(Map<String, Object> pt) {
        return ((Number) pt.get("x")).doubleValue();
    }

    private static double graphY(Map<String, Object> pt) {
        return ((Number) pt.get("y")).doubleValue();
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

        double totalWeight = sumCustomWeights();
        if (totalWeight <= 0) {
            return sampleSegment(customDistributionGraph.get(0));
        }

        double r = ThreadLocalRandom.current().nextDouble() * totalWeight;
        return sampleSegment(weightedSegment(r));
    }

    /** Segment whose cumulative weight first reaches {@code r}; the last segment if none does. */
    private Map<String, Object> weightedSegment(double r) {
        double cumulativeWeight = 0;
        for (Map<String, Object> pt : customDistributionGraph) {
            Number wNum = (Number) pt.get(WEIGHT);
            if (wNum != null) {
                cumulativeWeight += wNum.doubleValue();
                if (r <= cumulativeWeight) {
                    return pt;
                }
            }
        }
        return customDistributionGraph.get(customDistributionGraph.size() - 1);
    }

    /** A random value inside a from-to segment, or its single value (min when it has none). */
    private double sampleSegment(Map<String, Object> segment) {
        Number fromNum = (Number) segment.get("from");
        Number toNum = (Number) segment.get("to");
        if (fromNum != null && toNum != null) {
            return generateRandomInInterval(fromNum.doubleValue(), toNum.doubleValue());
        }
        Number valNum = (Number) segment.get(VALUE);
        return valNum != null ? valNum.doubleValue() : fromValue;
    }

    private double generateTrend() {
        int intervalIndex = (int) ((tickCounter / trendConfig.intervalSize) % trendConfig.getIntervalCount());
        double intervalMin = fromValue + (intervalIndex * (toValue - fromValue) / trendConfig.getIntervalCount());
        double intervalMax = fromValue + ((intervalIndex + 1) * (toValue - fromValue) / trendConfig.getIntervalCount());

        return intervalMin + (intervalMax - intervalMin) * ThreadLocalRandom.current().nextDouble();
    }

    /** Format of an integer padded with zeros to the given width (the width is not known in advance). */
    private static String zeroPaddedFormat(int width) {
        return "%0" + width + "d";
    }

    /**
     * Text layout of the emitted number: prefix and suffix, plus the zero-padding digits of the
     * integer format ("0000" or "(ID-)0000", whose text in brackets is the default prefix).
     *
     * @param present whether an integer format was given, which turns the number into text
     */
    private record NumberLayout(String prefix, String suffix, String digits, boolean present) {

        boolean hasAffixes() {
            return !prefix.isEmpty() || !suffix.isEmpty();
        }

        /** Width to zero-pad the integer part to, or 0 for no padding. */
        int padWidth() {
            return present && digits.matches("0*1?") ? digits.length() : 0;
        }
    }

    private NumberLayout numberLayout() {
        String activePrefix = this.prefix != null ? this.prefix : "";
        String activeSuffix = this.suffix != null ? this.suffix : "";
        if (integerFormat == null || integerFormat.isEmpty()) {
            return new NumberLayout(activePrefix, activeSuffix, "", false);
        }
        if (!integerFormat.contains("(") || !integerFormat.contains(")")) {
            return new NumberLayout(activePrefix, activeSuffix, integerFormat, true);
        }
        int start = integerFormat.indexOf('(');
        int end = integerFormat.indexOf(')');
        if (start >= end) {
            // A ")" before the "(" is not a prefix: the format is ignored
            return new NumberLayout(activePrefix, activeSuffix, "", false);
        }
        String layoutPrefix = activePrefix.isEmpty() ? integerFormat.substring(start + 1, end) : activePrefix;
        return new NumberLayout(layoutPrefix, activeSuffix, integerFormat.substring(end + 1), true);
    }

    private Object formatValue(double value) {
        NumberLayout layout = numberLayout();
        if ("INTEGER".equalsIgnoreCase(precision)) {
            return formatInteger(value, layout);
        }
        return formatDecimal(value, layout);
    }

    /** INTEGER precision: a Long, or a String when a prefix, suffix or integer format applies. */
    private Object formatInteger(double value, NumberLayout layout) {
        long intVal = (long) value;
        lastNumericValue = (double) intVal;
        int padLen = layout.padWidth();
        String formattedNum = padLen > 0
                ? String.format(Locale.ROOT, zeroPaddedFormat(padLen), intVal)
                : String.valueOf(intVal);

        if (layout.hasAffixes()) {
            return layout.prefix() + formattedNum + layout.suffix();
        }
        return layout.present() ? formattedNum : intVal;
    }

    /**
     * FLOAT and DOUBLE precision: the value rounded to the decimal places, as a Float or Double,
     * or as a String when a prefix, suffix or integer format applies.
     */
    private Object formatDecimal(double value, NumberLayout layout) {
        double roundedValue = value;
        int activeDecimalPlaces = effectiveDecimalPlaces();
        if (activeDecimalPlaces >= 0) {
            double scale = Math.pow(10, activeDecimalPlaces);
            roundedValue = Math.round(value * scale) / scale;
        }
        lastNumericValue = roundedValue;

        if (layout.present() || layout.hasAffixes()) {
            return layout.prefix() + decimalText(roundedValue, activeDecimalPlaces, layout.padWidth())
                    + layout.suffix();
        }
        if ("FLOAT".equalsIgnoreCase(precision)) {
            return (float) roundedValue;
        }
        return roundedValue; // DOUBLE
    }

    /** A whole constant with a whole margin (0 included, as 0 % 1 is 0) is shown without decimals. */
    private int effectiveDecimalPlaces() {
        boolean wholeConstant = pattern == GenerationPattern.CONSTANT
                && constantMargin % 1.0 == 0.0 && constantValue % 1.0 == 0.0;
        return wholeConstant ? 0 : decimalPlaces;
    }

    /** The value with its decimals, its integer part zero-padded to {@code padLen} (0 for none). */
    private static String decimalText(double roundedValue, int activeDecimalPlaces, int padLen) {
        String decimalsFormat = "%." + (activeDecimalPlaces >= 0 ? activeDecimalPlaces : 2) + "f";
        String strValue = String.format(Locale.US, decimalsFormat, roundedValue);
        int dotIdx = strValue.indexOf('.');
        String intPartStr = dotIdx >= 0 ? strValue.substring(0, dotIdx) : strValue;
        String decPartStr = dotIdx >= 0 ? strValue.substring(dotIdx) : "";

        boolean isNegative = intPartStr.startsWith("-");
        if (isNegative) {
            intPartStr = intPartStr.substring(1);
        }
        if (padLen > 0) {
            intPartStr = zeroPadded(intPartStr, padLen);
        }
        return (isNegative ? "-" : "") + intPartStr + decPartStr;
    }

    private static String zeroPadded(String intPart, int padLen) {
        try {
            return String.format(Locale.ROOT, zeroPaddedFormat(padLen), Long.parseLong(intPart));
        } catch (NumberFormatException e) {
            // Not a long (e.g. too many digits): keep it as is
            return intPart;
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
        lastNumericValue = null;
    }

    @Override
    public Map<String, Object> toMap() {
        // Same table size as before, so the keys keep their order
        Map<String, Object> map = HashMap.newHashMap(24);
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

        // Sinusoidal
        map.put("sineFrequency", sineFrequency);
        map.put("sineAmplitude", sineAmplitude);
        map.put("sinePhase", sinePhase);
        map.put("sineOffset", sineOffset);

        // Drift
        map.put("driftRate", driftRate);
        map.put("driftInitialValue", driftInitialValue);
        map.put("driftLimitMode", driftLimitMode);

        // Simulation Clock
        map.put("simulationTimeStep", simulationTimeStep);

        // Noise
        map.put("noiseEnabled", noiseEnabled);
        map.put("noiseType", noiseType);
        map.put("noiseAmplitude", noiseAmplitude);
        map.put("noiseStdDev", noiseStdDev);

        // Spikes
        map.put("spikeEnabled", spikeEnabled);
        map.put("spikeProbability", spikeProbability);
        map.put("spikeMode", spikeMode);
        map.put("spikeMagnitude", spikeMagnitude);
        map.put("spikeMin", spikeMin);
        map.put("spikeMax", spikeMax);
        map.put("spikeMultiplier", spikeMultiplier);

        return map;
    }

    // Builder methods for Sinusoidal, Drift, Clock, Noise, Spikes
    public NumericVariableConfig sineFrequency(double val) { this.sineFrequency = val; return this; }
    public NumericVariableConfig sineAmplitude(double val) { this.sineAmplitude = val; return this; }
    public NumericVariableConfig sinePhase(double val) { this.sinePhase = val; return this; }
    public NumericVariableConfig sineOffset(double val) { this.sineOffset = val; return this; }

    public NumericVariableConfig driftRate(double val) { this.driftRate = val; return this; }
    public NumericVariableConfig driftInitialValue(Double val) { this.driftInitialValue = val; return this; }
    public NumericVariableConfig driftLimitMode(String val) { this.driftLimitMode = val; return this; }

    public NumericVariableConfig simulationTimeStep(double val) { this.simulationTimeStep = val; return this; }

    public NumericVariableConfig noiseEnabled(boolean val) { this.noiseEnabled = val; return this; }
    public NumericVariableConfig noiseType(String val) { this.noiseType = val; return this; }
    public NumericVariableConfig noiseAmplitude(double val) { this.noiseAmplitude = val; return this; }
    public NumericVariableConfig noiseStdDev(double val) { this.noiseStdDev = val; return this; }

    public NumericVariableConfig spikeEnabled(boolean val) { this.spikeEnabled = val; return this; }
    public NumericVariableConfig spikeProbability(double val) { this.spikeProbability = val; return this; }
    public NumericVariableConfig spikeMode(String val) { this.spikeMode = val; return this; }
    public NumericVariableConfig spikeMagnitude(double val) { this.spikeMagnitude = val; return this; }
    public NumericVariableConfig spikeMin(double val) { this.spikeMin = val; return this; }
    public NumericVariableConfig spikeMax(double val) { this.spikeMax = val; return this; }
    public NumericVariableConfig spikeMultiplier(double val) { this.spikeMultiplier = val; return this; }

    // Getters & Setters
    public double getSineFrequency() { return sineFrequency; }
    public void setSineFrequency(double sineFrequency) { this.sineFrequency = sineFrequency; }
    public double getSineAmplitude() { return sineAmplitude; }
    public void setSineAmplitude(double sineAmplitude) { this.sineAmplitude = sineAmplitude; }
    public double getSinePhase() { return sinePhase; }
    public void setSinePhase(double sinePhase) { this.sinePhase = sinePhase; }
    public double getSineOffset() { return sineOffset; }
    public void setSineOffset(double sineOffset) { this.sineOffset = sineOffset; }

    public double getDriftRate() { return driftRate; }
    public void setDriftRate(double driftRate) { this.driftRate = driftRate; }
    public Double getDriftInitialValue() { return driftInitialValue; }
    public void setDriftInitialValue(Double driftInitialValue) { this.driftInitialValue = driftInitialValue; }
    public String getDriftLimitMode() { return driftLimitMode; }
    public void setDriftLimitMode(String driftLimitMode) { this.driftLimitMode = driftLimitMode; }

    public double getSimulationTimeStep() { return simulationTimeStep; }
    public void setSimulationTimeStep(double simulationTimeStep) { this.simulationTimeStep = simulationTimeStep; }

    public boolean isNoiseEnabled() { return noiseEnabled; }
    public void setNoiseEnabled(boolean noiseEnabled) { this.noiseEnabled = noiseEnabled; }
    public String getNoiseType() { return noiseType; }
    public void setNoiseType(String noiseType) { this.noiseType = noiseType; }
    public double getNoiseAmplitude() { return noiseAmplitude; }
    public void setNoiseAmplitude(double noiseAmplitude) { this.noiseAmplitude = noiseAmplitude; }
    public double getNoiseStdDev() { return noiseStdDev; }
    public void setNoiseStdDev(double noiseStdDev) { this.noiseStdDev = noiseStdDev; }

    public boolean isSpikeEnabled() { return spikeEnabled; }
    public void setSpikeEnabled(boolean spikeEnabled) { this.spikeEnabled = spikeEnabled; }
    public double getSpikeProbability() { return spikeProbability; }
    public void setSpikeProbability(double spikeProbability) { this.spikeProbability = spikeProbability; }
    public String getSpikeMode() { return spikeMode; }
    public void setSpikeMode(String spikeMode) { this.spikeMode = spikeMode; }
    public double getSpikeMagnitude() { return spikeMagnitude; }
    public void setSpikeMagnitude(double spikeMagnitude) { this.spikeMagnitude = spikeMagnitude; }
    public double getSpikeMin() { return spikeMin; }
    public void setSpikeMin(double spikeMin) { this.spikeMin = spikeMin; }
    public double getSpikeMax() { return spikeMax; }
    public void setSpikeMax(double spikeMax) { this.spikeMax = spikeMax; }
    public double getSpikeMultiplier() { return spikeMultiplier; }
    public void setSpikeMultiplier(double spikeMultiplier) { this.spikeMultiplier = spikeMultiplier; }

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
    }

    /**
     * Configuration for trend pattern. Only {@code intervalCount} and {@code intervalSize} are used
     * by the generator; {@code mode} is not implemented yet and the UI does not offer the TREND pattern.
     */
    public static class TrendConfig {
        public enum TrendMode {
            NORMAL, GRADUAL, JUMPING
        }

        public TrendMode mode = TrendMode.NORMAL;
        public int intervalCount = 10;
        public int intervalSize = 1;

        public int getIntervalCount() {
            return intervalCount;
        }
    }
}
