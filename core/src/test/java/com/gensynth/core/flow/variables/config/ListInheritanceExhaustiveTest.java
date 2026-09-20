package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import org.junit.Test;

import java.util.*;

import static org.junit.Assert.*;

public class ListInheritanceExhaustiveTest {

    @Test
    public void testExhaustiveListInheritance() {
        // 1. Global Master List
        ListVariableConfig globalList = new ListVariableConfig();
        globalList.identifier("global_catalog");
        globalList.items(List.of(
                new ListVariableConfig.ListItem("g1", "Tomato", 1.0),
                new ListVariableConfig.ListItem("g2", "Lettuce", 1.0),
                new ListVariableConfig.ListItem("g3", "Pepper", 1.0),
                new ListVariableConfig.ListItem("g4", "Carrot", 1.0),
                new ListVariableConfig.ListItem("g5", "Zucchini", 1.0),
                new ListVariableConfig.ListItem("g6", "Spinach", 1.0),
                new ListVariableConfig.ListItem("g7", "Onion", 1.0)
        ));

        // 2. Group Sub-List (derives 4 items from global_catalog)
        ListVariableConfig groupList = new ListVariableConfig();
        groupList.identifier("group_catalog");
        groupList.setSourceListVariableId("global_catalog");
        groupList.setSourceListSelectionMode("SUBSET_SPECIFIC");
        groupList.setSelectedListItemIds(List.of("g1", "g2", "g3", "g4"));

        // 3. Local Sub-List (derives 3 fixed items from group_catalog)
        ListVariableConfig localList = new ListVariableConfig();
        localList.identifier("plantation_veg");
        localList.setSourceListVariableId("group_catalog");
        localList.setSourceListSelectionMode("SUBSET_SPECIFIC");
        localList.setSelectedListItemIds(List.of("g1", "g2", "g3"));

        // 4. Local String variable picking fixed item from plantation_veg
        StringVariableConfig fixedStrVar = new StringVariableConfig();
        fixedStrVar.identifier("fav_vegetable");
        fixedStrVar.setSourceListVariableId("plantation_veg");
        fixedStrVar.setSourceListSelectionMode("FIXED_ITEM");
        fixedStrVar.setSelectedListItemId("g2");

        // 5. Local Numeric list & dependent numeric variable
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

        // Setup execution context
        ConfigurableVariable cvGlobalList = new ConfigurableVariable(globalList);
        ConfigurableVariable cvGroupList = new ConfigurableVariable(groupList);
        ConfigurableVariable cvLocalList = new ConfigurableVariable(localList);
        ConfigurableVariable cvFixedStr = new ConfigurableVariable(fixedStrVar);
        ConfigurableVariable cvGlobalNum = new ConfigurableVariable(globalNumList);
        ConfigurableVariable cvLocalTemp = new ConfigurableVariable(localTempVar);

        Map<String, Object> context = new HashMap<>();
        context.put("global_catalog_config", cvGlobalList);
        context.put("global_catalog", cvGlobalList.getValue());
        context.put("group_catalog_config", cvGroupList);
        context.put("group_catalog", cvGroupList.getValue());
        context.put("plantation_veg_config", cvLocalList);
        context.put("plantation_veg", cvLocalList.getValue());
        context.put("fav_vegetable_config", cvFixedStr);
        context.put("global_temps_config", cvGlobalNum);
        context.put("global_temps", cvGlobalNum.getValue());

        cvGroupList.setContext(context);
        cvLocalList.setContext(context);
        cvFixedStr.setContext(context);
        cvLocalTemp.setContext(context);

        // 6. Local Sub-List using FIXED_SUBSET strategy
        ListVariableConfig fixedSubsetList = new ListVariableConfig();
        fixedSubsetList.identifier("fixed_array_veg");
        fixedSubsetList.setSourceListVariableId("group_catalog");
        fixedSubsetList.setSourceListSelectionMode("SUBSET_SPECIFIC");
        fixedSubsetList.setSelectedListItemIds(List.of("g1", "g2", "g3"));
        fixedSubsetList.selectionStrategy(ListVariableConfig.SelectionStrategy.FIXED_SUBSET);

        ConfigurableVariable cvFixedSubsetList = new ConfigurableVariable(fixedSubsetList);
        context.put("fixed_array_veg_config", cvFixedSubsetList);
        context.put("fixed_array_veg", cvFixedSubsetList.getValue());
        cvFixedSubsetList.setContext(context);

        // Set of allowed values for plantation_veg (Tomato, Lettuce, Pepper)
        Set<Object> allowedPlantationVegs = Set.of("Tomato", "Lettuce", "Pepper");
        Set<Object> allowedTemps = Set.of(21.5, 25.0, 28.3);

        int totalTicks = 100_000;
        long startTime = System.currentTimeMillis();

        for (int i = 0; i < totalTicks; i++) {
            Object localVegVal = cvLocalList.getValue();
            assertNotNull("Local list generated value should not be null", localVegVal);
            assertTrue("Generated item '" + localVegVal + "' must belong to inherited subset", allowedPlantationVegs.contains(localVegVal));

            Object favVegVal = cvFixedStr.getValue();
            assertEquals("Fixed item selection must consistently return 'Lettuce'", "Lettuce", favVegVal);

            Object tempVal = cvLocalTemp.getValue();
            assertNotNull("Local temp generated value should not be null", tempVal);
            assertTrue("Temp value must come from global_temps list", allowedTemps.contains(tempVal));

            Object fixedSubVal = cvFixedSubsetList.getValue();
            assertTrue("FIXED_SUBSET must generate a List of item values", fixedSubVal instanceof List);
            List<?> subList = (List<?>) fixedSubVal;
            assertEquals("FIXED_SUBSET should return 3 items", 3, subList.size());
            assertEquals("Item 1 must be Tomato", "Tomato", subList.get(0));
            assertEquals("Item 2 must be Lettuce", "Lettuce", subList.get(1));
            assertEquals("Item 3 must be Pepper", "Pepper", subList.get(2));
        }

        long elapsedTime = System.currentTimeMillis() - startTime;
        System.out.printf("Completed %d ticks of list inheritance generation in %d ms (%.2f ops/sec)%n",
                totalTicks, elapsedTime, (totalTicks * 1000.0) / elapsedTime);
    }

    @Test(expected = CyclicDependencyException.class)
    public void testListReferenceCycleDetection() throws CyclicDependencyException {
        ListVariableConfig listA = new ListVariableConfig();
        listA.identifier("listA");
        listA.setSourceListVariableId("listB");

        ListVariableConfig listB = new ListVariableConfig();
        listB.identifier("listB");
        listB.setSourceListVariableId("listA");

        Map<String, VariableConfiguration> configs = Map.of(
                "listA", listA,
                "listB", listB
        );

        DependencyResolver resolver = new DependencyResolver();
        resolver.resolve(configs);
    }
}

