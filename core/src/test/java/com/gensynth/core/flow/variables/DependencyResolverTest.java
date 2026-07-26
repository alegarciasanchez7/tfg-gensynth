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
}
