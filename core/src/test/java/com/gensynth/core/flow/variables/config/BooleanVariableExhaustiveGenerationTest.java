package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.AnomalyConfig;
import com.gensynth.core.flow.variables.AnomalyType;
import com.gensynth.core.flow.variables.GenerationPattern;
import com.gensynth.core.flow.variables.VariableFactory;
import com.gensynth.core.flow.variables.VariableConfiguration;
import org.junit.Before;
import org.junit.Test;

import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/**
 * Exhaustive test suite for BooleanVariableConfig.
 * Tests all available patterns, edge cases, anomaly combinations, factory serialization,
 * validation constraints, and high-volume stress performance.
 */
public class BooleanVariableExhaustiveGenerationTest {

    private BooleanVariableConfig config;

    @Before
    public void setUp() {
        config = VariableFactory.createBoolean("digital_signal_test");
    }

    /**
     * Test CONSTANT_BOOLEAN pattern exhaustively.
     */
    @Test
    public void testExhaustive_ConstantBoolean() {
        config.pattern(GenerationPattern.CONSTANT_BOOLEAN).constantValue(true);
        for (int i = 0; i < 1000; i++) {
            assertEquals(true, config.generateNextValue());
        }

        config.constantValue(false);
        for (int i = 0; i < 1000; i++) {
            assertEquals(false, config.generateNextValue());
        }
    }

    /**
     * Test DUTY_CYCLE pattern exhaustively with different ON/OFF parameters.
     */
    @Test
    public void testExhaustive_DutyCycle() {
        config.pattern(GenerationPattern.DUTY_CYCLE)
                .onDurationTicks(4)
                .offDurationTicks(2)
                .startWithTrue(true);

        for (int cycle = 0; cycle < 50; cycle++) {
            assertEquals(true, config.generateNextValue());  // ON 1
            assertEquals(true, config.generateNextValue());  // ON 2
            assertEquals(true, config.generateNextValue());  // ON 3
            assertEquals(true, config.generateNextValue());  // ON 4
            assertEquals(false, config.generateNextValue()); // OFF 1
            assertEquals(false, config.generateNextValue()); // OFF 2
        }
    }

    /**
     * Test ALTERNATING_BOOLEAN pattern exhaustively.
     */
    @Test
    public void testExhaustive_AlternatingBoolean() {
        config.pattern(GenerationPattern.ALTERNATING_BOOLEAN)
                .alternationInterval(3)
                .startWithTrue(true);

        for (int cycle = 0; cycle < 20; cycle++) {
            assertEquals(true, config.generateNextValue());  // 1
            assertEquals(true, config.generateNextValue());  // 2
            assertEquals(true, config.generateNextValue());  // 3
            assertEquals(false, config.generateNextValue()); // 4 (toggle)
            assertEquals(false, config.generateNextValue()); // 5
            assertEquals(false, config.generateNextValue()); // 6
        }
    }

    /**
     * Test PROBABILITY pattern exhaustively (deterministic limits and statistical bounds).
     */
    @Test
    public void testExhaustive_Probability() {
        // Deterministic P(true) = 1.0
        config.pattern(GenerationPattern.PROBABILITY).trueProbability(1.0);
        for (int i = 0; i < 1000; i++) {
            assertEquals(true, config.generateNextValue());
        }

        // Deterministic P(true) = 0.0
        config.trueProbability(0.0);
        for (int i = 0; i < 1000; i++) {
            assertEquals(false, config.generateNextValue());
        }

        // Statistical distribution check for P(true) = 0.70 over 10,000 iterations
        config.trueProbability(0.70);
        int trueCount = 0;
        int total = 10000;
        for (int i = 0; i < total; i++) {
            if ((Boolean) config.generateNextValue()) {
                trueCount++;
            }
        }
        double ratio = (double) trueCount / total;
        assertEquals(0.70, ratio, 0.03); // Within +/- 3% tolerance
    }

    /**
     * Test FLIP_INTERVAL pattern exhaustively.
     */
    @Test
    public void testExhaustive_FlipInterval() {
        config.pattern(GenerationPattern.FLIP_INTERVAL)
                .flipInterval(5)
                .startWithTrue(false);

        for (int cycle = 0; cycle < 10; cycle++) {
            for (int i = 0; i < 5; i++) {
                assertEquals(false, config.generateNextValue());
            }
            for (int i = 0; i < 5; i++) {
                assertEquals(true, config.generateNextValue());
            }
        }
    }

    /**
     * Test BURST_MODE pattern exhaustively.
     */
    @Test
    public void testExhaustive_BurstMode() {
        config.pattern(GenerationPattern.BURST_MODE)
                .burstDurationTicks(3)
                .burstIdleTicks(3)
                .startWithTrue(true);

        for (int cycle = 0; cycle < 30; cycle++) {
            assertEquals(true, config.generateNextValue());  // Burst 1
            assertEquals(true, config.generateNextValue());  // Burst 2
            assertEquals(true, config.generateNextValue());  // Burst 3
            assertEquals(false, config.generateNextValue()); // Idle 1
            assertEquals(false, config.generateNextValue()); // Idle 2
            assertEquals(false, config.generateNextValue()); // Idle 3
        }
    }

