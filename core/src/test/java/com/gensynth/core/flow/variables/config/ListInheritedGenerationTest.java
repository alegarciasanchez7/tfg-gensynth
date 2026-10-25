package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.VariableFactory;
import org.junit.Test;

import java.util.*;

import static org.junit.Assert.*;

/** "Inherited Generation": a variable picks items from a list as the list itself does. */
public class ListInheritedGenerationTest {

    @Test
    public void followsTheSequenceOfASequentialList() {
        StringVariableConfig variable = inheriting(list(ListVariableConfig.SelectionStrategy.SEQUENTIAL));

        assertEquals(List.of("A", "B", "C", "A"), next(variable, 4));
    }

    @Test
    public void keepsItsOwnPositionWithoutMovingTheList() {
        ListVariableConfig source = list(ListVariableConfig.SelectionStrategy.SEQUENTIAL);
        StringVariableConfig variable = inheriting(source);

        assertEquals("A", source.generateNextValue());
        assertEquals("A", variable.generateNextValue());
        assertEquals("B", source.generateNextValue());
        assertEquals("B", variable.generateNextValue());
    }

    @Test
    public void followsTheChainOfAMarkovList() {
        ListVariableConfig source = list(ListVariableConfig.SelectionStrategy.MARKOV_CHAIN)
                .transitionMatrix(Map.of("a", Map.of("c", 1.0), "c", Map.of("b", 1.0), "b", Map.of("a", 1.0)));

        assertEquals(List.of("A", "C", "B", "A"), next(inheriting(source), 4));
    }

    @Test
    public void usesTheWeightsOfAWeightedList() {
        ListVariableConfig source = VariableFactory.createList("src")
                .selectionStrategy(ListVariableConfig.SelectionStrategy.WEIGHTED_RANDOM)
                .items(List.of(new ListVariableConfig.ListItem("a", "A", 1.0), new ListVariableConfig.ListItem("b", "B", 0.0)));

        assertEquals(Set.of("A"), new HashSet<>(next(inheriting(source), 50)));
    }

    @Test
    public void picksOneItemOfAFixedSubsetList() {
        List<Object> values = next(inheriting(list(ListVariableConfig.SelectionStrategy.FIXED_SUBSET)), 50);

        assertTrue(values.toString(), List.of("A", "B", "C").containsAll(values));
    }

    @Test
    public void startsAgainFromAListThatWasEditedOrRestarted() {
        StringVariableConfig variable = inheriting(list(ListVariableConfig.SelectionStrategy.SEQUENTIAL));
        next(variable, 2);

        variable.setContext(Map.of("src", list(ListVariableConfig.SelectionStrategy.SEQUENTIAL)));

        assertEquals("A", variable.generateNextValue());
    }

    private static ListVariableConfig list(ListVariableConfig.SelectionStrategy strategy) {
        return VariableFactory.createList("src")
                .selectionStrategy(strategy)
                .items(List.of(
                        new ListVariableConfig.ListItem("a", "A", 1.0),
                        new ListVariableConfig.ListItem("b", "B", 1.0),
                        new ListVariableConfig.ListItem("c", "C", 1.0)));
    }

    private static StringVariableConfig inheriting(ListVariableConfig source) {
        StringVariableConfig variable = VariableFactory.createString("value");
        variable.setSourceListVariableId("src");
        variable.setSourceListSelectionMode("INHERITED_GENERATION");
        variable.setContext(Map.of("src", source));
        return variable;
    }

    private static List<Object> next(StringVariableConfig variable, int count) {
        List<Object> values = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            values.add(variable.generateNextValue());
        }
        return values;
    }
}
