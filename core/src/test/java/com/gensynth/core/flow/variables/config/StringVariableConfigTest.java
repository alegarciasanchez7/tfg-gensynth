package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.ConfigurableVariable;
import com.gensynth.core.flow.variables.GenerationPattern;
import com.gensynth.core.flow.variables.VariableFactory;
import com.gensynth.core.flow.variables.VariableType;
import org.junit.Before;
import org.junit.Test;

import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;
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
        
        config.formattedMaskType("CUSTOM_MASK").customMask("@@-##-$$").alphanumericCase("UPPER");
        String custom = (String) config.generateNextValue();
        assertTrue(custom, custom.matches("[A-Z]{2}-\\d{2}-[0-9A-F]{2}"));
    }

    @Test
    public void lettersAndDigitsOfTheMaskAreCopiedAsWritten() {
        config.pattern(GenerationPattern.FORMATTED_MASK).formattedMaskType("CUSTOM_MASK")
              .customMask("MENSAJE-###-?").alphanumericCase("UPPER");

        for (int i = 0; i < 200; i++) {
            String value = (String) config.generateNextValue();
            assertTrue(value, value.matches("MENSAJE-\\d{3}-[A-Z0-9]"));
        }

        // Former symbols (A, a, X, x) are plain text now
        config.customMask("TAXI-Aa-Xx");
        assertEquals("TAXI-Aa-Xx", config.generateNextValue());
    }

    @Test
    public void caseFormattingOnlyChangesTheGeneratedCharacters() {
        String generated = "@@@@@@@@@@$$$$$$$$$$??????????".repeat(10);
        config.pattern(GenerationPattern.FORMATTED_MASK).formattedMaskType("CUSTOM_MASK")
              .customMask("Mensaje-" + generated);

        config.alphanumericCase("UPPER");
        String upper = (String) config.generateNextValue();
        assertTrue(upper, upper.matches("Mensaje-[A-Z0-9]{300}"));

        config.alphanumericCase("LOWER");
        String lower = (String) config.generateNextValue();
        assertTrue(lower, lower.matches("Mensaje-[a-z0-9]{300}"));

        config.alphanumericCase("MIXED");
        String mixed = (String) config.generateNextValue();
        assertTrue(mixed, mixed.startsWith("Mensaje-"));
        assertTrue("Mixed Case must give lower-case letters: " + mixed, mixed.substring(8).chars().anyMatch(Character::isLowerCase));
        assertTrue("Mixed Case must give upper-case letters: " + mixed, mixed.substring(8).chars().anyMatch(Character::isUpperCase));
    }

    @Test
    public void eachSymbolGivesItsKindOfCharacter() {
        config.pattern(GenerationPattern.FORMATTED_MASK).formattedMaskType("CUSTOM_MASK").alphanumericCase("UPPER");

        config.customMask("#".repeat(200));
        assertTrue(((String) config.generateNextValue()).matches("[0-9]{200}"));
        config.customMask("@".repeat(200));
        assertTrue(((String) config.generateNextValue()).matches("[A-Z]{200}"));
        config.customMask("$".repeat(200));
        assertTrue(((String) config.generateNextValue()).matches("[0-9A-F]{200}"));
        config.customMask("?".repeat(200));
        assertTrue(((String) config.generateNextValue()).matches("[A-Z0-9]{200}"));
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

    @Test
    public void validate_lengthErrorsInOrder() {
        assertEquals(List.of("Fixed string length must be greater than 0"),
                new StringVariableConfig().fixedSize(0).validate());
        assertEquals(List.of("Minimum string length cannot be negative",
                        "Minimum string length (-1) cannot be greater than maximum string length (-2)"),
                new StringVariableConfig().variableSize(-1, -2).validate());
        // A constant has no length to check
        assertTrue(new StringVariableConfig().fixedSize(0).constant("x").validate().isEmpty());
    }

    @Test
    public void validate_invalidRegex_returnsError() {
        StringVariableConfig regexConfig = new StringVariableConfig();
        // The builder keeps the pattern but fails to compile it
        assertThrows(RuntimeException.class, () -> regexConfig.regex("["));
        regexConfig.pattern(GenerationPattern.REGEX);

        List<String> errors = regexConfig.validate();
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).startsWith("Invalid regex pattern: "));
        // Generating tries to compile it again
        assertThrows(RuntimeException.class, regexConfig::generateNextValue);
    }

    @Test
    public void templatePatternWithoutTemplate_returnsError() {
        assertEquals(List.of("Template pattern requires a valid template string"),
                new StringVariableConfig().template("").validate());
    }

    @Test
    public void nullConstant_givesEmptyString() {
        assertEquals("", new StringVariableConfig().constant(null).generateNextValue());
    }

    @Test
    public void regexPatternWithoutRegex_givesEmptyString() {
        StringVariableConfig regexConfig = new StringVariableConfig().pattern(GenerationPattern.REGEX);
        assertTrue(regexConfig.validate().isEmpty());
        assertEquals("", regexConfig.generateNextValue());
    }

    @Test
    public void nullPattern_generatesARandomString() {
        config.pattern(null);
        assertEquals(8, ((String) config.generateNextValue()).length());
    }

    @Test
    public void noEnabledCharacterSet_fallsBackToLowerCase() {
        config.lowerCase(0.0).upperCase(0.0).numbers(0.0);
        String value = (String) config.generateNextValue();
        assertTrue(value, value.matches("[a-z]{8}"));
    }

    @Test
    public void corruptionWithZeroProbability_keepsTheValue() {
        config.constant("HELLO").corruptionEnabled(true).corruptionProbability(0.0).corruptionMode("TRUNCATE");
        assertEquals("HELLO", config.generateNextValue());
    }

    @Test
    public void listReference_givesTheItemTextAndCorruptsIt() {
        ListVariableConfig source = VariableFactory.createList("src")
                .items(List.of(new ListVariableConfig.ListItem("item", "ABC", 1.0)));
        config.setSourceListVariableId("src");
        config.setSourceListSelectionMode("FIXED_ITEM");
        config.setSelectedListItemId("item");
        config.setContext(Map.of("src_config", source));
        assertEquals("ABC", config.generateNextValue());

        config.corruptionEnabled(true).corruptionProbability(1.0).corruptionMode("TRUNCATE").corruptionMagnitude(1);
        assertEquals("AB", config.generateNextValue());
    }
}
