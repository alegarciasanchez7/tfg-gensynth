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
        String result = engine.evaluate(template, 42, variables, "f1", "g1");

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
                Map.of("min", 20.0, "max", 20.0), // Force deterministic value
                "flow-1",
                "group-1"
        );
        variables.put("v1", tempVar);

        // Valid access (in-scope)
        String template = "{\"temp\": {{temperature}}, \"local\": {{local.temperature}} }";
        String result = engine.evaluate(template, 1, variables, "flow-1", "group-1");
        assertEquals("{\"temp\": 20.0, \"local\": 20.0 }", result);

        // Invalid access (wrong flow)
        String result2 = engine.evaluate(template, 1, variables, "other-flow", "group-1");
        assertEquals("{\"temp\": {{temperature}}, \"local\": {{local.temperature}} }", result2);
    }

    @Test
    public void testScopingEnforcement() {
        Variable groupVar = new Variable("v2", "shared", "GROUP", "numeric", 10.0, Map.of("min", 10.0, "max", 10.0), null, "group-A");
        variables.put("v2", groupVar);

        String template = "{{group.shared}}";
        
        // Match (same group)
        assertEquals("10.0", engine.evaluate(template, 1, variables, "flow-any", "group-A"));
        
        // No match (different group)
        assertEquals("{{group.shared}}", engine.evaluate(template, 1, variables, "flow-any", "group-B"));
    }

    @Test
    public void testUnknownVariableIsLeftAsIs() {
        String template = "Value is {{unknownVar}}!";
        String result = engine.evaluate(template, 1, variables, "f1", "g1");

        assertEquals("Value is {{unknownVar}}!", result);
    }

    @Test
    public void testEmptyTemplate() {
        assertEquals("", engine.evaluate("", 1, variables, "f1", "g1"));
        assertEquals("", engine.evaluate(null, 1, variables, "f1", "g1"));
    }
}
