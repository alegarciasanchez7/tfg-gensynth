package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import org.junit.Before;
import org.junit.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.*;

/**
 * Tests for list variable configuration
 */
public class ListVariableConfigTest {

    private ListVariableConfig config;
    private List<Integer> testList;

    @Before
    public void setUp() {
        testList = Arrays.asList(10, 20, 30, 40, 50);
        config = new ListVariableConfig()
            .identifier("device_list")
            .list(testList);
    }

    @Test
    public void testListConfigCreation() {
        assertEquals("device_list", config.getIdentifier());
        assertEquals(VariableType.LIST, config.getType());
        assertEquals(5, config.getSourceList().size());
    }

    @Test
    public void testSequentialFromListPattern() {
        config.pattern(GenerationPattern.SEQUENTIAL_FROM_LIST);

        // Should iterate through list sequentially
        Object value1 = config.generateNextValue();
        Object value2 = config.generateNextValue();
        Object value3 = config.generateNextValue();
        
        assertEquals(10, value1);
        assertEquals(20, value2);
        assertEquals(30, value3);
    }

    @Test
    public void testSequentialFromListPatternWrap() {
        config.pattern(GenerationPattern.SEQUENTIAL_FROM_LIST);

        // Generate all values first
        Object v1 = config.generateNextValue();  // index 0: 10
        Object v2 = config.generateNextValue();  // index 1: 20
        Object v3 = config.generateNextValue();  // index 2: 30
        Object v4 = config.generateNextValue();  // index 3: 40
        Object v5 = config.generateNextValue();  // index 4: 50
        
        // Now should wrap back to 0
        Object v6 = config.generateNextValue();  // index 0 (wrapped): 10
        Object v7 = config.generateNextValue();  // index 1: 20
        
        assertEquals(10, v1);
        assertEquals(20, v2);
        assertEquals(30, v3);
        assertEquals(40, v4);
        assertEquals(50, v5);
        assertEquals(10, v6);
        assertEquals(20, v7);
    }

    @Test
    public void testRandomFromListPattern() {
        config.pattern(GenerationPattern.RANDOM_FROM_LIST);

        // Generate multiple random values
        boolean hasMultipleValues = false;
        Object firstValue = config.generateNextValue();
        
        for (int i = 0; i < 20; i++) {
            Object value = config.generateNextValue();
            if (!value.equals(firstValue)) {
                hasMultipleValues = true;
                break;
            }
        }
        
        // With 5 values and 20 iterations, should have variety
        assertTrue("Should have multiple different values", hasMultipleValues);
    }

    @Test
    public void testConstantFromListPattern() {
        config.pattern(GenerationPattern.CONSTANT_FROM_LIST);

        Object value1 = config.generateNextValue();
        Object value2 = config.generateNextValue();
        Object value3 = config.generateNextValue();
        
        // Constant pattern should always return first element
        assertEquals(10, value1);
        assertEquals(10, value2);
        assertEquals(10, value3);
    }

    @Test
    public void testConstantFromListAlwaysFirst() {
        config.pattern(GenerationPattern.CONSTANT_FROM_LIST);
        
        // Even if we have multiple list items, constant always returns first
        Object value1 = config.generateNextValue();
        Object value2 = config.generateNextValue();
        Object value3 = config.generateNextValue();
        
        assertEquals(10, value1);
        assertEquals(10, value2);
        assertEquals(10, value3);
    }

    @Test
    public void testSequentialWithShuffle() {
        config.pattern(GenerationPattern.SEQUENTIAL_FROM_LIST)
            .shuffle(true);

        // Generate all values
        Object[] values = new Object[5];
        for (int i = 0; i < 5; i++) {
            values[i] = config.generateNextValue();
        }
        
        // All values should be present (shuffle doesn't change elements)
        for (int testValue : testList) {
            boolean found = false;
            for (Object v : values) {
                if (v.equals(testValue)) {
                    found = true;
                    break;
                }
            }
            assertTrue("Value " + testValue + " should be present", found);
        }
    }

    @Test
    public void testReset() {
        config.pattern(GenerationPattern.SEQUENTIAL_FROM_LIST);
        
        config.generateNextValue();
        config.generateNextValue();
        
        long ticksAfterGeneration = config.getTickCounter();
        assertTrue(ticksAfterGeneration > 0);
        
        config.reset();
        assertEquals(0, config.getTickCounter());
        assertEquals(0, config.getCurrentIndex());
    }

    @Test
    public void testAddItem() {
        ListVariableConfig newConfig = new ListVariableConfig()
            .identifier("dynamic_list")
            .addItem("first")
            .addItem("second")
            .addItem("third");
        
        assertEquals(3, newConfig.getSourceList().size());
        assertTrue(newConfig.getSourceList().contains("first"));
    }

    @Test
    public void testAnomalyWithTickBased() {
        AnomalyConfig anomaly = new AnomalyConfig()
            .type(AnomalyType.MAKE_AND_BACK)
            .whenTicks(3)
            .anomalousValue(999);
        anomaly.setEnabled(true);

        config.pattern(GenerationPattern.CONSTANT_FROM_LIST)
            .anomaly(anomaly);

        Object tick1 = config.generateNextValue();  // Normal
        Object tick2 = config.generateNextValue();  // Normal
        Object tick3 = config.generateNextValue();  // ANOMALY
        Object tick4 = config.generateNextValue();  // Normal again
        
        assertEquals(10, tick1);     // First element
        assertEquals(10, tick2);     // First element
        assertEquals(999, tick3);    // Anomaly
        assertEquals(10, tick4);     // Back to normal
    }

    @Test
    public void testAnomalyWithProbability() {
        AnomalyConfig anomaly = new AnomalyConfig()
            .type(AnomalyType.MAKE_AND_BACK)
            .probabilityRatio(100.0)  // 100% probability (guaranteed)
            .anomalousValue(888);
        anomaly.setEnabled(true);

        config.pattern(GenerationPattern.CONSTANT_FROM_LIST)
            .anomaly(anomaly);

        Object tick1 = config.generateNextValue();  // First tick will definitely trigger
        assertEquals(888, tick1);
    }

    @Test
    public void testBuilderChain() {
        ListVariableConfig chained = new ListVariableConfig()
            .identifier("sensor_list")
            .list(Arrays.asList(1, 2, 3))
            .pattern(GenerationPattern.SEQUENTIAL_FROM_LIST)
            .shuffle(true);

        assertEquals("sensor_list", chained.getIdentifier());
        assertEquals(3, chained.getSourceList().size());
        assertTrue(chained.isShuffle());
    }

    @Test
    public void testIntegrationWithFactory() {
        ListVariableConfig listConfig = VariableFactory.createList("factory_list")
            .list(Arrays.asList("a", "b", "c"))
            .pattern(GenerationPattern.RANDOM_FROM_LIST);
        
        assertNotNull(listConfig);
        assertEquals("factory_list", listConfig.getIdentifier());
        assertEquals(3, listConfig.getSourceList().size());
        Object value = listConfig.generateNextValue();
        assertNotNull(value);
        assertTrue(Arrays.asList("a", "b", "c").contains(value));
    }

    @Test
    public void testToMap() {
        config.pattern(GenerationPattern.SEQUENTIAL_FROM_LIST)
            .shuffle(true);

        var map = config.toMap();
        
        assertEquals("device_list", map.get("identifier"));
        assertEquals("LIST", map.get("type"));
        assertEquals("SEQUENTIAL_FROM_LIST", map.get("pattern"));
        assertEquals(5, map.get("listSize"));
        assertEquals(true, map.get("shuffle"));
    }
}
