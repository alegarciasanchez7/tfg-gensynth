package com.gensynth.core.flow.variables;

import com.gensynth.core.flow.variables.config.NumericVariableConfig;
import org.junit.Test;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

public class DependencyResolverTest {

    @Test
    public void testResolve_noDependencies_returnsAllVariables() throws Exception {
        Map<String, VariableConfiguration> configs = new HashMap<>();
        configs.put("A", VariableFactory.createNumeric("A"));
        configs.put("B", VariableFactory.createNumeric("B"));

        DependencyResolver resolver = new DependencyResolver();
        List<String> order = resolver.resolve(configs);

        assertEquals(2, order.size());
        assertTrue(order.contains("A"));
        assertTrue(order.contains("B"));
    }

    @Test
    public void testResolve_linearChain_returnsCorrectOrder() throws Exception {
        NumericVariableConfig configA = VariableFactory.createNumeric("A").formula("[B] + 1");
        configA.pattern(GenerationPattern.FORMULA);
        
        NumericVariableConfig configB = VariableFactory.createNumeric("B").formula("[C] + 2");
        configB.pattern(GenerationPattern.FORMULA);
        
        NumericVariableConfig configC = VariableFactory.createNumeric("C");

        Map<String, VariableConfiguration> configs = new HashMap<>();
        configs.put("A", configA);
        configs.put("B", configB);
        configs.put("C", configC);

        DependencyResolver resolver = new DependencyResolver();
        List<String> order = resolver.resolve(configs);

        assertEquals(3, order.size());
        assertEquals("C", order.get(0));
        assertEquals("B", order.get(1));
        assertEquals("A", order.get(2));
    }

    @Test
    public void testResolve_cyclicDependency_throwsException() {
        NumericVariableConfig configA = VariableFactory.createNumeric("A").formula("[B] + 1");
        configA.pattern(GenerationPattern.FORMULA);
        
        NumericVariableConfig configB = VariableFactory.createNumeric("B").formula("[A] + 2");
        configB.pattern(GenerationPattern.FORMULA);

        Map<String, VariableConfiguration> configs = new HashMap<>();
        configs.put("A", configA);
        configs.put("B", configB);

        DependencyResolver resolver = new DependencyResolver();
        try {
            resolver.resolve(configs);
            fail("Expected CyclicDependencyException");
        } catch (CyclicDependencyException e) {
            // Success
        }
    }

    @Test
    public void testResolve_selfReference_throwsException() {
        NumericVariableConfig configA = VariableFactory.createNumeric("A").formula("[A] + 1");
        configA.pattern(GenerationPattern.FORMULA);

        Map<String, VariableConfiguration> configs = new HashMap<>();
        configs.put("A", configA);

        DependencyResolver resolver = new DependencyResolver();
        try {
            resolver.resolve(configs);
            fail("Expected CyclicDependencyException");
        } catch (CyclicDependencyException e) {
            // Success
        }
    }

    @Test
    public void testResolve_brokenReference_throwsIllegalArgument() {
        NumericVariableConfig configA = VariableFactory.createNumeric("A").formula("[Z] + 1");
        configA.pattern(GenerationPattern.FORMULA);

        Map<String, VariableConfiguration> configs = new HashMap<>();
        configs.put("A", configA);

        DependencyResolver resolver = new DependencyResolver();
        try {
            resolver.resolve(configs);
            fail("Expected IllegalArgumentException");
        } catch (IllegalArgumentException e) {
            // Success
        } catch (CyclicDependencyException e) {
            fail("Expected IllegalArgumentException but got CyclicDependencyException");
        }
    }

    @Test
    public void testResolve_uuidAndNameReference_resolvesSuccessfully() throws Exception {
        VariableConfiguration parentList = VariableFactory.createList("available_vegetables").identifier("v0000002-0000-4000-8000-000000000099");
        VariableConfiguration childList = VariableFactory.createList("vegetables_7").sourceListVariableId("v0000002-0000-4000-8000-000000000099");

        Map<String, VariableConfiguration> configs = new HashMap<>();
        configs.put("available_vegetables", parentList);
        configs.put("v0000002-0000-4000-8000-000000000099", parentList);
        configs.put("vegetables_7", childList);

        DependencyResolver resolver = new DependencyResolver();
        List<String> order = resolver.resolve(configs);

        assertTrue(order.contains("vegetables_7"));
        assertTrue(order.contains("available_vegetables") || order.contains("v0000002-0000-4000-8000-000000000099"));
    }

    @Test
    public void testResolve_cycleBelowTheStart_reportsOnlyTheCyclicPart() {
        NumericVariableConfig configA = VariableFactory.createNumeric("A").formula("[B] + 1");
        configA.pattern(GenerationPattern.FORMULA);
        NumericVariableConfig configB = VariableFactory.createNumeric("B").formula("[C] + 1");
        configB.pattern(GenerationPattern.FORMULA);
        NumericVariableConfig configC = VariableFactory.createNumeric("C").formula("[B] + 1");
        configC.pattern(GenerationPattern.FORMULA);

        Map<String, VariableConfiguration> configs = new java.util.LinkedHashMap<>();
        configs.put("A", configA);
        configs.put("B", configB);
        configs.put("C", configC);

        try {
            new DependencyResolver().resolve(configs);
            fail("Expected CyclicDependencyException");
        } catch (CyclicDependencyException e) {
            assertEquals(List.of("B", "C", "B"), e.getCycle());
            assertEquals("Circular dependency detected: B -> C -> B", e.getMessage());
        }
    }

    @Test
    public void testResolve_missingConfig_isOrderedWithoutDependencies() throws Exception {
        Map<String, VariableConfiguration> configs = new HashMap<>();
        configs.put("A", null);

        assertEquals(List.of("A"), new DependencyResolver().resolve(configs));
    }
}
