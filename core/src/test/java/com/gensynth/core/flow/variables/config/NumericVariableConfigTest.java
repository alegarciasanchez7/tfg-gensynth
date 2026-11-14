package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.GenerationPattern;
import com.gensynth.core.flow.variables.VariableFactory;
import org.junit.Test;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import static org.junit.Assert.*;

public class NumericVariableConfigTest {

    @Test
    public void testValidate_invalidRange_returnsError() {
        NumericVariableConfig config = VariableFactory.createNumeric("v1")
                .from(10.0)
                .to(5.0);
        List<String> errors = config.validate();
        assertFalse(errors.isEmpty());
        assertTrue(errors.get(0).contains("min must be <= max"));
    }

    @Test
    public void testValidate_initialValueOutOfRange_returnsError() {
        NumericVariableConfig config = VariableFactory.createNumeric("v2")
                .from(0.0)
                .to(10.0)
                .initial(15.0);
        List<String> errors = config.validate();
        assertFalse(errors.isEmpty());
        assertTrue(errors.get(0).contains("Initial value"));
    }

    @Test
    public void testValidate_stepLargerThanRange_returnsError() {
        NumericVariableConfig config = VariableFactory.createNumeric("v3")
                .from(0.0)
                .to(10.0)
                .step(15.0)
                .pattern(GenerationPattern.RANDOM);
        List<String> errors = config.validate();
        assertFalse(errors.isEmpty());
        assertTrue(errors.get(0).contains("exceeds the range"));
    }

    @Test
    public void testValidate_emptyCustomDistribution_returnsError() {
        NumericVariableConfig config = VariableFactory.createNumeric("v4")
                .from(0.0)
                .to(10.0)
                .pattern(GenerationPattern.DISTRIBUTION)
                .distributionType("CUSTOM")
                .customDistributionGraph(new ArrayList<>());
        List<String> errors = config.validate();
        assertFalse(errors.isEmpty());
        assertTrue(errors.get(0).contains("requires at least one segment"));
    }

    @Test
    public void testGenerate_normalDistribution_alwaysWithinRange() {
        NumericVariableConfig config = VariableFactory.createNumeric("v5")
                .from(10.0)
                .to(20.0)
                .pattern(GenerationPattern.DISTRIBUTION)
                .distributionType("NORMAL");
        
        for (int i = 0; i < 1000; i++) {
            Object val = config.generateNextValue();
            assertTrue(val instanceof Double || val instanceof Float);
            double d = ((Number) val).doubleValue();
            assertTrue("Value " + d + " out of bounds", d >= 10.0 && d <= 20.0);
        }
    }

    @Test
    public void testGenerate_exponentialDistribution_alwaysWithinRange() {
        NumericVariableConfig config = VariableFactory.createNumeric("v6")
                .from(1.0)
                .to(5.0)
                .pattern(GenerationPattern.DISTRIBUTION)
                .distributionType("EXPONENTIAL");
        
        for (int i = 0; i < 1000; i++) {
            Object val = config.generateNextValue();
            double d = ((Number) val).doubleValue();
            assertTrue("Value " + d + " out of bounds", d >= 1.0 && d <= 5.0);
        }
    }

    @Test
    public void testGenerate_constant_withMargin_staysInRange() {
        NumericVariableConfig config = VariableFactory.createNumeric("v7")
                .from(0.0)
                .to(10.0)
                .constant(9.0)
                .constantMargin(5.0);
        
        for (int i = 0; i < 1000; i++) {
            Object val = config.generateNextValue();
            double d = ((Number) val).doubleValue();
            assertTrue("Value " + d + " out of bounds", d >= 0.0 && d <= 10.0);
        }
    }

    @Test
    public void testGenerate_sequential_respectsInitialValue_tick1() {
        NumericVariableConfig config = VariableFactory.createNumeric("v8")
                .from(0.0)
                .to(100.0)
                .initial(42.0)
                .steps(10)
                .pattern(GenerationPattern.SEQUENTIAL);
        
        Object val = config.generateNextValue();
        assertEquals(42.0, ((Number) val).doubleValue(), 0.001);
    }

