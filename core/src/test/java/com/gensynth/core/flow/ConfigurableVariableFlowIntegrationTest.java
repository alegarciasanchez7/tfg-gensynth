package com.gensynth.core.flow;

import com.gensynth.core.flow.variables.*;
import com.gensynth.core.flow.variables.config.*;
import org.junit.Before;
import org.junit.Test;

import java.util.Arrays;
import java.util.List;
import java.time.Instant;

import static org.junit.Assert.*;

/**
 * Integration tests for ConfigurableVariable with Flow.
 * 
 * Tests the complete flow: Variable Configuration → ConfigurableVariable → Flow.generateEvents()
 */
public class ConfigurableVariableFlowIntegrationTest {
    
    private Flow flow;

    @Before
    public void setUp() {
        flow = new Flow("test-flow");
    }

    /**
     * Test: Add NumericVariableConfig to Flow and generate events
     */
    @Test
    public void testNumericVariableInFlow() {
        // Create numeric variable configuration
        NumericVariableConfig numericConfig = new NumericVariableConfig()
            .identifier("temperature")
            .from(20.0)
            .to(30.0)
            .pattern(GenerationPattern.RANDOM);

        // Wrap in ConfigurableVariable
        ConfigurableVariable numericVar = new ConfigurableVariable(numericConfig);
        
        // Add to flow
        flow.addVariable(numericVar);
        assertEquals(1, flow.getVariableCount());

        // Generate events
        List<DataEvent> events = flow.generateEvents();
        
        assertNotNull(events);
        assertEquals(1, events.size());
        
        DataEvent event = events.get(0);
        assertEquals("test-flow", event.getDeviceId());
        assertEquals("temperature", event.getVariableId());
        assertTrue(event.getValue() instanceof Double);
        
        double value = (double) event.getValue();
        assertTrue(value >= 20.0 && value <= 30.0);
    }

    /**
     * Test: Add StringVariableConfig to Flow and generate events
     */
    @Test
    public void testStringVariableInFlow() {
        // Create string variable configuration
        StringVariableConfig stringConfig = new StringVariableConfig()
            .identifier("username")
            .fixedSize(8);

        // Wrap in ConfigurableVariable
        ConfigurableVariable stringVar = new ConfigurableVariable(stringConfig);
        
        // Add to flow
        flow.addVariable(stringVar);

        // Generate events
        List<DataEvent> events = flow.generateEvents();
        
        assertEquals(1, events.size());
        
        DataEvent event = events.get(0);
        assertEquals("username", event.getVariableId());
        assertTrue(event.getValue() instanceof String);
        
        String value = (String) event.getValue();
        assertEquals(8, value.length());
    }

    /**
     * Test: Add BooleanVariableConfig to Flow and generate events
     */
    @Test
    public void testBooleanVariableInFlow() {
        // Create boolean variable configuration
        BooleanVariableConfig booleanConfig = new BooleanVariableConfig()
            .identifier("isActive")
            .constantValue(true)
            .pattern(GenerationPattern.CONSTANT_BOOLEAN);

        // Wrap in ConfigurableVariable
        ConfigurableVariable booleanVar = new ConfigurableVariable(booleanConfig);
        
        // Add to flow
        flow.addVariable(booleanVar);

        // Generate events
        List<DataEvent> events = flow.generateEvents();
        
        assertEquals(1, events.size());
        
        DataEvent event = events.get(0);
        assertEquals("isActive", event.getVariableId());
        assertTrue(event.getValue() instanceof Boolean);
        
        assertTrue((boolean) event.getValue());
    }

    /**
     * Test: Multiple ConfigurableVariables in single Flow
     */
    @Test
    public void testMultipleVariablesInFlow() {
        // Add numeric variable
        NumericVariableConfig numericConfig = new NumericVariableConfig()
            .identifier("temperature")
            .from(20.0).to(30.0);
        flow.addVariable(new ConfigurableVariable(numericConfig));

        // Add boolean variable
        BooleanVariableConfig booleanConfig = new BooleanVariableConfig()
            .identifier("isActive")
            .constantValue(true);
        flow.addVariable(new ConfigurableVariable(booleanConfig));

        // Add string variable
        StringVariableConfig stringConfig = new StringVariableConfig()
            .identifier("sensor_id")
            .fixedSize(5);
        flow.addVariable(new ConfigurableVariable(stringConfig));

        // Verify all variables in flow
        assertEquals(3, flow.getVariableCount());
        assertTrue(flow.getVariableIds().contains("temperature"));
        assertTrue(flow.getVariableIds().contains("isActive"));
        assertTrue(flow.getVariableIds().contains("sensor_id"));

        // Generate events - should produce 3 events
        List<DataEvent> events = flow.generateEvents();
        assertEquals(3, events.size());

        // Verify event types
        DataEvent numericEvent = events.stream()
            .filter(e -> e.getVariableId().equals("temperature"))
            .findFirst()
            .orElse(null);
        assertNotNull(numericEvent);
        assertTrue(numericEvent.getValue() instanceof Double);

        DataEvent booleanEvent = events.stream()
            .filter(e -> e.getVariableId().equals("isActive"))
            .findFirst()
            .orElse(null);
        assertNotNull(booleanEvent);
        assertTrue(booleanEvent.getValue() instanceof Boolean);

        DataEvent stringEvent = events.stream()
            .filter(e -> e.getVariableId().equals("sensor_id"))
            .findFirst()
            .orElse(null);
        assertNotNull(stringEvent);
        assertTrue(stringEvent.getValue() instanceof String);
    }