    /**
     * Test MARKOV chain pattern exhaustively.
     */
    @Test
    public void testExhaustive_MarkovChain() {
        // Deterministic Markov: P(T -> T) = 1.0, P(F -> T) = 1.0
        config.pattern(GenerationPattern.MARKOV)
                .pTrueToTrue(1.0)
                .pFalseToTrue(1.0)
                .startWithTrue(false);

        // Initial false -> switches to true immediately
        assertEquals(false, config.getCurrentValue());
        assertEquals(true, config.generateNextValue());
        assertEquals(true, config.generateNextValue());
        assertEquals(true, config.generateNextValue());

        // Statistical Markov check: P(T -> T) = 0.9, P(F -> T) = 0.1
        config.pTrueToTrue(0.9)
                .pFalseToTrue(0.1)
                .startWithTrue(true);

        int transitionsToTrue = 0;
        int totalRuns = 10000;
        for (int i = 0; i < totalRuns; i++) {
            Boolean val = (Boolean) config.generateNextValue();
            assertNotNull(val);
            if (val) transitionsToTrue++;
        }
        assertTrue(transitionsToTrue > 0);
    }

    /**
     * Test interaction between Boolean patterns and Anomaly configurations.
     */
    @Test
    public void testExhaustive_AnomalyInteractions() {
        AnomalyConfig anomaly = new AnomalyConfig()
                .type(AnomalyType.MAKE_AND_KEEP_N_TIMES)
                .whenTicks(3)
                .keepNTimes(2)
                .anomalousValue(false);
        anomaly.setEnabled(true);

        config.pattern(GenerationPattern.CONSTANT_BOOLEAN)
                .constantValue(true)
                .anomaly(anomaly);

        assertEquals(true, config.generateNextValue());  // Tick 1: Normal true
        assertEquals(true, config.generateNextValue());  // Tick 2: Normal true
        assertEquals(false, config.generateNextValue()); // Tick 3: Anomaly triggered (false)
        assertEquals(false, config.generateNextValue()); // Tick 4: Anomaly kept (false)
        assertEquals(true, config.generateNextValue());  // Tick 5: Recovered to normal (true)
    }

    /**
     * Test serialization to Map and deserialization back via VariableFactory.createFromMap for all 7 patterns.
     */
    @Test
    public void testExhaustive_FactorySerializationAndDeserialization() {
        GenerationPattern[] patterns = {
                GenerationPattern.CONSTANT_BOOLEAN,
                GenerationPattern.DUTY_CYCLE,
                GenerationPattern.ALTERNATING_BOOLEAN,
                GenerationPattern.PROBABILITY,
                GenerationPattern.FLIP_INTERVAL,
                GenerationPattern.BURST_MODE,
                GenerationPattern.MARKOV
        };

        for (GenerationPattern p : patterns) {
            BooleanVariableConfig original = VariableFactory.createBoolean("var_" + p.name())
                    .pattern(p)
                    .constantValue(true)
                    .onDurationTicks(3)
                    .offDurationTicks(2)
                    .alternationInterval(4)
                    .trueProbability(0.8)
                    .flipInterval(5)
                    .burstDurationTicks(6)
                    .burstIdleTicks(7)
                    .pTrueToTrue(0.95)
                    .pFalseToTrue(0.05);

            Map<String, Object> map = original.toMap();
            VariableConfiguration restored = VariableFactory.createFromMap("var_" + p.name(), "BOOLEAN", map);

            assertNotNull("Restored config should not be null for pattern " + p, restored);
            assertTrue(restored instanceof BooleanVariableConfig);
            BooleanVariableConfig boolRestored = (BooleanVariableConfig) restored;

            assertEquals(p, boolRestored.getPattern());
            assertEquals(0.8, boolRestored.getTrueProbability(), 0.001);
            assertEquals(5, boolRestored.getFlipInterval());
            assertEquals(6, boolRestored.getBurstDurationTicks());
            assertEquals(7, boolRestored.getBurstIdleTicks());
            assertEquals(0.95, boolRestored.getPTrueToTrue(), 0.001);
            assertEquals(0.05, boolRestored.getPFalseToTrue(), 0.001);
        }
    }

    /**
     * Test validation edge cases and boundary constraints.
     */
    @Test
    public void testExhaustive_ValidationAndEdgeCases() {
        // Valid configuration
        List<String> errors = config.validate();
        assertTrue(errors.isEmpty());

        // Test invalid probabilities
        config.trueProbability(0.5);
        try {
            config.trueProbability(1.5);
            fail("Should throw IllegalArgumentException for probability > 1.0");
        } catch (IllegalArgumentException expected) {}

        try {
            config.trueProbability(-0.1);
            fail("Should throw IllegalArgumentException for probability < 0.0");
        } catch (IllegalArgumentException expected) {}

        // Test invalid intervals
        try {
            config.flipInterval(0);
            fail("Should throw IllegalArgumentException for flipInterval <= 0");
        } catch (IllegalArgumentException expected) {}

        try {
            config.burstDurationTicks(-5);
            fail("Should throw IllegalArgumentException for burstDurationTicks <= 0");
        } catch (IllegalArgumentException expected) {}
    }

    /**
     * Stress test generating high volumes of values across all patterns without exceptions.
     */
    @Test
    public void testExhaustive_HighVolumeStress() {
        GenerationPattern[] patterns = GenerationPattern.values();
        for (GenerationPattern p : patterns) {
            if (p.name().contains("BOOLEAN") || p == GenerationPattern.PROBABILITY ||
                p == GenerationPattern.FLIP_INTERVAL || p == GenerationPattern.BURST_MODE || p == GenerationPattern.MARKOV) {
                
                BooleanVariableConfig stressConfig = VariableFactory.createBoolean("stress_" + p.name())
                        .pattern(p)
                        .trueProbability(0.5)
                        .flipInterval(2)
                        .burstDurationTicks(3)
                        .burstIdleTicks(2)
                        .pTrueToTrue(0.8)
                        .pFalseToTrue(0.2);

                for (int i = 0; i < 50000; i++) {
                    Object val = stressConfig.generateNextValue();
                    assertNotNull("Value should never be null during stress test", val);
                    assertTrue("Generated value must be Boolean", val instanceof Boolean);
                }
            }
        }
    }
}