    @Test
    public void testGenerate_sinusoidal_correctWaveform() {
        NumericVariableConfig config = VariableFactory.createNumeric("sine1")
                .pattern(GenerationPattern.SINUSOIDAL)
                .sineFrequency(0.25) // 0.25 Hz -> period of 4 seconds
                .sineAmplitude(10.0)
                .sineOffset(50.0)
                .sinePhase(0.0)
                .simulationTimeStep(1.0);

        // Tick 1 (t = 0s): sin(0) = 0 -> 50.0
        double val1 = ((Number) config.generateNextValue()).doubleValue();
        assertEquals(50.0, val1, 0.001);

        // Tick 2 (t = 1s): sin(2*pi*0.25*1) = sin(pi/2) = 1 -> 50 + 10 = 60.0
        double val2 = ((Number) config.generateNextValue()).doubleValue();
        assertEquals(60.0, val2, 0.001);

        // Tick 3 (t = 2s): sin(pi) = 0 -> 50.0
        double val3 = ((Number) config.generateNextValue()).doubleValue();
        assertEquals(50.0, val3, 0.001);
    }

    @Test
    public void testGenerate_drift_linearIncrementAndLimit() {
        NumericVariableConfig config = VariableFactory.createNumeric("drift1")
                .from(0.0)
                .to(10.0)
                .pattern(GenerationPattern.DRIFT)
                .driftInitialValue(0.0)
                .driftRate(2.0) // 2 units/second
                .driftLimitMode("CLAMP")
                .simulationTimeStep(1.0);

        // Tick 1 (t = 0s): 0.0
        assertEquals(0.0, ((Number) config.generateNextValue()).doubleValue(), 0.001);
        // Tick 2 (t = 1s): 2.0
        assertEquals(2.0, ((Number) config.generateNextValue()).doubleValue(), 0.001);
        // Tick 3 (t = 2s): 4.0
        assertEquals(4.0, ((Number) config.generateNextValue()).doubleValue(), 0.001);
    }

    @Test
    public void testGenerate_noiseModifier_addsDispersal() {
        NumericVariableConfig config = VariableFactory.createNumeric("noise1")
                .constant(100.0)
                .noiseEnabled(true)
                .noiseType("UNIFORM")
                .noiseAmplitude(5.0); // Values should be within 95.0 .. 105.0

        for (int i = 0; i < 100; i++) {
            double val = ((Number) config.generateNextValue()).doubleValue();
            assertTrue("Value " + val + " out of noise bounds", val >= 95.0 && val <= 105.0);
        }
    }

    @Test
    public void testGenerate_spikeModifier_alwaysFiresWithFullProbability() {
        NumericVariableConfig config = VariableFactory.createNumeric("spike1")
                .constant(10.0)
                .spikeEnabled(true)
                .spikeProbability(1.0) // 100% chance
                .spikeMode("MULTIPLIER")
                .spikeMultiplier(5.0); // 10 * 5 = 50

        double val = ((Number) config.generateNextValue()).doubleValue();
        assertEquals(50.0, val, 0.001);
    }

    @Test
    public void testGenerate_noiseAndSpike_withIntegerPrecision_returnsIntegerType() {
        NumericVariableConfig config = VariableFactory.createNumeric("intNoiseSpike")
                .from(100.0)
                .to(200.0)
                .constant(100.0)
                .precision("INTEGER")
                .noiseEnabled(true)
                .noiseType("GAUSSIAN")
                .noiseStdDev(2.0)
                .spikeEnabled(true)
                .spikeProbability(1.0) // 100% chance spike
                .spikeMode("MULTIPLIER")
                .spikeMultiplier(2.0); // 100 * 2 = 200

        Object result = config.generateNextValue();
        assertTrue("Expected Long / Integer formatted value", result instanceof Long || result instanceof Integer);
        long intVal = ((Number) result).longValue();
        // Base 100 * spike 2 = 200 (+/- gaussian noise rounded)
        assertTrue("Value " + intVal + " should reflect base * spike + noise", intVal >= 180 && intVal <= 220);
    }

