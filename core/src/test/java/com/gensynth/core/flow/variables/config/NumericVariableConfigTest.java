package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.GenerationPattern;
import com.gensynth.core.flow.variables.VariableFactory;
import org.junit.Test;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

public class NumericVariableConfigTest {

    @Test
    public void testValidate_invalidRange_returnsError() {
        NumericVariableConfig config = VariableFactory.createNumeric("v1")
                .from(10.0)
                .to(5.0);
        List<String> errors = config.validate();
        assertFalse(errors.isEmpty());
        assertTrue(errors.get(0).contains("min must be <= max"));
    }

    @Test
    public void testValidate_initialValueOutOfRange_returnsError() {
        NumericVariableConfig config = VariableFactory.createNumeric("v2")
                .from(0.0)
                .to(10.0)
                .initial(15.0);
        List<String> errors = config.validate();
        assertFalse(errors.isEmpty());
        assertTrue(errors.get(0).contains("Initial value"));
    }

    @Test
    public void testValidate_stepLargerThanRange_returnsError() {
        NumericVariableConfig config = VariableFactory.createNumeric("v3")
                .from(0.0)
                .to(10.0)
                .step(15.0)
                .pattern(GenerationPattern.RANDOM);
        List<String> errors = config.validate();
        assertFalse(errors.isEmpty());
        assertTrue(errors.get(0).contains("exceeds the range"));
    }

    @Test
    public void testValidate_emptyCustomDistribution_returnsError() {
        NumericVariableConfig config = VariableFactory.createNumeric("v4")
                .from(0.0)
                .to(10.0)
                .pattern(GenerationPattern.DISTRIBUTION)
                .distributionType("CUSTOM")
                .customDistributionGraph(new ArrayList<>());
        List<String> errors = config.validate();
        assertFalse(errors.isEmpty());
        assertTrue(errors.get(0).contains("requires at least one segment"));
    }

    @Test
    public void testGenerate_normalDistribution_alwaysWithinRange() {
        NumericVariableConfig config = VariableFactory.createNumeric("v5")
                .from(10.0)
                .to(20.0)
                .pattern(GenerationPattern.DISTRIBUTION)
                .distributionType("NORMAL");
        
        for (int i = 0; i < 1000; i++) {
            Object val = config.generateNextValue();
            assertTrue(val instanceof Double || val instanceof Float);
            double d = ((Number) val).doubleValue();
            assertTrue("Value " + d + " out of bounds", d >= 10.0 && d <= 20.0);
        }
    }

    @Test
    public void testGenerate_exponentialDistribution_alwaysWithinRange() {
        NumericVariableConfig config = VariableFactory.createNumeric("v6")
                .from(1.0)
                .to(5.0)
                .pattern(GenerationPattern.DISTRIBUTION)
                .distributionType("EXPONENTIAL");
        
        for (int i = 0; i < 1000; i++) {
            Object val = config.generateNextValue();
            double d = ((Number) val).doubleValue();
            assertTrue("Value " + d + " out of bounds", d >= 1.0 && d <= 5.0);
        }
    }

    @Test
    public void testGenerate_constant_withMargin_staysInRange() {
        NumericVariableConfig config = VariableFactory.createNumeric("v7")
                .from(0.0)
                .to(10.0)
                .constant(9.0)
                .constantMargin(5.0);
        
        for (int i = 0; i < 1000; i++) {
            Object val = config.generateNextValue();
            double d = ((Number) val).doubleValue();
            assertTrue("Value " + d + " out of bounds", d >= 0.0 && d <= 10.0);
        }
    }

    @Test
    public void testGenerate_sequential_respectsInitialValue_tick1() {
        NumericVariableConfig config = VariableFactory.createNumeric("v8")
                .from(0.0)
                .to(100.0)
                .initial(42.0)
                .steps(10)
                .pattern(GenerationPattern.SEQUENTIAL);
        
        Object val = config.generateNextValue();
        assertEquals(42.0, ((Number) val).doubleValue(), 0.001);
    }
}
