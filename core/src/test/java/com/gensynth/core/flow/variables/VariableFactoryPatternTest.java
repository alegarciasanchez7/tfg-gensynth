package com.gensynth.core.flow.variables;

import org.junit.Test;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** The pattern selected in the editor wins over keys left behind by patterns used before. */
public class VariableFactoryPatternTest {

    private static Object generate(String type, Map<String, Object> config) {
        return VariableFactory.createFromConfig(VariableFactory.createFromMap("v", type, config)).getValue();
    }

    @Test
    public void numericRandomIgnoresALeftoverConstantValue() {
        Map<String, Object> config = Map.of("pattern", "RANDOM", "min", 0, "max", 1000, "precision", "INTEGER",
                "constantValue", 42);
        Set<Object> values = new HashSet<>();
        for (int i = 0; i < 20; i++) {
            values.add(generate("numeric", config));
        }
        assertTrue("Random must not be stuck on the old constant: " + values, values.size() > 1);
    }

    @Test
    public void stringRegexIgnoresLeftoverFixedAndTemplateValues() {
        Object value = generate("string", Map.of("pattern", "REGEX", "regexPattern", "AB[0-9]{3}",
                "constantValue", "fixed", "template", "t"));
        assertTrue(String.valueOf(value), String.valueOf(value).matches("AB[0-9]{3}"));
    }

    @Test
    public void legacyConfigsWithoutPatternStillInferIt() {
        assertEquals("fixed", generate("string", Map.of("constantValue", "fixed")));
    }
}