    /**
     * Test: Multiple event generations produce different values (for RANDOM pattern)
     */
    @Test
    public void testMultipleEventGenerations() {
        // Create variable with RANDOM pattern
        NumericVariableConfig config = new NumericVariableConfig()
            .identifier("randomValue")
            .from(0.0).to(100.0)
            .pattern(GenerationPattern.RANDOM);

        ConfigurableVariable variable = new ConfigurableVariable(config);
        flow.addVariable(variable);

        // Generate multiple events
        double firstValue = (double) flow.generateEvents().get(0).getValue();
        double secondValue = (double) flow.generateEvents().get(0).getValue();
        double thirdValue = (double) flow.generateEvents().get(0).getValue();

        // At least one should be different (probability of 3 identical values is low)
        boolean hasVariation = !Double.valueOf(firstValue).equals(secondValue) 
            || !Double.valueOf(secondValue).equals(thirdValue);
        
        assertTrue("Expected variation in random values", hasVariation);
        
        // All should be in range
        assertTrue(firstValue >= 0.0 && firstValue <= 100.0);
        assertTrue(secondValue >= 0.0 && secondValue <= 100.0);
        assertTrue(thirdValue >= 0.0 && thirdValue <= 100.0);
    }

    /**
     * Test: ListVariableConfig in Flow
     */
    @Test
    public void testListVariableInFlow() {
        // Create list variable configuration
        ListVariableConfig listConfig = new ListVariableConfig()
            .identifier("status")
            .list(Arrays.asList("OK", "WARNING", "ERROR"))
            .pattern(GenerationPattern.RANDOM_FROM_LIST);

        ConfigurableVariable listVar = new ConfigurableVariable(listConfig);
        flow.addVariable(listVar);

        // Generate events
        List<DataEvent> events = flow.generateEvents();
        assertEquals(1, events.size());
        
        DataEvent event = events.get(0);
        assertTrue(event.getValue() instanceof String);
        
        String value = (String) event.getValue();
        assertTrue(value.equals("OK") || value.equals("WARNING") || value.equals("ERROR"));
    }

    /**
     * Test: DateVariableConfig in Flow
     */
    @Test
    public void testDateVariableInFlow() {
        // Create date variable configuration
        DateVariableConfig dateConfig = new DateVariableConfig()
            .identifier("timestamp")
            .pattern(GenerationPattern.SYSTEM_NOW);

        ConfigurableVariable dateVar = new ConfigurableVariable(dateConfig);
        flow.addVariable(dateVar);

        // Generate events
        List<DataEvent> events = flow.generateEvents();
        assertEquals(1, events.size());
        
        DataEvent event = events.get(0);
        assertTrue(event.getValue() instanceof Instant);
        
        Instant timestamp = (Instant) event.getValue();
        assertTrue(timestamp.toEpochMilli() > 0);
    }

    /**
     * Test: VariableFactory usage with Flow
     */
    @Test
    public void testVariableFactoryIntegration() {
        // Create variables using factory
        ConfigurableVariable temp = new ConfigurableVariable(
            VariableFactory.createNumeric("temperature")
                .from(20.0).to(30.0)
        );
        
        ConfigurableVariable isActive = new ConfigurableVariable(
            VariableFactory.createBoolean("active")
                .constantValue(true)
        );

        // Add to flow
        flow.addVariable(temp);
        flow.addVariable(isActive);

        // Generate events
        List<DataEvent> events = flow.generateEvents();
        assertEquals(2, events.size());
    }

    /**
     * Test: Event timestamps are from the same generation
     */
    @Test
    public void testEventTimestamps() {
        // Add multiple variables
        flow.addVariable(new ConfigurableVariable(
            VariableFactory.createNumeric("var1").from(0).to(100)
        ));
        flow.addVariable(new ConfigurableVariable(
            VariableFactory.createNumeric("var2").from(0).to(100)
        ));

        // Generate events
        List<DataEvent> events = flow.generateEvents();
        assertEquals(2, events.size());

        // All events should have the same timestamp (generated at same time)
        long firstTimestamp = events.get(0).getTimestamp();
        long secondTimestamp = events.get(1).getTimestamp();
        
        assertEquals(firstTimestamp, secondTimestamp);
    }
}
