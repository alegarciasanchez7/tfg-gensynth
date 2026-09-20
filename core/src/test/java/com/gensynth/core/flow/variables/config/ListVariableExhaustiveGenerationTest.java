package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.GenerationPattern;
import com.gensynth.core.flow.variables.VariableFactory;
import com.gensynth.core.flow.variables.VariableConfiguration;
import org.junit.Before;
import org.junit.Test;

import java.util.*;

import static org.junit.Assert.*;

/**
 * Comprehensive exhaustive test suite for ListVariableConfig.
 * Validates:
 * 1. Correct list data generation for all types (Strings, Numbers, Booleans, Objects, Embedded Generators).
 * 2. Robustness and exception-free generation (null checks, empty list handling, boundary conditions).
 * 3. All selection strategies (WEIGHTED_RANDOM, SEQUENTIAL, SHUFFLE, MARKOV_CHAIN).
 * 4. Heterogeneous polymorphic items with dynamic multi-typed embedded generators.
 */
public class ListVariableExhaustiveGenerationTest {

    private ListVariableConfig.ListItem itemLiteralString;
    private ListVariableConfig.ListItem itemLiteralNumber;
    private ListVariableConfig.ListItem itemLiteralBoolean;
    private ListVariableConfig.ListItem itemEmbeddedNumeric;
    private ListVariableConfig.ListItem itemEmbeddedString;
    private ListVariableConfig.ListItem itemEmbeddedBoolean;
    private ListVariableConfig.ListItem itemEmbeddedTemporal;

    @Before
    public void setUp() {
        // 1. Literal Multi-typed Items
        itemLiteralString = new ListVariableConfig.ListItem("item-str", "LITERAL_STRING_VALUE", 10.0);
        itemLiteralNumber = new ListVariableConfig.ListItem("item-num", 123.456, 20.0);
        itemLiteralBoolean = new ListVariableConfig.ListItem("item-bool", true, 5.0);

        // 2. Polymorphic Dynamic Embedded Generators
        // Embedded Numeric Generator
        NumericVariableConfig numGen = VariableFactory.createNumeric("num_sub")
                .from(1.0)
                .to(10.0)
                .precision("FLOAT");
        itemEmbeddedNumeric = new ListVariableConfig.ListItem("item-emb-num", null, 15.0);
        itemEmbeddedNumeric.setEmbeddedConfig(numGen);

        // Embedded String Generator
        StringVariableConfig strGen = VariableFactory.createString("str_sub")
                .regex("USER_[A-Z0-9]{4}_ID");
        itemEmbeddedString = new ListVariableConfig.ListItem("item-emb-str", null, 15.0);
        itemEmbeddedString.setEmbeddedConfig(strGen);

        // Embedded Boolean Generator
        BooleanVariableConfig boolGen = VariableFactory.createBoolean("bool_sub")
                .constantValue(true);
        itemEmbeddedBoolean = new ListVariableConfig.ListItem("item-emb-bool", null, 10.0);
        itemEmbeddedBoolean.setEmbeddedConfig(boolGen);

        // Embedded Temporal Generator
        TemporalVariableConfig tempGen = VariableFactory.createTemporal("temp_sub")
                .dateFormat("yyyy-MM-dd");
        itemEmbeddedTemporal = new ListVariableConfig.ListItem("item-emb-temp", null, 10.0);
        itemEmbeddedTemporal.setEmbeddedConfig(tempGen);
    }

    // =========================================================================
    // REQUIREMENT 1: Correct Data Generation & Type Preservations
    // =========================================================================

    @Test
    public void testExhaustive_CorrectDataTypesGeneration() {
        ListVariableConfig config = VariableFactory.createList("type_test_list")
                .selectionStrategy(ListVariableConfig.SelectionStrategy.SEQUENTIAL)
                .items(Arrays.asList(
                        itemLiteralString,
                        itemLiteralNumber,
                        itemLiteralBoolean,
                        itemEmbeddedNumeric,
                        itemEmbeddedString,
                        itemEmbeddedBoolean,
                        itemEmbeddedTemporal
                ));

        // 1. Literal String
        Object val1 = config.generateNextValue();
        assertTrue("Value 1 must be String", val1 instanceof String);
        assertEquals("LITERAL_STRING_VALUE", val1);

        // 2. Literal Number
        Object val2 = config.generateNextValue();
        assertTrue("Value 2 must be Number", val2 instanceof Number);
        assertEquals(123.456, ((Number) val2).doubleValue(), 0.001);

        // 3. Literal Boolean
        Object val3 = config.generateNextValue();
        assertTrue("Value 3 must be Boolean", val3 instanceof Boolean);
        assertEquals(true, val3);

        // 4. Dynamic Embedded Numeric
        Object val4 = config.generateNextValue();
        assertTrue("Value 4 generated from embedded numeric must be Number", val4 instanceof Number);
        double numVal = ((Number) val4).doubleValue();
        assertTrue("Value 4 must be within range [1.0, 10.0]", numVal >= 1.0 && numVal <= 10.0);

        // 5. Dynamic Embedded String
        Object val5 = config.generateNextValue();
        assertTrue("Value 5 generated from embedded string must be String", val5 instanceof String);
        String strVal = (String) val5;
        assertTrue("Value 5 must start with PREFIX USER_", strVal.startsWith("USER_"));
        assertTrue("Value 5 must end with SUFFIX _ID", strVal.endsWith("_ID"));

        // 6. Dynamic Embedded Boolean
        Object val6 = config.generateNextValue();
        assertTrue("Value 6 generated from embedded boolean must be Boolean", val6 instanceof Boolean);

        // 7. Dynamic Embedded Temporal
        Object val7 = config.generateNextValue();
        assertTrue("Value 7 generated from embedded temporal must be String timestamp", val7 instanceof String);
        String tempVal = (String) val7;
        assertTrue("Date format should match yyyy-MM-dd", tempVal.matches("\\d{4}-\\d{2}-\\d{2}"));
    }