    @Test
    public void testGenerate_spikeMode_criticalRange() {
        NumericVariableConfig config = VariableFactory.createNumeric("criticalSpike")
                .constant(25.0)
                .spikeEnabled(true)
                .spikeProbability(1.0) // 100% chance spike
                .spikeMode("RANGE_SPIKE")
                .spikeMin(500.0)
                .spikeMax(600.0);

        for (int i = 0; i < 50; i++) {
            double val = ((Number) config.generateNextValue()).doubleValue();
            assertTrue("Spike value " + val + " out of critical range [500, 600]", val >= 500.0 && val <= 600.0);
        }
    }

    @Test
    public void testGenerate_highPrecisionFloatAndDouble_preservesMicroDecimalsWithNoise() {
        // High precision DOUBLE with 6 decimal places and micro-jitter (noiseAmplitude = 0.00005)
        NumericVariableConfig config = VariableFactory.createNumeric("highPrecisionDouble")
                .constant(12.345678)
                .precision("DOUBLE")
                .decimalPlaces(6)
                .noiseEnabled(true)
                .noiseType("UNIFORM")
                .noiseAmplitude(0.00005)
                .spikeEnabled(true)
                .spikeProbability(1.0)
                .spikeMode("FIXED_OFFSET")
                .spikeMagnitude(0.00010);

        Object valObj = config.generateNextValue();
        assertTrue("Expected Double instance", valObj instanceof Double);
        double val = (Double) valObj;
        
        // Base 12.345678 +/- spike 0.00010 +/- noise 0.00005 -> ~12.3455 .. 12.3458
        assertTrue("High precision value " + val + " should preserve micro-decimals", val >= 12.3450 && val <= 12.3460);
        // Verify 6 decimal places rounding precision
        double decimalsOnly = val - Math.floor(val);
        assertTrue("Should have fractional part", decimalsOnly > 0.34);
    }

