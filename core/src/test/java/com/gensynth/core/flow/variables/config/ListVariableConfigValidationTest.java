package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.VariableFactory;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

public class ListVariableConfigValidationTest {

    @Test
    public void testValidate_emptyList_returnsError() {
        ListVariableConfig config = VariableFactory.createList("l1");
        // No items added, list should be invalid
        List<String> errors = config.validate();
        assertFalse(errors.isEmpty());
        assertTrue(errors.get(0).contains("non-empty list of items"));
    }

    @Test
    public void testValidate_negativeWeight_returnsError() {
        ListVariableConfig config = VariableFactory.createList("l2");
        List<Object> items = new ArrayList<>();
        items.add(Map.of("value", "A", "weight", -1.0));
        config.list(items);

        List<String> errors = config.validate();
        assertFalse(errors.isEmpty());
        assertTrue(errors.get(0).contains("cannot be negative"));
    }

    @Test
    public void testValidate_allWeightsZero_returnsError() {
        ListVariableConfig config = VariableFactory.createList("l3");
        List<Object> items = new ArrayList<>();
        items.add(Map.of("value", "A", "weight", 0.0));
        items.add(Map.of("value", "B", "weight", 0.0));
        config.list(items);

        List<String> errors = config.validate();
        assertFalse(errors.isEmpty());
        assertTrue(errors.get(0).contains("all weights are zero or negative"));
    }
}
