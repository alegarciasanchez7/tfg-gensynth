package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import org.junit.Before;
import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.*;

/**
 * Tests for boolean variable configuration
 */
public class BooleanVariableConfigTest {

    private BooleanVariableConfig config;

    @Before
    public void setUp() {
        config = new BooleanVariableConfig()
            .identifier("device_enabled");
    }

    @Test
    public void testBooleanConfigCreation() {
        assertEquals("device_enabled", config.getIdentifier());
        assertEquals(VariableType.BOOLEAN, config.getType());
        assertTrue(config.getCurrentValue());  // Default is TRUE
    }

    @Test
    public void testConstantBooleanTrue() {
        config.pattern(GenerationPattern.CONSTANT_BOOLEAN)
            .constantValue(true);

        Object value1 = config.generateNextValue();
        Object value2 = config.generateNextValue();
        Object value3 = config.generateNextValue();

        assertEquals(true, value1);
        assertEquals(true, value2);
        assertEquals(true, value3);
    }

    @Test
    public void testConstantBooleanFalse() {
        config.pattern(GenerationPattern.CONSTANT_BOOLEAN)
            .constantValue(false);

        Object value1 = config.generateNextValue();
        Object value2 = config.generateNextValue();

        assertEquals(false, value1);
        assertEquals(false, value2);
    }

    @Test
    public void testDutyCycleBasic() {
        // 2 ticks ON, 2 ticks OFF
        config.pattern(GenerationPattern.DUTY_CYCLE)
            .onDurationTicks(2)
            .offDurationTicks(2)
            .startWithTrue(true);

        Object v1 = config.generateNextValue();  // START: ON
        Object v2 = config.generateNextValue();  // ON (2nd tick)
        Object v3 = config.generateNextValue();  // SWITCH: OFF
        Object v4 = config.generateNextValue();  // OFF (2nd tick)
        Object v5 = config.generateNextValue();  // SWITCH: ON
        Object v6 = config.generateNextValue();  // ON (2nd tick)

        assertEquals(true, v1);
        assertEquals(true, v2);
        assertEquals(false, v3);
        assertEquals(false, v4);
        assertEquals(true, v5);
        assertEquals(true, v6);
    }

    @Test
    public void testDutyCycleStartFalse() {
        config.pattern(GenerationPattern.DUTY_CYCLE)
            .onDurationTicks(1)
            .offDurationTicks(2)
            .startWithTrue(false);

        Object v1 = config.generateNextValue();  // OFF
        Object v2 = config.generateNextValue();  // OFF (2nd tick, switch)
        Object v3 = config.generateNextValue();  // ON
        Object v4 = config.generateNextValue();  // OFF
        Object v5 = config.generateNextValue();  // OFF (2nd tick)

        assertEquals(false, v1);
        assertEquals(false, v2);
        assertEquals(true, v3);
        assertEquals(false, v4);
        assertEquals(false, v5);
    }

    @Test
    public void testAlternatingPattern() {
        // Interval 1: toggle every tick
        config.pattern(GenerationPattern.ALTERNATING_BOOLEAN)
            .alternationInterval(1)
            .startWithTrue(true);

        Object v1 = config.generateNextValue();  // TRUE
        Object v2 = config.generateNextValue();  // FALSE (toggle)
        Object v3 = config.generateNextValue();  // TRUE (toggle)
        Object v4 = config.generateNextValue();  // FALSE (toggle)

        assertEquals(true, v1);
        assertEquals(false, v2);
        assertEquals(true, v3);
        assertEquals(false, v4);
    }

    @Test
    public void testAlternatingIntervalTwo() {
        // Interval 2: stay 2 ticks before toggle
        config.pattern(GenerationPattern.ALTERNATING_BOOLEAN)
            .alternationInterval(2)
            .startWithTrue(true);

        Object v1 = config.generateNextValue();  // TRUE
        Object v2 = config.generateNextValue();  // TRUE (2nd tick)
        Object v3 = config.generateNextValue();  // FALSE (toggle)
        Object v4 = config.generateNextValue();  // FALSE (2nd tick)
        Object v5 = config.generateNextValue();  // TRUE (toggle)

        assertEquals(true, v1);
        assertEquals(true, v2);
        assertEquals(false, v3);
        assertEquals(false, v4);
        assertEquals(true, v5);
    }

    @Test
    public void testReset() {
        config.pattern(GenerationPattern.DUTY_CYCLE)
            .onDurationTicks(3)
            .offDurationTicks(2);

        config.generateNextValue();
        config.generateNextValue();

        long ticksAfter = config.getTickCounter();
        assertTrue(ticksAfter > 0);

        config.reset();
        assertEquals(0, config.getTickCounter());
        assertEquals(0, config.getTicksInCurrentState());
        assertTrue(config.getCurrentValue());
    }

    @Test
    public void testAnomalyTickBased() {
        AnomalyConfig anomaly = new AnomalyConfig()
            .type(AnomalyType.MAKE_AND_BACK)
            .whenTicks(2)
            .anomalousValue(false);
        anomaly.setEnabled(true);

        config.pattern(GenerationPattern.CONSTANT_BOOLEAN)
            .constantValue(true)
            .anomaly(anomaly);

        Object v1 = config.generateNextValue();  // TRUE (normal)
        Object v2 = config.generateNextValue();  // FALSE (anomaly triggered)
        Object v3 = config.generateNextValue();  // TRUE (anomaly recovered)

        assertEquals(true, v1);
        assertEquals(false, v2);
        assertEquals(true, v3);
    }

