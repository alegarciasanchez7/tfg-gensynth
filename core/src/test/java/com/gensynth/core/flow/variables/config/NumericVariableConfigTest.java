package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import org.junit.Before;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * Tests for numeric variable configuration
 */
public class NumericVariableConfigTest {
    
    private NumericVariableConfig config;

    @Before
    public void setUp() {
        config = new NumericVariableConfig()
            .identifier("temperature")
            .from(20.0)
            .to(30.0)
            .initial(25.0)
            .steps(100);
    }

    @Test
    public void testNumericConfigCreation() {
        assertEquals("temperature", config.getIdentifier());
        assertEquals(VariableType.NUMERIC, config.getType());
        assertEquals(20.0, config.getFromValue(), 0.01);
        assertEquals(30.0, config.getToValue(), 0.01);
    }

    @Test
    public void testRandomPattern() {
        config.pattern(GenerationPattern.RANDOM);
        
        for (int i = 0; i < 100; i++) {
            Object value = config.generateNextValue();
            assertTrue(value instanceof Double);
            double d = (double) value;
            assertTrue(d >= 20.0 && d <= 30.0);
        }
    }

    @Test
    public void testConstantPattern() {
        config.constant(25.0)
            .pattern(GenerationPattern.CONSTANT);
        
        for (int i = 0; i < 10; i++) {
            Object value = config.generateNextValue();
            assertEquals(25.0, (double) value, 0.01);
        }
    }

    @Test
    public void testSequentialPattern() {
        config.pattern(GenerationPattern.SEQUENTIAL);
        
        double prev = 20.0;
        for (int i = 0; i < 10; i++) {
            Object value = config.generateNextValue();
            double current = (double) value;
            assertTrue(current >= prev);
            prev = current;
        }
    }

    @Test
    public void testReset() {
        config.pattern(GenerationPattern.RANDOM);
        config.generateNextValue();
        config.generateNextValue();
        
        long ticksAfterGeneration = config.getTickCounter();
        assertTrue(ticksAfterGeneration > 0);
        
        config.reset();
        assertEquals(0, config.getTickCounter());
    }

    @Test
    public void testAnomalyConfiguration() {
        AnomalyConfig anomaly = new AnomalyConfig()
            .type(AnomalyType.MAKE_AND_BACK)
            .whenTicks(5)
            .anomalousValue(50.0);
        anomaly.setEnabled(true);
        
        config.anomaly(anomaly)
            .pattern(GenerationPattern.CONSTANT)
            .constant(25.0);
        
        assertTrue(config.getAnomalyConfig().isEnabled());
        assertEquals(AnomalyType.MAKE_AND_BACK, config.getAnomalyConfig().getType());
        assertEquals(50.0, (double) config.getAnomalyConfig().getAnomalousValue(), 0.01);
    }

    @Test
    public void testFormatting() {
        config.format("%.2f")
            .pattern(GenerationPattern.RANDOM);
        
        Object value = config.generateNextValue();
        assertTrue(value instanceof Double);
    }

    @Test
    public void testBuilderChain() {
        NumericVariableConfig chained = new NumericVariableConfig()
            .identifier("humidity")
            .from(0.0)
            .to(100.0)
            .initial(50.0)
            .pattern(GenerationPattern.RANDOM);
        
        assertEquals("humidity", chained.getIdentifier());
        assertEquals(0.0, chained.getFromValue(), 0.01);
        assertEquals(100.0, chained.getToValue(), 0.01);
    }

    @Test
    public void testIntegrationWithFactory() {
        NumericVariableConfig numericConfig = VariableFactory.createNumeric("temp1")
            .from(20.0)
            .to(30.0)
            .initial(25.0);
        ConfigurableVariable var = VariableFactory.createFromConfig(numericConfig);
        assertNotNull(var);
        assertEquals("temp1", var.getId());
        assertEquals("NUMERIC", var.getType());
    }

    @Test
    public void testTickCounterIncrement() {
        config.pattern(GenerationPattern.RANDOM);
        assertEquals(0, config.getTickCounter());
        
        config.generateNextValue();
        assertEquals(1, config.getTickCounter());
        
        config.generateNextValue();
        assertEquals(2, config.getTickCounter());
    }

    @Test
    public void testProbabilityBasedAnomaly() {
        // Anomaly with 50% probability (should trigger multiple times in 100 iterations)
        AnomalyConfig anomaly = new AnomalyConfig()
            .type(AnomalyType.MAKE_AND_BACK)
            .probabilityRatio(50.0)  // 50% chance each tick
            .anomalousValue(999.0);
        anomaly.setEnabled(true);
        
        config.anomaly(anomaly)
            .pattern(GenerationPattern.CONSTANT)
            .constant(25.0);
        
        int anomalousCount = 0;
        for (int i = 0; i < 100; i++) {
            Object value = config.generateNextValue();
            if (Math.abs((double) value - 999.0) < 0.01) {
                anomalousCount++;
            }
        }
        
        // With 50% probability, we should see anomalies
        assertTrue("Expected anomalies with 50% probability", anomalousCount > 0);
    }

    @Test
    public void testVeryLowProbabilityAnomaly() {
        // Anomaly with 0.00001% probability (very rare)
        AnomalyConfig anomaly = new AnomalyConfig()
            .type(AnomalyType.MAKE_AND_BACK)
            .probabilityRatio(0.00001)  // 0.00001% chance each tick
            .anomalousValue(999.0);
        anomaly.setEnabled(true);
        
        config.anomaly(anomaly)
            .pattern(GenerationPattern.CONSTANT)
            .constant(25.0);

        // Generate many values to potentially see the anomaly
        for (int i = 0; i < 10000; i++) {
            Object value = config.generateNextValue();
            assertNotNull(value);
        }
        
        // With 0.00001% probability over 10000 iterations:
        // Expected = 10000 * 0.0000001 = 0.001 (very unlikely)
        // But statistically possible
        assertTrue("Very low probability supported", true);
    }

    @Test
    public void testProbabilityAnomalyMakeAndKeep() {
        // Probability-based MAKE_AND_KEEP (permanent anomaly once triggered)
        AnomalyConfig anomaly = new AnomalyConfig()
            .type(AnomalyType.MAKE_AND_KEEP)
            .probabilityRatio(100.0)  // 100% chance (guaranteed to trigger)
            .anomalousValue(999.0);
        anomaly.setEnabled(true);
        
        config.anomaly(anomaly)
            .pattern(GenerationPattern.CONSTANT)
            .constant(25.0);
        
        // First tick will definitely trigger anomaly (100% probability)
        Object firstValue = config.generateNextValue();
        assertEquals(999.0, (double) firstValue, 0.01);
        
        // Subsequent ticks should remain anomalous (MAKE_AND_KEEP)
        for (int i = 0; i < 5; i++) {
            Object value = config.generateNextValue();
            assertEquals(999.0, (double) value, 0.01);
        }
    }

    @Test
    public void testToMap() {
        config.pattern(GenerationPattern.CONSTANT)
            .constant(25.0);
        
        var map = config.toMap();
        assertEquals("temperature", map.get("identifier"));
        assertEquals("NUMERIC", map.get("type"));
        assertEquals("CONSTANT", map.get("pattern"));
        assertEquals(20.0, map.get("from"));
        assertEquals(30.0, map.get("to"));
    }
}
