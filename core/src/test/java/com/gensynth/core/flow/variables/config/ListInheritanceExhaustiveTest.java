package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import org.junit.Test;

import java.util.*;

import static org.junit.Assert.*;

public class ListInheritanceExhaustiveTest {

    @Test
    public void testExhaustiveListInheritance() {
        // 1. Global list
        ListVariableConfig globalList = new ListVariableConfig();
        globalList.identifier("global_catalog");
        globalList.items(List.of(
                new ListVariableConfig.ListItem("g1", "Tomato", 1.0),
                new ListVariableConfig.ListItem("g2", "Lettuce", 1.0),
                new ListVariableConfig.ListItem("g3", "Pepper", 1.0)
        ));

        // 2. String variable picking a fixed item from the global list
        StringVariableConfig fixedStrVar = new StringVariableConfig();
        fixedStrVar.identifier("fav_vegetable");
        fixedStrVar.setSourceListVariableId("global_catalog");
        fixedStrVar.setSourceListSelectionMode("FIXED_ITEM");
        fixedStrVar.setSelectedListItemId("g2");

        // 3. Numeric list and a numeric variable picking random items from it
        ListVariableConfig globalNumList = new ListVariableConfig();
        globalNumList.identifier("global_temps");
        globalNumList.items(List.of(
                new ListVariableConfig.ListItem("t1", 21.5, 1.0),
                new ListVariableConfig.ListItem("t2", 25.0, 1.0),
                new ListVariableConfig.ListItem("t3", 28.3, 1.0)
        ));

        NumericVariableConfig localTempVar = new NumericVariableConfig();
        localTempVar.identifier("current_temp");
        localTempVar.setSourceListVariableId("global_temps");
        localTempVar.setSourceListSelectionMode("RANDOM_ITEM");

        // 4. String variable following the global list as the list does
        StringVariableConfig inheritedVar = new StringVariableConfig();
        inheritedVar.identifier("veg_round");
        inheritedVar.setSourceListVariableId("global_catalog");
        inheritedVar.setSourceListSelectionMode("INHERITED_GENERATION");

        ConfigurableVariable cvGlobalList = new ConfigurableVariable(globalList);
        ConfigurableVariable cvFixedStr = new ConfigurableVariable(fixedStrVar);
        ConfigurableVariable cvGlobalNum = new ConfigurableVariable(globalNumList);
        ConfigurableVariable cvLocalTemp = new ConfigurableVariable(localTempVar);
        ConfigurableVariable cvInherited = new ConfigurableVariable(inheritedVar);

        Map<String, Object> context = new HashMap<>();
        context.put("global_catalog_config", cvGlobalList);
        context.put("global_temps_config", cvGlobalNum);
        cvFixedStr.setContext(context);
        cvLocalTemp.setContext(context);
        cvInherited.setContext(context);

        Set<Object> allowedVegs = Set.of("Tomato", "Lettuce", "Pepper");
        Set<Object> allowedTemps = Set.of(21.5, 25.0, 28.3);

        for (int i = 0; i < 100_000; i++) {
            assertEquals("Fixed item selection must consistently return 'Lettuce'", "Lettuce", cvFixedStr.getValue());

            Object tempVal = cvLocalTemp.getValue();
            assertTrue("Temp value must come from global_temps list", allowedTemps.contains(tempVal));

            assertTrue(allowedVegs.contains(cvInherited.getValue()));
        }
    }

    @Test
    public void listDoesNotInheritFromAnotherList() {
        Map<String, Object> config = new HashMap<>();
        config.put("selectionStrategy", "SEQUENTIAL");
        config.put("items", List.of(Map.of("id", "own", "value", "OWN")));
        config.put("sourceListVariableId", "global_catalog");
        config.put("sourceListSelectionMode", "SUBSET_SPECIFIC");
        config.put("selectedListItemIds", List.of("g1"));

        ListVariableConfig list = (ListVariableConfig) VariableFactory.createFromMap("child", "list", config);

        assertNull(list.getSourceListVariableId());
        assertTrue(list.getDependencies().isEmpty());
        assertEquals(List.of("OWN", "OWN"), List.of(list.generateNextValue(), list.generateNextValue()));
    }

    @Test(expected = CyclicDependencyException.class)
    public void testListReferenceCycleDetection() throws CyclicDependencyException {
        // A variable reads a list whose conditional rule reads that variable
        StringVariableConfig variable = new StringVariableConfig();
        variable.identifier("variable");
        variable.setSourceListVariableId("list");

        VariableConfiguration.ConditionalRule rule = new VariableConfiguration.ConditionalRule();
        rule.targetVariable = "variable";
        ListVariableConfig list = new ListVariableConfig();
        list.identifier("list");
        list.setConditionalRules(List.of(rule));

        Map<String, VariableConfiguration> configs = Map.of(
                "variable", variable,
                "list", list
        );

        DependencyResolver resolver = new DependencyResolver();
        resolver.resolve(configs);
    }
}