    // =========================================================================
    // REQUIREMENT 2: Robustness and Error-Free Generation Under Edge Cases
    // =========================================================================

    @Test
    public void testExhaustive_RobustnessWithEmptyList() {
        ListVariableConfig emptyConfig = VariableFactory.createList("empty_list");
        
        // Validation must be clean without exceptions
        List<String> errors = emptyConfig.validate();
        assertTrue("Empty list is valid for creation", errors.isEmpty());

        // Generating next value should safely return null without throwing NullPointerException or OutOfBounds
        for (int i = 0; i < 10; i++) {
            Object val = emptyConfig.generateNextValue();
            assertNull("Empty list must return null safely", val);
        }
    }

    @Test
    public void testExhaustive_RobustnessWithNullValueItems() {
        ListVariableConfig.ListItem nullValItem = new ListVariableConfig.ListItem("item-null", null, 1.0);
        ListVariableConfig config = VariableFactory.createList("null_item_list")
                .selectionStrategy(ListVariableConfig.SelectionStrategy.SEQUENTIAL)
                .items(Collections.singletonList(nullValItem));

        // Must return null gracefully without throwing an exception
        Object val = config.generateNextValue();
        assertNull("ListItem with null value and no embedded config should generate null", val);
    }

    @Test
    public void testExhaustive_RobustnessUnderHighVolumeGeneration() {
        ListVariableConfig config = VariableFactory.createList("stress_test_list")
                .selectionStrategy(ListVariableConfig.SelectionStrategy.WEIGHTED_RANDOM)
                .items(Arrays.asList(
                        itemLiteralString,
                        itemLiteralNumber,
                        itemEmbeddedNumeric,
                        itemEmbeddedString
                ));

        // Generate 10,000 values continuously to verify zero crashes, memory leaks, or state corruptions
        for (int i = 0; i < 10000; i++) {
            Object val = config.generateNextValue();
            assertNotNull("Generated value in stress test must not be null", val);
        }
    }

    // =========================================================================
    // REQUIREMENT 3: All Selection Strategies Work Correctly
    // =========================================================================

    @Test
    public void testExhaustive_StrategySequential() {
        ListVariableConfig config = VariableFactory.createList("seq_list")
                .selectionStrategy(ListVariableConfig.SelectionStrategy.SEQUENTIAL)
                .items(Arrays.asList(itemLiteralString, itemLiteralNumber, itemLiteralBoolean));

        assertEquals("LITERAL_STRING_VALUE", config.generateNextValue());
        assertEquals(123.456, config.generateNextValue());
        assertEquals(true, config.generateNextValue());
        // Wrap around back to item 0
        assertEquals("LITERAL_STRING_VALUE", config.generateNextValue());
    }

    @Test
    public void testExhaustive_StrategyWeightedRandom() {
        // Item A has weight 90, Item B has weight 10
        ListVariableConfig.ListItem itemHeavy = new ListVariableConfig.ListItem("heavy", "HEAVY", 90.0);
        ListVariableConfig.ListItem itemLight = new ListVariableConfig.ListItem("light", "LIGHT", 10.0);

        ListVariableConfig config = VariableFactory.createList("weighted_list")
                .selectionStrategy(ListVariableConfig.SelectionStrategy.WEIGHTED_RANDOM)
                .items(Arrays.asList(itemHeavy, itemLight));

        int heavyCount = 0;
        int totalSamples = 1000;
        for (int i = 0; i < totalSamples; i++) {
            if ("HEAVY".equals(config.generateNextValue())) {
                heavyCount++;
            }
        }

        // Heavy should be selected roughly 85-95% of the time (expected 90%)
        assertTrue("Heavy item should dominate in weighted random selection", heavyCount > 750);
    }

