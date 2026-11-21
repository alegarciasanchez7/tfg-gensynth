package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import org.junit.Before;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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

    @Test
    public void list_nullOrEmpty_isRejected() {
        ListVariableConfig list = new ListVariableConfig();
        assertThrows(IllegalArgumentException.class, () -> list.list(null));
        List<Object> empty = List.of();
        assertThrows(IllegalArgumentException.class, () -> list.list(empty));
    }

    @Test
    public void list_acceptsEveryKindOfRawItem() {
        ListVariableConfig.ListItem listItem = new ListVariableConfig.ListItem("li", "L", 2.0);
        Map<String, Object> fullMap = Map.of("id", "m1", "value", "M", "weight", 3);
        Map<String, Object> bareMap = Map.of("other", "x");
        List<Object> raw = new ArrayList<>(Arrays.asList(
                listItem, new ListVariableConfig.WeightedItem("W", 4.0), fullMap, bareMap, "plain"));
        raw.add(null);

        List<ListVariableConfig.ListItem> items = new ListVariableConfig().list(raw).getItems();

        assertSame(listItem, items.get(0));
        assertEquals("W", items.get(1).getValue());
        assertEquals(4.0, items.get(1).getWeight(), 0.0);
        assertEquals("m1", items.get(2).getId());
        assertEquals("M", items.get(2).getValue());
        assertEquals(3.0, items.get(2).getWeight(), 0.0);
        // A map without a value is the value itself
        assertEquals(bareMap, items.get(3).getValue());
        assertEquals(1.0, items.get(3).getWeight(), 0.0);
        assertNotNull(items.get(3).getId());
        assertEquals("plain", items.get(4).getValue());
        assertNull(items.get(5).getValue());
    }

    @Test
    public void validate_reportsWeightErrorsBeforeEmbeddedErrors() {
        ListVariableConfig.ListItem embedded = new ListVariableConfig.ListItem("emb", null, 1.0);
        embedded.setEmbeddedConfig(VariableFactory.createNumeric("inner").from(10.0).to(5.0));
        ListVariableConfig list = new ListVariableConfig().items(List.of(
                embedded, new ListVariableConfig.ListItem("neg", "N", -1.0)));

        assertEquals(List.of(
                "Weights cannot be negative. Found negative weight: -1.0",
                "Embedded item (emb) error: Numeric range is invalid: min must be <= max"), list.validate());
    }

    @Test
    public void itemOrder_matchesByIdOrValueOnceAndAppendsTheRest() {
        ListVariableConfig.ListItem a = new ListVariableConfig.ListItem("a", "A", 1.0);
        ListVariableConfig.ListItem b = new ListVariableConfig.ListItem("b", "B", 1.0);
        ListVariableConfig.ListItem c = new ListVariableConfig.ListItem("c", null, 1.0);
        ListVariableConfig.ListItem d = new ListVariableConfig.ListItem("d", "D", 1.0);
        d.setId(null);
        ListVariableConfig.ListItem e = new ListVariableConfig.ListItem("e", "E", 1.0);
        ListVariableConfig list = new ListVariableConfig().items(List.of(a, b, c, d, e));
        // "B" takes b by value, so the later "b" finds nothing; "a" takes a by id
        list.setItemOrder(List.of("B", "missing", "a", "b", "c", "D"));

        assertEquals(List.of(b, a, c, d, e), list.getEffectiveItems());
    }

    private static ListVariableConfig markov(Map<String, Double> rowOfA) {
        Map<String, Map<String, Double>> matrix = new HashMap<>();
        matrix.put("a", rowOfA);
        return new ListVariableConfig()
                .selectionStrategy(ListVariableConfig.SelectionStrategy.MARKOV_CHAIN)
                .items(List.of(new ListVariableConfig.ListItem("a", "A", 1.0),
                        new ListVariableConfig.ListItem("b", "B", 1.0),
                        new ListVariableConfig.ListItem("c", "C", 1.0)))
                .transitionMatrix(matrix);
    }

    @Test
    public void markov_rowWithoutPositiveProbability_keepsTheState() {
        ListVariableConfig emptyRow = markov(new HashMap<>());
        Map<String, Double> nonPositive = new HashMap<>();
        nonPositive.put("b", 0.0);
        nonPositive.put("c", -1.0);
        ListVariableConfig nonPositiveRow = markov(nonPositive);
        for (int i = 0; i < 5; i++) {
            assertEquals("A", emptyRow.generateNextValue());
            assertEquals("A", nonPositiveRow.generateNextValue());
        }
    }

    @Test
    public void markov_skipsNegativeProbabilities() {
        Map<String, Double> row = new LinkedHashMap<>();
        row.put("b", -1.0);
        row.put("c", 1.0);
        ListVariableConfig list = markov(row);
        assertEquals("A", list.generateNextValue());
        assertEquals("C", list.generateNextValue());
    }

    @Test
    public void markov_stateThatIsNotAnItem_restartsFromTheFirstItem() {
        ListVariableConfig list = markov(Map.of("ghost", 1.0));
        for (int i = 0; i < 3; i++) {
            assertEquals("A", list.generateNextValue());
        }
    }
}
