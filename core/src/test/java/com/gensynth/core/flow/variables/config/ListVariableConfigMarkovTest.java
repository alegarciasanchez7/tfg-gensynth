package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.VariableFactory;
import org.junit.Test;

import java.util.*;

import static org.junit.Assert.*;

public class ListVariableConfigMarkovTest {

    @Test
    public void testMarkovChainTransitions() {
        ListVariableConfig.ListItem itemA = new ListVariableConfig.ListItem("item-a", "STATE_A", 1.0);
        ListVariableConfig.ListItem itemB = new ListVariableConfig.ListItem("item-b", "STATE_B", 1.0);

        Map<String, Map<String, Double>> transitionMatrix = new HashMap<>();

        // STATE_A always transitions to STATE_B (1.0 probability)
        Map<String, Double> fromA = new HashMap<>();
        fromA.put("item-b", 1.0);
        transitionMatrix.put("item-a", fromA);

        // STATE_B always transitions to STATE_A (1.0 probability)
        Map<String, Double> fromB = new HashMap<>();
        fromB.put("item-a", 1.0);
        transitionMatrix.put("item-b", fromB);

        ListVariableConfig config = VariableFactory.createList("list_markov")
                .selectionStrategy(ListVariableConfig.SelectionStrategy.MARKOV_CHAIN)
                .items(Arrays.asList(itemA, itemB))
                .transitionMatrix(transitionMatrix);

        List<String> errors = config.validate();
        assertTrue("Config should be valid: " + errors, errors.isEmpty());

        // First item starts at STATE_A
        assertEquals("STATE_A", config.generateNextValue());
        // Next transition -> STATE_B
        assertEquals("STATE_B", config.generateNextValue());
        // Next transition -> STATE_A
        assertEquals("STATE_A", config.generateNextValue());
        // Next transition -> STATE_B
        assertEquals("STATE_B", config.generateNextValue());
    }

    @Test
    public void testShuffleModeNoImmediateDuplicates() {
        ListVariableConfig.ListItem item1 = new ListVariableConfig.ListItem("1", "ONE", 1.0);
        ListVariableConfig.ListItem item2 = new ListVariableConfig.ListItem("2", "TWO", 1.0);
        ListVariableConfig.ListItem item3 = new ListVariableConfig.ListItem("3", "THREE", 1.0);

        ListVariableConfig config = VariableFactory.createList("list_shuffle")
                .selectionStrategy(ListVariableConfig.SelectionStrategy.SHUFFLE)
                .items(Arrays.asList(item1, item2, item3));

        Set<Object> firstBatch = new HashSet<>();
        firstBatch.add(config.generateNextValue());
        firstBatch.add(config.generateNextValue());
        firstBatch.add(config.generateNextValue());

        assertEquals("First batch of 3 generated values must contain all 3 distinct items", 3, firstBatch.size());
    }

    @Test
    public void testEmbeddedVariableGenerator() {
        ListVariableConfig.ListItem staticItem = new ListVariableConfig.ListItem("item-static", "FIXED", 1.0);

        ListVariableConfig.ListItem embeddedItem = new ListVariableConfig.ListItem("item-embedded", null, 1.0);
        NumericVariableConfig subConfig = VariableFactory.createNumeric("num_sub")
                .constant(99.0);
        embeddedItem.setEmbeddedConfig(subConfig);

        ListVariableConfig config = VariableFactory.createList("list_embedded")
                .selectionStrategy(ListVariableConfig.SelectionStrategy.SEQUENTIAL)
                .items(Arrays.asList(staticItem, embeddedItem));

        assertEquals("FIXED", config.generateNextValue());
        assertEquals(99.0, config.generateNextValue());
        assertEquals("FIXED", config.generateNextValue());
        assertEquals(99.0, config.generateNextValue());
    }

    @Test(expected = IllegalArgumentException.class)
    public void testPreventDeepNesting() {
        ListVariableConfig innerInnerList = VariableFactory.createList("inner_inner")
                .items(Arrays.asList(new ListVariableConfig.ListItem("ii1", "VAL", 1.0)));

        ListVariableConfig.ListItem innerItem = new ListVariableConfig.ListItem("i1", null, 1.0);
        innerItem.setEmbeddedConfig(innerInnerList);

        ListVariableConfig innerList = VariableFactory.createList("inner")
                .items(Arrays.asList(innerItem));

        ListVariableConfig.ListItem outerItem = new ListVariableConfig.ListItem("o1", null, 1.0);
        outerItem.setEmbeddedConfig(innerList);
    }
}