    @Test
    public void testExhaustive_StrategyShuffle() {
        ListVariableConfig.ListItem i1 = new ListVariableConfig.ListItem("1", "A", 1.0);
        ListVariableConfig.ListItem i2 = new ListVariableConfig.ListItem("2", "B", 1.0);
        ListVariableConfig.ListItem i3 = new ListVariableConfig.ListItem("3", "C", 1.0);

        ListVariableConfig config = VariableFactory.createList("shuffle_list")
                .selectionStrategy(ListVariableConfig.SelectionStrategy.SHUFFLE)
                .items(Arrays.asList(i1, i2, i3));

        // Evaluate 5 complete full cycles of 3 items each
        for (int cycle = 0; cycle < 5; cycle++) {
            Set<Object> cycleSet = new HashSet<>();
            cycleSet.add(config.generateNextValue());
            cycleSet.add(config.generateNextValue());
            cycleSet.add(config.generateNextValue());

            assertEquals("Cycle " + cycle + " must contain all 3 unique elements", 3, cycleSet.size());
            assertTrue(cycleSet.contains("A"));
            assertTrue(cycleSet.contains("B"));
            assertTrue(cycleSet.contains("C"));
        }
    }

    @Test
    public void testExhaustive_StrategyMarkovChain() {
        // Define 3 States: S1 -> S2 -> S3 -> S1
        ListVariableConfig.ListItem s1 = new ListVariableConfig.ListItem("s1", "STATE_1", 1.0);
        ListVariableConfig.ListItem s2 = new ListVariableConfig.ListItem("s2", "STATE_2", 1.0);
        ListVariableConfig.ListItem s3 = new ListVariableConfig.ListItem("s3", "STATE_3", 1.0);

        Map<String, Map<String, Double>> matrix = new HashMap<>();
        matrix.put("s1", Map.of("s2", 1.0)); // S1 always goes to S2
        matrix.put("s2", Map.of("s3", 1.0)); // S2 always goes to S3
        matrix.put("s3", Map.of("s1", 1.0)); // S3 always goes to S1

        ListVariableConfig config = VariableFactory.createList("markov_list")
                .selectionStrategy(ListVariableConfig.SelectionStrategy.MARKOV_CHAIN)
                .items(Arrays.asList(s1, s2, s3))
                .transitionMatrix(matrix);

        // Starts at s1
        assertEquals("STATE_1", config.generateNextValue());
        assertEquals("STATE_2", config.generateNextValue());
        assertEquals("STATE_3", config.generateNextValue());
        assertEquals("STATE_1", config.generateNextValue());
        assertEquals("STATE_2", config.generateNextValue());
    }

    // =========================================================================
    // REQUIREMENT 4: Polymorphic Multi-typed Elements & Legacy Backwards Compatibility
    // =========================================================================

    @Test
    public void testExhaustive_PolymorphicMixedListGeneration() {
        ListVariableConfig config = VariableFactory.createList("polymorphic_list")
                .selectionStrategy(ListVariableConfig.SelectionStrategy.SEQUENTIAL)
                .items(Arrays.asList(
                        itemLiteralString,
                        itemEmbeddedNumeric,
                        itemLiteralBoolean,
                        itemEmbeddedString
                ));

        List<Object> generatedBatch = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            generatedBatch.add(config.generateNextValue());
        }

        // Verify heterogeneous types in a single list pipeline
        assertTrue(generatedBatch.get(0) instanceof String);
        assertTrue(generatedBatch.get(1) instanceof Number);
        assertTrue(generatedBatch.get(2) instanceof Boolean);
        assertTrue(generatedBatch.get(3) instanceof String);
    }

    @Test
    public void testExhaustive_LegacySourceListCompatibility() {
        // Test old style setup (without ListItem wrapper)
        List<Object> rawList = Arrays.asList("RAW_1", 999, false);
        ListVariableConfig config = VariableFactory.createList("legacy_list")
                .pattern(GenerationPattern.SEQUENTIAL_FROM_LIST)
                .list(rawList);

        assertEquals("RAW_1", config.generateNextValue());
        assertEquals(999, config.generateNextValue());
        assertEquals(false, config.generateNextValue());
        assertEquals("RAW_1", config.generateNextValue());
    }

    @Test
    public void testExhaustive_MapSerializationAndDeserialization() {
        Map<String, Map<String, Double>> matrix = new HashMap<>();
        Map<String, Double> trans = new HashMap<>();
        trans.put("item-emb-num", 1.0);
        matrix.put("item-str", trans);

        ListVariableConfig originalConfig = VariableFactory.createList("ser_list")
                .items(Arrays.asList(itemLiteralString, itemEmbeddedNumeric))
                .transitionMatrix(matrix)
                .selectionStrategy(ListVariableConfig.SelectionStrategy.MARKOV_CHAIN);

        Map<String, Object> map = originalConfig.toMap();
        assertNotNull(map);
        assertEquals("LIST", map.get("type"));
        assertEquals("MARKOV_CHAIN", map.get("selectionStrategy"));

        // Re-create via VariableFactory deserialization
        VariableConfiguration deserialized = VariableFactory.createFromMap("ser_list", "LIST", map);
        assertTrue(deserialized instanceof ListVariableConfig);

        ListVariableConfig restoredList = (ListVariableConfig) deserialized;
        assertEquals(ListVariableConfig.SelectionStrategy.MARKOV_CHAIN, restoredList.getSelectionStrategy());
        assertEquals(2, restoredList.getItems().size());

        // Test generation from deserialized object
        Object val1 = restoredList.generateNextValue();
        assertNotNull(val1);
    }
}