    @Test
    public void testAnomalyProbabilityBased() {
        AnomalyConfig anomaly = new AnomalyConfig()
            .type(AnomalyType.MAKE_AND_BACK)
            .probabilityRatio(100.0)  // 100% guaranteed
            .anomalousValue(false);
        anomaly.setEnabled(true);

        config.pattern(GenerationPattern.CONSTANT_BOOLEAN)
            .constantValue(true)
            .anomaly(anomaly);

        Object v1 = config.generateNextValue();  // Anomaly triggered (100% probability)
        assertEquals(false, v1);
    }

    @Test
    public void testBuilderChain() {
        BooleanVariableConfig chained = new BooleanVariableConfig()
            .identifier("sensor")
            .pattern(GenerationPattern.DUTY_CYCLE)
            .onDurationTicks(5)
            .offDurationTicks(3);

        assertEquals("sensor", chained.getIdentifier());
        assertEquals(GenerationPattern.DUTY_CYCLE, chained.getPattern());
        assertEquals(5, chained.getOnDurationTicks());
        assertEquals(3, chained.getOffDurationTicks());
        
        // Verify it generates values correctly
        Object v1 = chained.generateNextValue();
        assertNotNull(v1);
        assertTrue(v1 instanceof Boolean);
    }

    @Test
    public void testToMap() {
        config.pattern(GenerationPattern.DUTY_CYCLE)
            .onDurationTicks(4)
            .offDurationTicks(2);

        Map<String, Object> map = config.toMap();

        assertEquals("device_enabled", map.get("identifier"));
        assertEquals("BOOLEAN", map.get("type"));
        assertEquals("DUTY_CYCLE", map.get("pattern"));
        assertEquals(4, map.get("onDurationTicks"));
        assertEquals(2, map.get("offDurationTicks"));
    }

    @Test
    public void testProbabilityPattern() {
        config.pattern(GenerationPattern.PROBABILITY)
            .trueProbability(1.0); // Always true

        assertEquals(true, config.generateNextValue());
        assertEquals(true, config.generateNextValue());

        config.trueProbability(0.0); // Always false
        assertEquals(false, config.generateNextValue());
        assertEquals(false, config.generateNextValue());
    }

    @Test
    public void testFlipIntervalPattern() {
        config.pattern(GenerationPattern.FLIP_INTERVAL)
            .flipInterval(3)
            .startWithTrue(true);

        assertEquals(true, config.generateNextValue()); // Tick 1
        assertEquals(true, config.generateNextValue()); // Tick 2
        assertEquals(true, config.generateNextValue()); // Tick 3 (toggles next)
        assertEquals(false, config.generateNextValue()); // Tick 4
        assertEquals(false, config.generateNextValue()); // Tick 5
        assertEquals(false, config.generateNextValue()); // Tick 6
        assertEquals(true, config.generateNextValue()); // Tick 7
    }

    @Test
    public void testBurstModePattern() {
        config.pattern(GenerationPattern.BURST_MODE)
            .burstDurationTicks(2)
            .burstIdleTicks(2)
            .startWithTrue(true);

        assertEquals(true, config.generateNextValue()); // Burst 1
        assertEquals(true, config.generateNextValue()); // Burst 2
        assertEquals(false, config.generateNextValue()); // Idle 1
        assertEquals(false, config.generateNextValue()); // Idle 2
        assertEquals(true, config.generateNextValue()); // Burst 1
    }

    @Test
    public void testMarkovPattern() {
        config.pattern(GenerationPattern.MARKOV)
            .pTrueToTrue(1.0)
            .pFalseToTrue(1.0)
            .startWithTrue(true);

        assertEquals(true, config.generateNextValue());
        assertEquals(true, config.generateNextValue());
    }

    @Test
    public void testFactoryCreateFromMapNewPatterns() {
        Map<String, Object> map = java.util.Map.of(
            "pattern", "BURST_MODE",
            "burstDurationTicks", 4,
            "burstIdleTicks", 2,
            "trueProbability", 0.75,
            "pTrueToTrue", 0.9,
            "pFalseToTrue", 0.1
        );

        VariableConfiguration created = VariableFactory.createFromMap("bool1", "BOOLEAN", map);
        assertTrue(created instanceof BooleanVariableConfig);
        BooleanVariableConfig boolCreated = (BooleanVariableConfig) created;

        assertEquals(GenerationPattern.BURST_MODE, boolCreated.getPattern());
        assertEquals(4, boolCreated.getBurstDurationTicks());
        assertEquals(2, boolCreated.getBurstIdleTicks());
        assertEquals(0.75, boolCreated.getTrueProbability(), 0.001);
        assertEquals(0.9, boolCreated.getPTrueToTrue(), 0.001);
        assertEquals(0.1, boolCreated.getPFalseToTrue(), 0.001);
    }

    @Test
    public void testFactoryIntegration() {
        BooleanVariableConfig boolConfig = VariableFactory.createBoolean("flag")
            .pattern(GenerationPattern.CONSTANT_BOOLEAN)
            .constantValue(true);

        assertNotNull(boolConfig);
        assertEquals("flag", boolConfig.getIdentifier());
        assertEquals(VariableType.BOOLEAN, boolConfig.getType());
        
        Object value = boolConfig.generateNextValue();
        assertEquals(true, value);
    }
}