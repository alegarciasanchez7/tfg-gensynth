package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.GenerationPattern;
import com.gensynth.core.flow.variables.VariableFactory;
import org.junit.Test;

import java.util.*;

import static org.junit.Assert.*;

/**
 * Stress and validation benchmark test that generates 1,000,000 numeric values
 * across complex, un-tested configuration scenarios to prove mathematical accuracy
 * and rule adherence under extreme throughput.
 */
public class ExhaustiveNumericGenerationTest {

    private static final int SAMPLES_PER_SCENARIO = 250_000; // 4 scenarios * 250,000 = 1,000,000 events

    @Test
    public void testExhaustiveGeneration_oneMillionEventsAcrossScenarios() {
        long startTime = System.currentTimeMillis();

        testScenario1_SinusoidalHighFreq_GaussianNoise_IntegerPadding();
        testScenario2_LinearDriftBounce_CriticalSpikeAnomalies();
        testScenario3_CustomEqualizerDistribution_UniformJitter();
        testScenario4_ComplexFormula_MultiplierSpikes_PrefixSuffix();

        long duration = System.currentTimeMillis() - startTime;
        System.out.println(">>> SUCCESSFULLY GENERATED AND VALIDATED 1,000,000 NUMERIC EVENTS IN " + duration + " ms <<<");
    }

    /**
     * Scenario 1: High frequency Sine Wave (100 Hz), Accelerated Virtual Clock (1 ms/tick),
     * Gaussian Noise (σ = 3.0), and INTEGER zero-padding formatting ("00000").
     */
    private void testScenario1_SinusoidalHighFreq_GaussianNoise_IntegerPadding() {
        NumericVariableConfig config = VariableFactory.createNumeric("sensor_fast_sine")
                .pattern(GenerationPattern.SINUSOIDAL)
                .sineFrequency(100.0) // 100 Hz
                .sineAmplitude(50.0)
                .sineOffset(500.0)
                .sinePhase(Math.PI / 4.0) // 45 degrees phase shift
                .simulationTimeStep(0.001) // 1 ms per tick
                .noiseEnabled(true)
                .noiseType("GAUSSIAN")
                .noiseStdDev(3.0)
                .precision("INTEGER")
                .integerFormat("00000");

        int paddedStringCount = 0;

        for (int i = 0; i < SAMPLES_PER_SCENARIO; i++) {
            Object obj = config.generateNextValue();
            assertNotNull("Generated value should not be null", obj);
            String formatted = obj.toString();
            
            // Format check: integer format "00000" produces padded strings
            assertTrue("Formatted integer must have at least 5 digits: " + formatted, formatted.length() >= 5);
            paddedStringCount++;

            long val = Long.parseLong(formatted);
            // Theoretical bounds: Offset (500) +/- Amp (50) +/- 4*sigma (12) -> [438, 562]
            assertTrue("Value " + val + " outside expected noise range [420, 580]", val >= 420 && val <= 580);
        }

        assertEquals(SAMPLES_PER_SCENARIO, paddedStringCount);
    }

    /**
     * Scenario 2: Continuous Linear Drift with BOUNCE collision mode, 0.5s/tick step,
     * and 2% probability of Critical Range Spikes [900, 1000].
     */
    private void testScenario2_LinearDriftBounce_CriticalSpikeAnomalies() {
        NumericVariableConfig config = VariableFactory.createNumeric("sensor_drift_bounce")
                .from(-50.0)
                .to(50.0)
                .pattern(GenerationPattern.DRIFT)
                .driftRate(5.0) // 5 units/second
                .driftInitialValue(0.0)
                .driftLimitMode("BOUNCE")
                .simulationTimeStep(0.5) // 2.5 units per tick
                .spikeEnabled(true)
                .spikeProbability(0.02) // 2% chance
                .spikeMode("RANGE_SPIKE")
                .spikeMin(900.0)
                .spikeMax(1000.0)
                .precision("DOUBLE")
                .decimalPlaces(2);

        int spikeCount = 0;
        int normalCount = 0;

        for (int i = 0; i < SAMPLES_PER_SCENARIO; i++) {
            Object obj = config.generateNextValue();
            double val = ((Number) obj).doubleValue();

            if (val >= 900.0 && val <= 1000.0) {
                spikeCount++;
            } else {
                normalCount++;
                // Normal values must strictly obey BOUNCE boundaries [-50, +50]
                assertTrue("Normal drift value " + val + " exceeded bounds [-50, 50]", val >= -50.0 && val <= 50.0);
            }
        }

        // Empirical check: 2% probability over 250,000 samples should yield ~5,000 spikes (+/- 800)
        double empiricalRatio = (double) spikeCount / SAMPLES_PER_SCENARIO;
        assertTrue("Empirical spike ratio " + empiricalRatio + " should be ~0.02", empiricalRatio >= 0.015 && empiricalRatio <= 0.025);
        assertEquals(SAMPLES_PER_SCENARIO, spikeCount + normalCount);
    }