    private static Map<String, Object> point(Object... keyValues) {
        Map<String, Object> map = new HashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            map.put((String) keyValues[i], keyValues[i + 1]);
        }
        return map;
    }

    private static double nextDouble(NumericVariableConfig config) {
        return (Double) config.generateNextValue();
    }

    @Test
    public void validate_listsEveryErrorInOrder() {
        NumericVariableConfig config = VariableFactory.createNumeric("errors")
                .from(0.0)
                .to(10.0)
                .step(-1.0)
                .pattern(GenerationPattern.SEQUENTIAL)
                .steps(0);
        assertEquals(List.of("Step cannot be negative", "Steps must be > 0 for SEQUENTIAL pattern"), config.validate());

        NumericVariableConfig formula = VariableFactory.createNumeric("formula").pattern(GenerationPattern.FORMULA);
        assertEquals(List.of("Formula pattern requires a non-empty formula expression"), formula.validate());
    }

    @Test
    public void validate_customDistributionWithoutPositiveWeights_returnsError() {
        NumericVariableConfig config = VariableFactory.createNumeric("zeroWeights")
                .pattern(GenerationPattern.DISTRIBUTION)
                .distributionType("CUSTOM")
                .customDistributionGraph(List.of(point("value", 5, "weight", 0), point("value", 6)));
        assertEquals(List.of("Custom distribution: all weights are zero or negative"), config.validate());
    }

    @Test
    public void generate_formulaWithoutExpression_givesZero() {
        NumericVariableConfig config = VariableFactory.createNumeric("formula").pattern(GenerationPattern.FORMULA);
        assertEquals(0.0, nextDouble(config), 0.0);
    }

    @Test
    public void generate_patternOfAnotherType_givesInitialOrMin() {
        NumericVariableConfig withInitial = VariableFactory.createNumeric("other")
                .from(1.0)
                .to(10.0)
                .initial(7.0)
                .pattern(GenerationPattern.FIXED_POINT);
        assertEquals(7.0, nextDouble(withInitial), 0.0);

        NumericVariableConfig withoutInitial = VariableFactory.createNumeric("other")
                .from(1.0)
                .to(10.0)
                .pattern(GenerationPattern.FIXED_POINT);
        assertEquals(1.0, nextDouble(withoutInitial), 0.0);
    }

    @Test
    public void generate_randomWithStep_givesWholeStepsAboveMin() {
        NumericVariableConfig config = VariableFactory.createNumeric("stepped")
                .from(0.0)
                .to(10.0)
                .step(2.5)
                .pattern(GenerationPattern.RANDOM);
        List<Double> allowed = List.of(0.0, 2.5, 5.0, 7.5, 10.0);
        for (int i = 0; i < 200; i++) {
            double val = nextDouble(config);
            assertTrue("Unexpected stepped value " + val, allowed.contains(val));
        }

        NumericVariableConfig stepTooLarge = VariableFactory.createNumeric("stepTooLarge")
                .from(0.0)
                .to(1.0)
                .step(2.0)
                .pattern(GenerationPattern.RANDOM);
        assertEquals(0.0, nextDouble(stepTooLarge), 0.0);
    }

    @Test
    public void generate_constantWithWholeMargin_hasNoDecimals() {
        NumericVariableConfig config = VariableFactory.createNumeric("wholeMargin")
                .from(0.0)
                .to(10.0)
                .constant(5.0)
                .constantMargin(1.0);
        for (int i = 0; i < 50; i++) {
            double val = nextDouble(config);
            assertEquals("Expected a whole value, got " + val, 0.0, val % 1.0, 0.0);
            assertTrue(val >= 4.0 && val <= 6.0);
        }
    }

    private static NumericVariableConfig drift(String mode, double start, double rate) {
        return VariableFactory.createNumeric("drift")
                .from(0.0)
                .to(10.0)
                .pattern(GenerationPattern.DRIFT)
                .driftInitialValue(start)
                .driftRate(rate)
                .driftLimitMode(mode);
    }

    private static double secondTick(NumericVariableConfig config) {
        config.generateNextValue();
        return nextDouble(config);
    }

    @Test
    public void generate_driftLimitModes_keepTheValueInRange() {
        // Each second tick drifts once: 8 + 5 = 13 above max, 2 - 5 = -3 below min
        assertEquals(3.0, secondTick(drift("WRAP", 8.0, 5.0)), 1e-9);
        assertEquals(7.0, secondTick(drift("reset", 2.0, -5.0)), 1e-9);
        assertEquals(5.0, secondTick(drift("WRAP", 4.0, 1.0)), 1e-9);
        assertEquals(7.0, secondTick(drift("BOUNCE", 8.0, 5.0)), 1e-9);
        assertEquals(3.0, secondTick(drift("BOUNCE", 2.0, -5.0)), 1e-9);
        assertEquals(10.0, secondTick(drift("UNKNOWN", 8.0, 5.0)), 1e-9);
        assertEquals(10.0, secondTick(drift(null, 8.0, 5.0)), 1e-9);
    }

    @Test
    public void generate_driftWithoutRange_isNotLimited() {
        NumericVariableConfig config = drift("CLAMP", 8.0, 5.0).from(5.0).to(5.0);
        assertEquals(13.0, secondTick(config), 1e-9);
    }

    @Test
    public void generate_driftStart_fallsBackToInitialThenMin() {
        NumericVariableConfig fromInitial = VariableFactory.createNumeric("drift")
                .from(1.0)
                .to(10.0)
                .initial(3.0)
                .pattern(GenerationPattern.DRIFT);
        assertEquals(3.0, nextDouble(fromInitial), 1e-9);

        NumericVariableConfig fromMin = VariableFactory.createNumeric("drift")
                .from(1.0)
                .to(10.0)
                .pattern(GenerationPattern.DRIFT);
        assertEquals(1.0, nextDouble(fromMin), 1e-9);
    }

    @Test
    public void generate_sequentialGraph_interpolatesBetweenPoints() {
        NumericVariableConfig config = VariableFactory.createNumeric("graph")
                .pattern(GenerationPattern.SEQUENTIAL)
                .sequentialGraph(List.of(point("x", 0, "y", 10), point("y", 99), point("x", 4, "y", 30)));
        double[] expected = {10, 15, 20, 25, 30, 10};
        for (double value : expected) {
            assertEquals(value, nextDouble(config), 1e-9);
        }
    }

    @Test
    public void generate_sequentialGraph_pointWithoutYGivesMin() {
        NumericVariableConfig config = VariableFactory.createNumeric("graph")
                .from(2.0)
                .pattern(GenerationPattern.SEQUENTIAL)
                .sequentialGraph(List.of(point("x", 0, "y", 10), point("x", 1)));
        assertEquals(10.0, nextDouble(config), 1e-9);
        assertEquals(2.0, nextDouble(config), 1e-9);
    }

    @Test
    public void generate_sequentialGraph_beforeTheFirstPointGivesItsY() {
        NumericVariableConfig config = VariableFactory.createNumeric("graph")
                .pattern(GenerationPattern.SEQUENTIAL)
                .sequentialGraph(List.of(point("x", 3, "y", 30), point("x", 2, "y", 20)));
        assertEquals(20.0, nextDouble(config), 1e-9);
        assertEquals(20.0, nextDouble(config), 1e-9);
        assertEquals(20.0, nextDouble(config), 1e-9);
        assertEquals(30.0, nextDouble(config), 1e-9);
    }

    @Test
    public void generate_sequentialGraphWithoutPositiveX_givesMin() {
        NumericVariableConfig config = VariableFactory.createNumeric("graph")
                .from(4.0)
                .pattern(GenerationPattern.SEQUENTIAL)
                .sequentialGraph(List.of(point("x", 0, "y", 10)));
        assertEquals(4.0, nextDouble(config), 1e-9);
    }

    private static NumericVariableConfig customDistribution(List<Map<String, Object>> segments) {
        return VariableFactory.createNumeric("custom")
                .from(1.0)
                .to(100.0)
                .pattern(GenerationPattern.DISTRIBUTION)
                .distributionType("CUSTOM")
                .customDistributionGraph(segments);
    }

    @Test
    public void generate_customDistributionWithoutPositiveWeights_usesTheFirstSegment() {
        double val = nextDouble(customDistribution(List.of(point("from", 2, "to", 3, "weight", 0))));
        assertTrue("Value " + val + " outside the first segment", val >= 2.0 && val <= 3.0);
        assertEquals(7.0, nextDouble(customDistribution(List.of(point("value", 7, "weight", 0)))), 0.0);
        assertEquals(1.0, nextDouble(customDistribution(List.of(point("weight", 0)))), 0.0);
    }

    @Test
    public void generate_customDistributionWithoutSegments_isUniformInRange() {
        double val = nextDouble(customDistribution(new ArrayList<>()));
        assertTrue("Value " + val + " outside [1, 100]", val >= 1.0 && val <= 100.0);
    }

    @Test
    public void generate_trend_staysInRange() {
        NumericVariableConfig config = VariableFactory.createNumeric("trend")
                .from(0.0).to(10.0).pattern(GenerationPattern.TREND);
        for (int i = 0; i < 20; i++) {
            double val = nextDouble(config);
            assertTrue("Value " + val + " outside [0, 10]", val >= 0.0 && val <= 10.0);
        }
    }

    @Test
    public void generate_customDistribution_skipsSegmentsWithoutWeight() {
        NumericVariableConfig config = customDistribution(List.of(point("value", 1), point("value", 5, "weight", 1)));
        for (int i = 0; i < 20; i++) {
            assertEquals(5.0, nextDouble(config), 0.0);
        }
    }

    private static NumericVariableConfig integerConstant(double value) {
        return VariableFactory.createNumeric("formatted").from(-100.0).to(100.0).constant(value).precision("INTEGER");
    }

    @Test
    public void format_integerFormatWithPrefixInBrackets() {
        assertEquals("ID-0042", integerConstant(42).integerFormat("(ID-)0000").generateNextValue());
        // An explicit prefix wins over the one in brackets
        assertEquals("P-0042", integerConstant(42).integerFormat("(ID-)0000").prefix("P-").generateNextValue());
        assertEquals("42 u", integerConstant(42).suffix(" u").generateNextValue());
    }

    @Test
    public void format_integerFormatEdgeCases() {
        // A ")" before the "(" is not a prefix: the format is ignored and the value stays a number
        assertEquals(42L, integerConstant(42).integerFormat(")ID-(0000").generateNextValue());
        // A format that is not zero padding keeps the digits as they are, but as text
        assertEquals("42", integerConstant(42).integerFormat("abc").generateNextValue());
        assertEquals("0042", integerConstant(42).integerFormat("0000").generateNextValue());
        // Without a closing bracket the whole format is taken as the (non padding) digits
        assertEquals("42", integerConstant(42).integerFormat("(0000").generateNextValue());
        assertEquals(42L, integerConstant(42).prefix(null).suffix(null).generateNextValue());
    }

    @Test
    public void format_decimalWithIntegerFormat_padsTheIntegerPart() {
        NumericVariableConfig positive = VariableFactory.createNumeric("formatted")
                .from(-100.0).to(100.0).constant(42.5).integerFormat("0000");
        assertEquals("0042.50", positive.generateNextValue());
        assertEquals(42.5, positive.getLastNumericValue(), 0.0);

        NumericVariableConfig negative = VariableFactory.createNumeric("formatted")
                .from(-100.0).to(100.0).constant(-3.25).integerFormat("(T=)0000").suffix("C");
        assertEquals("T=-0003.25C", negative.generateNextValue());
    }

    @Test
    public void format_integerPartTooLongForPadding_isKeptAsIs() {
        NumericVariableConfig config = VariableFactory.createNumeric("huge")
                .from(0.0)
                .to(1e21)
                .initial(1e20)
                .pattern(GenerationPattern.RANDOM)
                .decimalPlaces(-1)
                .integerFormat("0000");
        assertEquals("100000000000000000000.00", config.generateNextValue());
    }

    @Test
    public void format_floatPrecision_givesAFloat() {
        NumericVariableConfig config = VariableFactory.createNumeric("float")
                .from(0.0).to(10.0).constant(1.25).precision("FLOAT");
        assertEquals(1.25f, config.generateNextValue());
    }

    @Test
    public void generate_fromListReference_parsesTheItemOrFallsBack() {
        ListVariableConfig source = VariableFactory.createList("src")
                .items(List.of(new ListVariableConfig.ListItem("text", " 12.5 ", 1.0),
                        new ListVariableConfig.ListItem("number", 7, 1.0),
                        new ListVariableConfig.ListItem("bad", "oops", 1.0)));
        Map<String, Object> context = Map.of("src_config", source);

        assertEquals(12.5, nextDouble(referencing(context, "text")), 0.0);
        assertEquals(7.0, nextDouble(referencing(context, "number")), 0.0);
        // Not a number: the variable generates its own value
        assertEquals(3.0, nextDouble(referencing(context, "bad")), 0.0);
        // No such list in the context: same fallback
        assertEquals(3.0, nextDouble(referencing(Map.of(), "text")), 0.0);
    }

    private static NumericVariableConfig referencing(Map<String, Object> context, String itemId) {
        // Its own value is the min (a pattern of another type); a constant would round the item to 0 decimals
        NumericVariableConfig config = VariableFactory.createNumeric("ref").from(3.0).to(10.0)
                .pattern(GenerationPattern.FIXED_POINT);
        config.setSourceListVariableId("src");
        config.setSourceListSelectionMode("FIXED_ITEM");
        config.setSelectedListItemId(itemId);
        config.setContext(context);
        return config;
    }
}
