package com.gensynth.core.flow;

import com.gensynth.core.model.Variable;
import org.junit.Before;
import org.junit.Test;
import static org.junit.Assert.*;

import java.util.HashMap;
import java.util.List;
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

    @Test
    public void testConditionalRuleCanUseDependencyNotInTemplate() {
        Variable holaVar = new Variable(
                "vh",
                "hola",
                "GLOBAL",
                "numeric",
                0.0,
                Map.of("min", 20.0, "max", 20.0),
                null,
                null
        );

        Variable productVar = new Variable(
                "vp",
                "product",
                "GROUP",
                "string",
                "",
                Map.of(
                        "conditionalRules",
                        List.of(
                                Map.of(
                                        "targetVariable", "hola",
                                        "operator", "GREATER_THAN",
                                        "value", 10,
                                        "overrides", Map.of(
                                                "pattern", "CONSTANT",
                                                "constantValue", "Macarrones"
                                        )
                                )
                        )
                ),
                null,
                "group-1"
        );

        variables.put(holaVar.getId(), holaVar);
        variables.put(productVar.getId(), productVar);

        String template = "{\"product\":\"{{group.product}}\"}";
        String result = engine.evaluate(template, 1, variables, "flow-1", "group-1");

        assertEquals("{\"product\":\"Macarrones\"}", result);
    }

    @Test
    public void testListVariableFormatting_FixedSubset_returnsJsonArray() {
        Variable listVar = new Variable(
                "vl1",
                "vegetables_7",
                "LOCAL",
                "list",
                List.of(),
                Map.of(
                        "selectionStrategy", "FIXED_SUBSET",
                        "items", List.of(
                                Map.of("id", "i1", "value", "Carrot", "weight", 1.0),
                                Map.of("id", "i2", "value", "Onion", "weight", 1.0)
                        )
                ),
                "flow-1",
                "group-1"
        );
        variables.put("vl1", listVar);

        String template = "{\"veggies\": {{local.vegetables_7}} }";
        String result = engine.evaluate(template, 1, variables, "flow-1", "group-1");

        assertEquals("{\"veggies\": [\"Carrot\", \"Onion\"] }", result);
    }

    @Test
    public void testListVariableFormatting_ItemIndex_returnsIndexedItem() {
        Variable listVar = new Variable(
                "vl1",
                "vegetables_7",
                "LOCAL",
                "list",
                List.of(),
                Map.of(
                        "selectionStrategy", "FIXED_SUBSET",
                        "items", List.of(
                                Map.of("id", "i1", "value", "Carrot", "weight", 1.0),
                                Map.of("id", "i2", "value", "Onion", "weight", 1.0)
                        )
                ),
                "flow-1",
                "group-1"
        );
        variables.put("vl1", listVar);

        String template = "{\"first\": \"{{local.vegetables_7.item0}}\", \"second\": \"{{local.vegetables_7.item1}}\"}";
        String result = engine.evaluate(template, 1, variables, "flow-1", "group-1");

        assertEquals("{\"first\": \"Carrot\", \"second\": \"Onion\"}", result);
    }

    @Test
    public void testListVariableFormatting_InheritedSourceList() {
        Variable parentListVar = new Variable(
                "v0000002-0000-4000-8000-000000000099",
                "available_vegetables",
                "GROUP",
                "list",
                List.of(),
                Map.of(
                        "selectionStrategy", "WEIGHTED_RANDOM",
                        "items", List.of(
                                Map.of("id", "veg-1", "value", "Tomato", "weight", 1.0),
                                Map.of("id", "veg-2", "value", "Lettuce", "weight", 1.0),
                                Map.of("id", "veg-3", "value", "Carrot", "weight", 1.0)
                        )
                ),
                null,
                "group-1"
        );

        Variable childListVar = new Variable(
                "v_child",
                "vegetables_1",
                "LOCAL",
                "list",
                List.of(),
                Map.of(
                        "selectionStrategy", "FIXED_SUBSET",
                        "sourceListVariableId", "v0000002-0000-4000-8000-000000000099",
                        "sourceListSelectionMode", "SUBSET_SPECIFIC",
                        "selectedListItemIds", List.of("veg-1", "veg-3"),
                        "items", List.of()
                ),
                "flow-1",
                "group-1"
        );

        variables.put(parentListVar.getId(), parentListVar);
        variables.put(childListVar.getId(), childListVar);

        String template = "{\"veggies\": {{local.vegetables_1}} }";
        String result = engine.evaluate(template, 1, variables, "flow-1", "group-1");

        assertEquals("{\"veggies\": [\"Tomato\", \"Carrot\"] }", result);
    }

    @Test
    public void testListVariableFormatting_ItemOrderPreserved() {
        Variable parentListVar = new Variable(
                "v_parent",
                "available_vegetables",
                "GROUP",
                "list",
                List.of(),
                Map.of(
                        "selectionStrategy", "WEIGHTED_RANDOM",
                        "items", List.of(
                                Map.of("id", "veg-3", "value", "Carrot", "weight", 1.0),
                                Map.of("id", "veg-5", "value", "Onion", "weight", 1.0),
                                Map.of("id", "veg-7", "value", "Spinach", "weight", 1.0)
                        )
                ),
                null,
                "group-1"
        );

        Variable childListVar = new Variable(
                "v_child7",
                "vegetables_7",
                "LOCAL",
                "list",
                List.of(),
                Map.of(
                        "selectionStrategy", "FIXED_SUBSET",
                        "sourceListVariableId", "v_parent",
                        "sourceListSelectionMode", "SUBSET_SPECIFIC",
                        "selectedListItemIds", List.of("veg-3", "veg-5", "veg-7"),
                        "items", List.of(
                                Map.of("id", "item_1", "value", "Paco", "weight", 1.0)
                        ),
                        "itemOrder", List.of("veg-3", "item_1", "veg-5", "veg-7")
                ),
                "flow-1",
                "group-1"
        );

        variables.put(parentListVar.getId(), parentListVar);
        variables.put(childListVar.getId(), childListVar);

        String template = "{\"veggies\": {{local.vegetables_7}} }";
        String result = engine.evaluate(template, 1, variables, "flow-1", "group-1");

        assertEquals("{\"veggies\": [\"Carrot\", \"Paco\", \"Onion\", \"Spinach\"] }", result);
    }

    @Test
    public void testTemporalVariableAttributeExtraction() {
        Variable dateVar = new Variable(
                "v_date",
                "creation_date",
                "LOCAL",
                "temporal",
                "2026-08-20T15:30:00Z",
                Map.of(
                        "pattern", "FIXED_TEMPORAL",
                        "timeAdvanceMode", "FIXED",
                        "fixedDate", "2026-08-20T15:30:00Z",
                        "timeZone", "UTC"
                ),
                "flow-1",
                "group-1"
        );
        variables.put(dateVar.getId(), dateVar);

        String template = "Month: {{local.creation_date.monthText}}, Year: {{local.creation_date.year}}, Day: {{local.creation_date.day}}";
        String result = engine.evaluate(template, 1, variables, "flow-1", "group-1");

        assertEquals("Month: August, Year: 2026, Day: 20", result);
    }

    @Test
    public void testNumericVariableAttributeExtraction() {
        Variable numVar = new Variable(
                "v_num",
                "price",
                "LOCAL",
                "numeric",
                123.456,
                Map.of(
                        "pattern", "CONSTANT",
                        "constantValue", 123.456,
                        "decimalPlaces", 3
                ),
                "flow-1",
                "group-1"
        );
        variables.put(numVar.getId(), numVar);

        String template = "Int: {{local.price.integerPart}}, Decimal: {{local.price.decimalPart}}, Abs: {{local.price.abs}}, Round: {{local.price.round}}";
        String result = engine.evaluate(template, 1, variables, "flow-1", "group-1");

        assertEquals("Int: 123, Decimal: 456, Abs: 123.456, Round: 123", result);
    }

    @Test
    public void testStringVariableAttributeExtraction() {
        Variable strVar = new Variable(
                "v_str",
                "username",
                "LOCAL",
                "string",
                "Hello World",
                Map.of(
                        "pattern", "CONSTANT",
                        "constantValue", "Hello World"
                ),
                "flow-1",
                "group-1"
        );
        variables.put(strVar.getId(), strVar);

        String template = "Length: {{local.username.length}}, Upper: {{local.username.upper}}, Lower: {{local.username.lower}}, First: {{local.username.firstChar}}";
        String result = engine.evaluate(template, 1, variables, "flow-1", "group-1");

        assertEquals("Length: 11, Upper: HELLO WORLD, Lower: hello world, First: H", result);
    }

    @Test
    public void testBooleanVariableAttributeExtraction() {
        Variable boolVar = new Variable(
                "v_bool",
                "is_active",
                "LOCAL",
                "boolean",
                true,
                Map.of(
                        "pattern", "CONSTANT_BOOLEAN",
                        "currentValue", true
                ),
                "flow-1",
                "group-1"
        );
        variables.put(boolVar.getId(), boolVar);

        String template = "Inverse: {{local.is_active.inverse}}, Binary: {{local.is_active.binary}}, AsUpper: {{local.is_active.asUpper}}";
        String result = engine.evaluate(template, 1, variables, "flow-1", "group-1");

        assertEquals("Inverse: false, Binary: 1, AsUpper: TRUE", result);
    }

    @Test
    public void testListVariableSizeAttributeExtraction() {
        Variable listVar = new Variable(
                "v_list",
                "colors",
                "LOCAL",
                "list",
                List.of("Red", "Green", "Blue"),
                Map.of(
                        "selectionStrategy", "FIXED_SUBSET",
                        "items", List.of("Red", "Green", "Blue")
                ),
                "flow-1",
                "group-1"
        );
        variables.put(listVar.getId(), listVar);

        String template = "Count: {{local.colors.size}}, First: {{local.colors.first}}, Last: {{local.colors.last}}";
        String result = engine.evaluate(template, 1, variables, "flow-1", "group-1");

        assertEquals("Count: 3, First: Red, Last: Blue", result);
    }
}
