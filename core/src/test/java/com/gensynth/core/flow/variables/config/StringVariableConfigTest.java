package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.ConfigurableVariable;
import com.gensynth.core.flow.variables.GenerationPattern;
import com.gensynth.core.flow.variables.VariableFactory;
import com.gensynth.core.flow.variables.VariableType;
import org.junit.Before;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * Tests for string variable configuration
 */
public class StringVariableConfigTest {

    private StringVariableConfig config;

    @Before
    public void setUp() {
        config = new StringVariableConfig()
            .identifier("device_id")
            .fixedSize(8);
    }

    @Test
    public void testStringConfigCreation() {
        assertEquals("device_id", config.getIdentifier());
        assertEquals(VariableType.STRING, config.getType());
        assertTrue(config.isFixedSize());
        assertEquals(8, config.getFixedLength());
    }

    @Test
    public void testFixedSizeGeneration() {
        config.fixedSize(10);

        for (int i = 0; i < 20; i++) {
            Object value = config.generateNextValue();
            assertTrue(value instanceof String);
            String str = (String) value;
            assertEquals(10, str.length());
        }
    }

    @Test
    public void testVariableSizeGeneration() {
        config.variableSize(5, 15);

        for (int i = 0; i < 20; i++) {
            Object value = config.generateNextValue();
            assertTrue(value instanceof String);
            String str = (String) value;
            assertTrue(str.length() >= 5 && str.length() <= 15);
        }
    }

    @Test
    public void testCharacterComponentsEnabled() {
        config.fixedSize(50)
            .lowerCase(0.25)
            .upperCase(0.25)
            .numbers(0.25)
            .symbols(0.25);

        Object value = config.generateNextValue();
        String str = (String) value;

        assertTrue(str.length() > 0);
        assertNotNull(str);
    }

    @Test
    public void testBuilderChain() {
        StringVariableConfig chained = new StringVariableConfig()
            .identifier("sensor_name")
            .fixedSize(12);

        assertEquals("sensor_name", chained.getIdentifier());
        assertEquals(12, chained.getFixedLength());
    }

    @Test
    public void testReset() {
        config.pattern(GenerationPattern.RANDOM_STRING);
        config.generateNextValue();
        config.generateNextValue();

        long ticksAfterGeneration = config.getTickCounter();
        assertTrue(ticksAfterGeneration > 0);

        config.reset();
        assertEquals(0, config.getTickCounter());
    }

    @Test
    public void testToMap() {
        config.fixedSize(8);
        var map = config.toMap();

        assertEquals("device_id", map.get("identifier"));
        assertEquals("STRING", map.get("type"));
        assertEquals("RANDOM_STRING", map.get("pattern"));
        assertEquals(true, map.get("fixedSize"));
        assertEquals(8, map.get("fixedLength"));
    }

    @Test
    public void testOnlyLowerCase() {
        StringVariableConfig lower = new StringVariableConfig()
            .identifier("lowercase")
            .fixedSize(20)
            .lowerCase(1.0)
            .upperCase(0.0)
            .numbers(0.0)
            .symbols(0.0);

        Object value = lower.generateNextValue();
        String str = (String) value;

        for (char c : str.toCharArray()) {
            assertTrue(Character.isLowerCase(c) || c < 'a');
        }
    }

    @Test
    public void testIntegrationWithFactory() {
        StringVariableConfig stringConfig = VariableFactory.createString("sensor1")
            .fixedSize(8)
            .lowerCase(0.5)
            .upperCase(0.3)
            .numbers(0.2);
        ConfigurableVariable var = VariableFactory.createFromConfig(stringConfig);
        assertNotNull(var);
        assertEquals("sensor1", var.getId());
        assertEquals("STRING", var.getType());

        Object value = var.getValue();
        assertTrue(value instanceof String);
        assertEquals(8, ((String) value).length());
    }

    @Test
    public void testTickCounterIncrement() {
        config.pattern(GenerationPattern.RANDOM_STRING);
        assertEquals(0, config.getTickCounter());

        config.generateNextValue();
        assertEquals(1, config.getTickCounter());

        config.generateNextValue();
        assertEquals(2, config.getTickCounter());
    }

    @Test
    public void testMultipleGenerations() {
        config.fixedSize(8);

        String prev = null;
        int differentCount = 0;

        for (int i = 0; i < 10; i++) {
            Object value = config.generateNextValue();
            String current = (String) value;

            if (prev == null || !prev.equals(current)) {
                differentCount++;
            }
            prev = current;
        }

        assertTrue(differentCount > 5);
    }
    @Test
    public void testTemplateGeneration() {
        config.pattern(GenerationPattern.TEMPLATE)
              .template("DEV-{{sensor_id}}-{{status}}");
        
        java.util.Map<String, Object> ctx = new java.util.HashMap<>();
        ctx.put("sensor_id", 123);
        ctx.put("status", "ACTIVE");
        config.setContext(ctx);
        
        Object value = config.generateNextValue();
        assertEquals("DEV-123-ACTIVE", value.toString());
        
        java.util.Set<String> deps = config.getDependencies();
        assertTrue(deps.contains("sensor_id"));
        assertTrue(deps.contains("status"));
    }

    @Test
    public void testFormattedMaskGeneration() {
        config.pattern(GenerationPattern.FORMATTED_MASK)
              .formattedMaskType("IPV4");
        
        String ip = (String) config.generateNextValue();
        assertTrue(ip.matches("\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}"));
        
        config.formattedMaskType("CUSTOM_MASK").customMask("AA-##-xx");
        String custom = (String) config.generateNextValue();
        assertTrue(custom.matches("[A-Z]{2}-\\d{2}-[0-9a-f]{2}"));
    }

    @Test
    public void testDataCorruption() {
        config.pattern(GenerationPattern.CONSTANT)
              .constant("HELLO_WORLD")
              .corruptionEnabled(true)
              .corruptionProbability(1.0)
              .corruptionMode("TRUNCATE")
              .corruptionMagnitude(3);
              
        String val = (String) config.generateNextValue();
        assertEquals("HELLO_WO", val);
    }
}
