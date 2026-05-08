package com.gensynth.core.flow;

import com.gensynth.core.model.Variable;
import org.junit.Before;
import org.junit.Test;
import static org.junit.Assert.*;

import java.util.HashMap;
import java.util.Map;

public class TemplateEngineTest {

    private TemplateEngine engine;
    private Map<String, Variable> variables;

    @Before
    public void setUp() {
        engine = new TemplateEngine();
        variables = new HashMap<>();
    }

    @Test
    public void testSystemVariablesReplacement() {
        String template = "ID: {{uuid}}, TS: {{ts}}, SEQ: {{n}}";
        String result = engine.evaluate(template, 42, variables);

        assertNotNull(result);
        assertTrue(result.contains("ID: "));
        assertFalse(result.contains("{{uuid}}"));
        assertTrue(result.contains("TS: "));
        assertFalse(result.contains("{{ts}}"));
        assertTrue(result.contains("SEQ: 42"));
    }

    @Test
    public void testUserVariableReplacement() {
        Variable tempVar = new Variable(
                "v1",
                "temperature",
                "LOCAL",
                "numeric",
                25.0,
                Map.of("min", 20.0, "max", 20.0) // Force deterministic value
        );
        variables.put("v1", tempVar); // Note: Map is keyed by UUID, but TemplateEngine searches by name

        String template = "{\"temp\": {{temperature}}, \"local\": {{local.temperature}} }";
        String result = engine.evaluate(template, 1, variables);

        assertEquals("{\"temp\": 20.0, \"local\": 20.0 }", result);
    }

    @Test
    public void testUnknownVariableIsLeftAsIs() {
        String template = "Value is {{unknownVar}}!";
        String result = engine.evaluate(template, 1, variables);

        assertEquals("Value is {{unknownVar}}!", result);
    }

    @Test
    public void testEmptyTemplate() {
        assertEquals("", engine.evaluate("", 1, variables));
        assertEquals("", engine.evaluate(null, 1, variables));
    }
}
