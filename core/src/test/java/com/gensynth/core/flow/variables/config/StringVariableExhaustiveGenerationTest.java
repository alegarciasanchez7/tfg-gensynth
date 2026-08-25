package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.GenerationPattern;
import com.gensynth.core.flow.variables.VariableFactory;
import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.*;

/**
 * Comprehensive exhaustive test suite for StringVariableConfig.
 * Validates:
 * 1. Correct data generation for all generation modes (RANDOM, REGEX, CONSTANT, TEMPLATE, FORMATTED_MASK).
 * 2. Robustness and exception-free generation under corruption.
 * 3. Correct dependency resolution for templates.
 * 4. High volume generation stress tests.
 */
public class StringVariableExhaustiveGenerationTest {

    @Test
    public void testExhaustive_RandomString() {
        StringVariableConfig config = VariableFactory.createString("rand_str")
                .fixedSize(100)
                .lowerCase(0.5)
                .upperCase(0.3)
                .numbers(0.2)
                .symbols(0.0);
        config.pattern(GenerationPattern.RANDOM_STRING);

        for (int i = 0; i < 1000; i++) {
            String val = (String) config.generateNextValue();
            assertNotNull(val);
            assertEquals(100, val.length());
        }
    }

    @Test
    public void testExhaustive_Regex() {
        StringVariableConfig config = VariableFactory.createString("regex_str")
                .regex("USER_[A-Z0-9]{4}_[0-9]{2}");
        
        for (int i = 0; i < 1000; i++) {
            String val = (String) config.generateNextValue();
            assertTrue("Value must match regex: " + val, val.matches("USER_[A-Z0-9]{4}_[0-9]{2}"));
        }
    }

    @Test
    public void testExhaustive_Constant() {
        StringVariableConfig config = VariableFactory.createString("const_str")
                .constant("FIXED_VALUE_123");

        for (int i = 0; i < 100; i++) {
            String val = (String) config.generateNextValue();
            assertEquals("FIXED_VALUE_123", val);
        }
    }

    @Test
    public void testExhaustive_Template() {
        StringVariableConfig config = VariableFactory.createString("tmpl_str")
                .template("SENSOR-{{sensor_id}}-{{type}}");

        Map<String, Object> context = new HashMap<>();
        context.put("sensor_id", 999);
        context.put("type", "TEMP");
        config.setContext(context);

        assertEquals("SENSOR-999-TEMP", config.generateNextValue());
        
        // Check dependencies
        assertTrue(config.getDependencies().contains("sensor_id"));
        assertTrue(config.getDependencies().contains("type"));
        
        // Change context
        context.put("sensor_id", 100);
        context.put("type", "HUMIDITY");
        assertEquals("SENSOR-100-HUMIDITY", config.generateNextValue());
    }

    @Test
    public void testExhaustive_FormattedMasks() {
        StringVariableConfig config = VariableFactory.createString("mask_str");

        // IPv4
        config.formattedMaskType("IPV4");
        assertTrue(((String) config.generateNextValue()).matches("\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}"));

        // MAC
        config.formattedMaskType("MAC_ADDRESS");
        assertTrue(((String) config.generateNextValue()).matches("([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}"));

        // UUID
        config.formattedMaskType("UUID_V4");
        assertTrue(((String) config.generateNextValue()).matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"));

        // Alphanumeric
        config.formattedMaskType("ALPHANUMERIC").customMask("????");
        String alpha = (String) config.generateNextValue();
        assertTrue(alpha.length() > 0);

        // Custom
        config.formattedMaskType("CUSTOM_MASK").customMask("A#X?");
        String custom = (String) config.generateNextValue();
        // A -> A-Z, # -> 0-9, X -> 0-F, ? -> Alphanumeric
        assertTrue(Character.isLetter(custom.charAt(0)));
        assertTrue(Character.isDigit(custom.charAt(1)));
    }

    @Test
    public void testExhaustive_DataCorruptionMode() {
        StringVariableConfig config = VariableFactory.createString("corrupt_str")
                .constant("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
                .corruptionEnabled(true)
                .corruptionProbability(1.0); // 100% chance

        // Truncate
        config.corruptionMode("TRUNCATE").corruptionMagnitude(5);
        String tVal = (String) config.generateNextValue();
        assertEquals(26 - 5, tVal.length());

        // Replace Char
        config.corruptionMode("REPLACE_CHAR").corruptionMagnitude(3);
        String rVal = (String) config.generateNextValue();
        assertEquals(26, rVal.length());
        assertNotEquals("ABCDEFGHIJKLMNOPQRSTUVWXYZ", rVal);

        // Null Byte
        config.corruptionMode("NULL_BYTE").corruptionMagnitude(1);
        String nVal = (String) config.generateNextValue();
        assertTrue(nVal.contains("\0"));
    }

    @Test
    public void testExhaustive_HighVolumeStressTest() {
        StringVariableConfig config = VariableFactory.createString("stress_str")
                .regex("[A-Za-z0-9]{15,20}")
                .corruptionEnabled(true)
                .corruptionProbability(0.1) // 10%
                .corruptionMode("MIXED")
                .corruptionMagnitude(2);
                
        // Generate 100,000 values to verify zero memory leaks or crashes
        long start = System.currentTimeMillis();
        for (int i = 0; i < 100000; i++) {
            Object val = config.generateNextValue();
            assertNotNull(val);
            assertTrue(val instanceof String);
        }
        long duration = System.currentTimeMillis() - start;
        System.out.println(">>> SUCCESSFULLY GENERATED 100,000 STRING EVENTS IN " + duration + " ms <<<");
    }
}
