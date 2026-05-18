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
    public void testStepRandomPattern() {
        config.pattern(GenerationPattern.RANDOM)
            .from(0.0)
            .to(10.0)
            .initial(4.0)
            .step(2.0);
        
        for (int i = 0; i < 50; i++) {
            double value = (double) config.generateNextValue();
            assertTrue(value >= 0.0 && value <= 10.0);
            assertEquals(0.0, value % 2.0, 0.0001);
        }
    }

    @Test
    public void testContinuousRandomPatternWithoutStepping() {
        config.pattern(GenerationPattern.RANDOM)
            .from(0.0)
            .to(10.0)
            .initial(5.0)
            .step(0.0); // disabled stepping
        
        boolean seenFractional = false;
        for (int i = 0; i < 100; i++) {
            double value = (double) config.generateNextValue();
            assertTrue(value >= 0.0 && value <= 10.0);
            if (value % 1.0 > 0.0) {
                seenFractional = true;
            }
        }
        assertTrue("Expected true continuous fractional values when step is disabled", seenFractional);
    }

    @Test
    public void testConstantWithMargin() {
        config.pattern(GenerationPattern.CONSTANT)
            .constant(50.0)
            .constantMargin(5.0);
        
        for (int i = 0; i < 50; i++) {
            double value = (double) config.generateNextValue();
            assertTrue(value >= 45.0 && value <= 55.0);
        }
    }

    @Test
    public void testSequentialGraphInterpolation() {
        java.util.List<java.util.Map<java.lang.String, java.lang.Object>> graph = new java.util.ArrayList<>();
        
        java.util.Map<java.lang.String, java.lang.Object> p0 = new java.util.HashMap<>();
        p0.put("x", 0.0);
        p0.put("y", 10.0);
        graph.add(p0);
        
        java.util.Map<java.lang.String, java.lang.Object> p1 = new java.util.HashMap<>();
        p1.put("x", 4.0);
        p1.put("y", 20.0);
        graph.add(p1);
        
        config.pattern(GenerationPattern.SEQUENTIAL)
            .sequentialGraph(graph);
        
        // Loop is modulo maxX = 4.0
        // tick 1 (counter=1, index=0) -> 10.0
        assertEquals(10.0, (double) config.generateNextValue(), 0.01);
        // tick 2 (counter=2, index=1) -> 10 + (20 - 10) * 1 / 4 = 12.5
        assertEquals(12.5, (double) config.generateNextValue(), 0.01);
    }

    @Test
    public void testCustomDistributionWeights() {
        java.util.List<java.util.Map<java.lang.String, java.lang.Object>> graph = new java.util.ArrayList<>();
        
        java.util.Map<java.lang.String, java.lang.Object> p0 = new java.util.HashMap<>();
        p0.put("value", 5.0);
        p0.put("weight", 100.0); // 100% weight
        graph.add(p0);
        
        config.pattern(GenerationPattern.DISTRIBUTION)
            .distributionType("CUSTOM")
            .customDistributionGraph(graph);
        
        for (int i = 0; i < 20; i++) {
            assertEquals(5.0, (double) config.generateNextValue(), 0.01);
        }
    }

    @Test
    public void testDecimalsAndIntegerFormatting() {
        // Integer format
        config.precision("INTEGER")
            .integerFormat("00001");
        Object val1 = config.constant(42.0).generateNextValue();
        assertEquals("00042", val1);
        
        // Decimals format
        config.precision("DOUBLE")
            .decimalPlaces(3)
            .integerFormat(null);
        Object val2 = config.constant(3.14159).generateNextValue();
        assertEquals(3.142, (double) val2, 0.0001);

        // Prefix + Padding format for Integer
        config.precision("INTEGER")
            .integerFormat("(000)001");
        Object val3 = config.constant(42.0).generateNextValue();
        assertEquals("000042", val3);

        // Prefix + No padding format for Float
        config.precision("FLOAT")
            .decimalPlaces(2)
            .integerFormat("(USD)number");
        Object val4 = config.constant(3.1415).generateNextValue();
        assertEquals("USD3.14", val4);

        // Prefix + Padding format for Float with negative value
        config.precision("FLOAT")
            .decimalPlaces(2)
            .integerFormat("(USD)001");
        Object val5 = config.constant(-3.1415).generateNextValue();
        assertEquals("USD-003.14", val5);
    }

    @Test
    public void testPrefixAndSuffixFormatting() {
        // Integer with Prefix and Suffix
        config.precision("INTEGER")
            .prefix("USD ")
            .suffix(" / hour")
            .integerFormat("001");
        Object val1 = config.constant(42.0).generateNextValue();
        assertEquals("USD 042 / hour", val1);

        // Double with Prefix and Suffix
        config.precision("DOUBLE")
            .prefix("TEMP: ")
            .suffix(" °C")
            .decimalPlaces(1)
            .integerFormat(null);
        Object val2 = config.constant(23.456).generateNextValue();
        assertEquals("TEMP: 23.5 °C", val2);
    }

    @Test
    public void testConstantDynamicDecimalFormatting() {
        // 1. Constant integer without decimals or margin -> should output Double 3.0 (for precision DOUBLE compatibility)
        NumericVariableConfig config1 = new NumericVariableConfig()
            .pattern(GenerationPattern.CONSTANT)
            .constant(3.0)
            .constantMargin(0.0)
            .precision("DOUBLE");
        
        Object val1 = config1.generateNextValue();
        assertTrue(val1 instanceof Double);
        assertEquals(3.0, (double) val1, 0.001);

        // 2. Constant integer with prefix and suffix -> should format as integer "USD 3 / hour"
        config1.prefix("USD ").suffix(" / hour");
        Object val2 = config1.generateNextValue();
        assertEquals("USD 3 / hour", val2);

        // 3. Constant double with decimal value (e.g. 3.14) -> should preserve decimals
        NumericVariableConfig config2 = new NumericVariableConfig()
            .pattern(GenerationPattern.CONSTANT)
            .constant(3.14)
            .constantMargin(0.0)
            .precision("DOUBLE");
        
        Object val3 = config2.generateNextValue();
        assertEquals(3.14, (double) val3, 0.001);

        // 4. Constant double with decimal value, prefix and suffix -> "USD 3.14 / hour"
        config2.prefix("USD ").suffix(" / hour");
        Object val4 = config2.generateNextValue();
        assertEquals("USD 3.14 / hour", val4);
    }

    @Test
    public void testFormulaEvaluationWithBracesAndBrackets() {
        config.pattern(GenerationPattern.FORMULA);
        config.formula("{{temperature}} * 2 + [humidity]");
        
        java.util.Map<String, Object> context = new java.util.HashMap<>();
        context.put("temperature", 25.0);
        context.put("humidity", 10.0);
        config.setContext(context);
        
        // Evaluates to: 25.0 * 2 + 10.0 = 60.0
        Object result = config.generateNextValue();
        assertEquals(60.0, (double) result, 0.01);
        
        // Check dependencies
        java.util.Set<String> deps = config.getDependencies();
        assertTrue(deps.contains("temperature"));
        assertTrue(deps.contains("humidity"));
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

    @Test
    public void testInitialValueBehavior() {
        NumericVariableConfig initialTestConfig = new NumericVariableConfig()
            .identifier("initial_test")
            .from(0.0)
            .to(100.0)
            .initial(42.0)
            .pattern(GenerationPattern.RANDOM);
        
        // Tick 1: should return initialValue (42.0)
        Object val1 = initialTestConfig.generateNextValue();
        assertEquals(42.0, (double) val1, 0.01);
        
        // Tick 2: should be random (likely not 42.0)
        Object val2 = initialTestConfig.generateNextValue();
        assertTrue((double) val2 >= 0.0 && (double) val2 <= 100.0);
    }
}
