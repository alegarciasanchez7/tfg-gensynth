package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.GenerationPattern;
import com.gensynth.core.flow.variables.VariableFactory;
import org.junit.Test;
import java.util.ArrayList;
import java.util.List;
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
}