    /**
     * Scenario 3: Custom Weighted Equalizer Distribution (3 disjoint bands) + Uniform Jitter Noise (±0.5).
     * Band A: [0..10] (weight 70), Band B: [50..60] (weight 20), Band C: [100..110] (weight 10).
     */
    private void testScenario3_CustomEqualizerDistribution_UniformJitter() {
        List<Map<String, Object>> distGraph = new ArrayList<>();
        distGraph.add(Map.of("from", 0.0, "to", 10.0, "weight", 70.0));
        distGraph.add(Map.of("from", 50.0, "to", 60.0, "weight", 20.0));
        distGraph.add(Map.of("from", 100.0, "to", 110.0, "weight", 10.0));

        NumericVariableConfig config = VariableFactory.createNumeric("sensor_equalizer")
                .pattern(GenerationPattern.DISTRIBUTION)
                .distributionType("CUSTOM")
                .customDistributionGraph(distGraph)
                .noiseEnabled(true)
                .noiseType("UNIFORM")
                .noiseAmplitude(0.5) // +/- 0.5 jitter
                .precision("DOUBLE")
                .decimalPlaces(3);

        int countBandA = 0;
        int countBandB = 0;
        int countBandC = 0;

        for (int i = 0; i < SAMPLES_PER_SCENARIO; i++) {
            double val = ((Number) config.generateNextValue()).doubleValue();

            // Check which band the value fell into (including jitter bounds)
            if (val >= -0.6 && val <= 10.6) {
                countBandA++;
            } else if (val >= 49.4 && val <= 60.6) {
                countBandB++;
            } else if (val >= 99.4 && val <= 110.6) {
                countBandC++;
            } else {
                fail("Value " + val + " did not fall into any configured distribution band with jitter");
            }
        }

        // Empirical check: 70% : 20% : 10% ratio (+/- 2% tolerance)
        double ratioA = (double) countBandA / SAMPLES_PER_SCENARIO;
        double ratioB = (double) countBandB / SAMPLES_PER_SCENARIO;
        double ratioC = (double) countBandC / SAMPLES_PER_SCENARIO;

        assertTrue("Band A ratio " + ratioA + " should be ~0.70", Math.abs(ratioA - 0.70) < 0.02);
        assertTrue("Band B ratio " + ratioB + " should be ~0.20", Math.abs(ratioB - 0.20) < 0.02);
        assertTrue("Band C ratio " + ratioC + " should be ~0.10", Math.abs(ratioC - 0.10) < 0.02);
    }

    /**
     * Scenario 4: Complex Mathematical Formula with context variables + Multiplier Spike Layer (-1.0 sign invert)
     * + Prefix/Suffix formatting ("DAT[...", "]").
     */
    private void testScenario4_ComplexFormula_MultiplierSpikes_PrefixSuffix() {
        NumericVariableConfig config = VariableFactory.createNumeric("sensor_formula_formatted")
                .pattern(GenerationPattern.FORMULA)
                .formula("({{temp}} * 1.8 + 32) + sin({{pressure}} / 100)")
                .prefix("DAT[")
                .suffix("]")
                .spikeEnabled(true)
                .spikeProbability(0.01) // 1% sign-inversion spike
                .spikeMode("MULTIPLIER")
                .spikeMultiplier(-1.0) // Inverts sign
                .precision("FLOAT")
                .decimalPlaces(2);

        Map<String, Object> ctx = new HashMap<>();
        ctx.put("temp", 25.0); // (25 * 1.8 + 32) = 77.0
        ctx.put("pressure", 1013.25);
        config.setContext(ctx);

        int formattedCount = 0;
        int invertedSpikeCount = 0;

        for (int i = 0; i < SAMPLES_PER_SCENARIO; i++) {
            Object obj = config.generateNextValue();
            String str = obj.toString();

            // Prefix and suffix contract validation
            assertTrue("String must start with DAT[: " + str, str.startsWith("DAT["));
            assertTrue("String must end with ]: " + str, str.endsWith("]"));
            formattedCount++;

            String numPart = str.substring(4, str.length() - 1);
            double val = Double.parseDouble(numPart);

            if (val < 0) {
                invertedSpikeCount++;
                // Inverted spike around -77.0 +/- sin() offset
                assertTrue("Inverted spike value " + val + " out of expected range", val >= -80.0 && val <= -74.0);
            } else {
                // Normal formula value around +77.0 +/- sin() offset
                assertTrue("Normal formula value " + val + " out of expected range", val >= 74.0 && val <= 80.0);
            }
        }

        assertEquals(SAMPLES_PER_SCENARIO, formattedCount);
        double empiricalSpikeRatio = (double) invertedSpikeCount / SAMPLES_PER_SCENARIO;
        assertTrue("Empirical spike ratio " + empiricalSpikeRatio + " should be ~0.01", Math.abs(empiricalSpikeRatio - 0.01) < 0.005);
    }
}
