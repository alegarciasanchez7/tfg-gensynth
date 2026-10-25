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
    public void listSavedInheritingFromAnotherListKeepsOnlyItsOwnItems() {
        Variable parentListVar = new Variable(
                "v_parent",
                "available_vegetables",
                "GROUP",
                "list",
                List.of(),
                Map.of(
                        "selectionStrategy", "WEIGHTED_RANDOM",
                        "items", List.of(Map.of("id", "veg-1", "value", "Tomato", "weight", 1.0))
                ),
                null,
                "group-1"
        );
        // Written by a version where a list could inherit items from another list
        Variable childListVar = new Variable(
                "v_child",
                "vegetables_1",
                "LOCAL",
                "list",
                List.of(),
                Map.of(
                        "selectionStrategy", "FIXED_SUBSET",
                        "sourceListVariableId", "v_parent",
                        "sourceListSelectionMode", "SUBSET_SPECIFIC",
                        "selectedListItemIds", List.of("veg-1"),
                        "items", List.of(Map.of("id", "item_1", "value", "Paco", "weight", 1.0))
                ),
                "flow-1",
                "group-1"
        );

        variables.put(parentListVar.getId(), parentListVar);
        variables.put(childListVar.getId(), childListVar);

        String result = engine.evaluate("{\"veggies\": {{local.vegetables_1}} }", 1, variables, "flow-1", "group-1");

        assertEquals("{\"veggies\": [\"Paco\"] }", result);
    }

    @Test
    public void testListVariableFormatting_ItemOrderPreserved() {
        Variable listVar = new Variable(
                "v_list7",
                "vegetables_7",
                "LOCAL",
                "list",
                List.of(),
                Map.of(
                        "selectionStrategy", "FIXED_SUBSET",
                        "items", List.of(
                                Map.of("id", "veg-3", "value", "Carrot", "weight", 1.0),
                                Map.of("id", "veg-5", "value", "Onion", "weight", 1.0),
                                Map.of("id", "item_1", "value", "Paco", "weight", 1.0)
                        ),
                        "itemOrder", List.of("veg-3", "item_1", "veg-5")
                ),
                "flow-1",
                "group-1"
        );

        variables.put(listVar.getId(), listVar);

        String result = engine.evaluate("{\"veggies\": {{local.vegetables_7}} }", 1, variables, "flow-1", "group-1");

        assertEquals("{\"veggies\": [\"Carrot\", \"Paco\", \"Onion\"] }", result);
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
    public void testDecimalPartStripsOnlyTrailingZeros() {
        variables.put("v_whole", constantNumeric("v_whole", "whole", 42.0));
        variables.put("v_inner", constantNumeric("v_inner", "inner", 10.05));
        variables.put("v_neg", constantNumeric("v_neg", "neg", -3.5));

        String template = "{{local.whole.decimalPart}}|{{local.inner.decimalPart}}|{{local.neg.fraction}}";
        String result = engine.evaluate(template, 1, variables, "flow-1", "group-1");

        assertEquals("0|05|5", result);
    }

    @Test
    public void testStripTrailingZerosMatchesTheOldRegex() {
        String[] inputs = {"", "0", "000000", "456000", "050000", "100", "123", "1000001000", "0".repeat(10_000) + "1"};
        for (String input : inputs) {
            assertEquals(input, input.replaceAll("0+$", ""), TemplateEngine.stripTrailingZeros(input));
        }
    }

    private static Variable constantNumeric(String id, String name, double value) {
        return new Variable(
                id,
                name,
                "LOCAL",
                "numeric",
                value,
                Map.of(
                        "pattern", "CONSTANT",
                        "constantValue", value,
                        "decimalPlaces", 3
                ),
                "flow-1",
                "group-1"
        );
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

    @Test
    public void singleItemListStrategyAnswersListPropertiesAsAOneItemList() {
        Variable listVar = new Variable(
                "v_pick",
                "fruit",
                "LOCAL",
                "list",
                List.of(),
                Map.of(
                        "selectionStrategy", "WEIGHTED_RANDOM",
                        "items", List.of("Watermelon")
                ),
                "flow-1",
                "group-1"
        );
        variables.put(listVar.getId(), listVar);

        String template = "{{fruit.size}}|{{fruit.count}}|{{fruit.first}}|{{fruit.last}}|{{fruit.length}}|{{fruit.upper}}";
        String result = engine.evaluate(template, 1, variables, "flow-1", "group-1");

        // .size/.length/.count count items (1), not characters; string properties still apply to the item
        assertEquals("1|1|Watermelon|Watermelon|1|WATERMELON", result);
    }

    @Test
    public void fixedSubsetItemStringPropertiesAreUnchanged() {
        Variable listVar = new Variable(
                "v_sub",
                "colors",
                "LOCAL",
                "list",
                List.of(),
                Map.of(
                        "selectionStrategy", "FIXED_SUBSET",
                        "items", List.of("Red", "Green", "Blue")
                ),
                "flow-1",
                "group-1"
        );
        variables.put(listVar.getId(), listVar);

        String result = engine.evaluate("{{colors.item1.length}}|{{colors.item0.upper}}", 1, variables, "flow-1", "group-1");

        assertEquals("5|RED", result);
    }

    @Test
    public void variableReferencedTwiceHasOneValuePerMessage() {
        variables.put("c", new Variable("c", "counter", "LOCAL", "numeric", 0,
                Map.of("pattern", "SEQUENTIAL", "min", 0, "max", 100, "precision", "INTEGER",
                        "sequentialGraph", List.of(Map.of("x", 0, "y", 0), Map.of("x", 100, "y", 100))),
                "flow-1", "group-1"));

        String first = engine.evaluate("{{counter}}|{{counter}}", 1, variables, "flow-1", "group-1");
        String second = engine.evaluate("{{counter}}|{{counter}}", 2, variables, "flow-1", "group-1");

        String[] a = first.split("\\|");
        String[] b = second.split("\\|");
        assertEquals(a[0], a[1]);
        assertEquals(b[0], b[1]);
        // The generator advances once per message, not once per reference
        assertEquals(Long.parseLong(a[0]) + 1, Long.parseLong(b[0]));
    }

    @Test
    public void formulaPlacedBeforeItsSourceUsesTheEmittedValue() {
        variables.put("a", new Variable("a", "base", "LOCAL", "numeric", 0,
                Map.of("pattern", "RANDOM", "min", 0, "max", 1000, "precision", "INTEGER"),
                "flow-1", "group-1"));
        variables.put("b", new Variable("b", "doubled", "LOCAL", "numeric", 0,
                Map.of("pattern", "FORMULA", "formula", "{{base}}*2", "precision", "INTEGER"),
                "flow-1", "group-1"));

        for (int i = 0; i < 20; i++) {
            String[] parts = engine.evaluate("{{doubled}}|{{base}}", i, variables, "flow-1", "group-1").split("\\|");
            assertEquals(Long.parseLong(parts[1]) * 2, Long.parseLong(parts[0]));
        }
    }

    @Test
    public void formulaReadsNumbersWithPrefixOrSuffix() {
        variables.put("t", new Variable("t", "temp", "LOCAL", "numeric", 0,
                Map.of("pattern", "CONSTANT", "constantValue", 20, "suffix", " C"),
                "flow-1", "group-1"));
        variables.put("d", new Variable("d", "twice", "LOCAL", "numeric", 0,
                Map.of("pattern", "FORMULA", "formula", "{{temp}}*2", "precision", "INTEGER"),
                "flow-1", "group-1"));

        assertEquals("20 C|40", engine.evaluate("{{temp}}|{{twice}}", 1, variables, "flow-1", "group-1"));
    }

    @Test
    public void flowNameBuiltInIsReplacedWithTheFlowName() {
        String template = "{\"id\":\"{{flow.name}}\"}";

        assertEquals("{\"id\":\"Room 1\"}",
                engine.evaluate(template, 1, variables, "flow-1", "group-1", "Room 1", null));
        // Without a flow name (older callers) the placeholder is left as is
        assertEquals(template, engine.evaluate(template, 1, variables, "flow-1", "group-1"));
    }

    @Test
    public void flowNameBuiltInWinsOverAVariableNamedFlow() {
        variables.put("f", new Variable("f", "flow", "LOCAL", "string", "x",
                Map.of("pattern", "RANDOM_STRING"), "flow-1", "group-1"));

        assertEquals("Room 2",
                engine.evaluate("{{flow.name}}", 1, variables, "flow-1", "group-1", "Room 2", null));
    }

    @Test
    public void closestScopeWinsWhenNamesClash() {
        variables.put("g", new Variable("g", "level", "GLOBAL", "numeric", 0,
                Map.of("pattern", "CONSTANT", "constantValue", 1), null, null));
        variables.put("gr", new Variable("gr", "level", "GROUP", "numeric", 0,
                Map.of("pattern", "CONSTANT", "constantValue", 2), null, "group-1"));
        variables.put("l", new Variable("l", "level", "LOCAL", "numeric", 0,
                Map.of("pattern", "CONSTANT", "constantValue", 3), "flow-1", "group-1"));

        assertEquals("3", engine.evaluate("{{level}}", 1, variables, "flow-1", "group-1"));
        assertEquals("2", engine.evaluate("{{level}}", 1, variables, "flow-2", "group-1"));
        assertEquals("1", engine.evaluate("{{level}}", 1, variables, "flow-3", "group-2"));
        assertEquals("1", engine.evaluate("{{global.level}}", 1, variables, "flow-1", "group-1"));
    }

    @Test
    public void literalListItemsKeepTheirValueEvenWithADefaultGenerator() {
        // The UI stores a default embeddedConfig on literal items; isEmbedded=false must win
        Map<String, Object> embedded = Map.of("min", 0, "max", 100, "precision", "INTEGER");
        variables.put("m", new Variable("m", "movement", "LOCAL", "list", List.of(), Map.of(
                "selectionStrategy", "SEQUENTIAL",
                "items", List.of(
                        Map.of("id", "a", "value", "True", "weight", 1, "isEmbedded", false,
                                "embeddedType", "numeric", "embeddedConfig", embedded),
                        Map.of("id", "b", "value", "False", "weight", 1, "isEmbedded", false,
                                "embeddedType", "numeric", "embeddedConfig", embedded))),
                "flow-1", "group-1"));

        String first = engine.evaluate("{{movement}}", 1, variables, "flow-1", "group-1");
        String second = engine.evaluate("{{movement}}", 2, variables, "flow-1", "group-1");
        assertEquals(java.util.Set.of("True", "False"), java.util.Set.of(first, second));
    }

    @Test
    public void embeddedListItemsStillGenerateValues() {
        variables.put("m", new Variable("m", "reading", "LOCAL", "list", List.of(), Map.of(
                "selectionStrategy", "SEQUENTIAL",
                "items", List.of(Map.of("id", "a", "value", "x", "weight", 1, "isEmbedded", true,
                        "embeddedType", "numeric",
                        "embeddedConfig", Map.of("pattern", "CONSTANT", "constantValue", 7, "precision", "INTEGER")))),
                "flow-1", "group-1"));

        assertEquals("7", engine.evaluate("{{reading}}", 1, variables, "flow-1", "group-1"));
    }

    @Test
    public void ruleOverrideWithAFullConfigGeneratesFromThatConfig() {
        variables.put("s", new Variable("s", "state", "LOCAL", "list", List.of(), Map.of(
                "selectionStrategy", "SEQUENTIAL",
                "items", List.of(Map.of("id", "a", "value", "OK", "isEmbedded", false),
                        Map.of("id", "b", "value", "FAILURE", "isEmbedded", false))),
                "flow-1", "group-1"));
        variables.put("v", new Variable("v", "vibration", "LOCAL", "numeric", 0, Map.of(
                "pattern", "CONSTANT", "constantValue", 1, "precision", "INTEGER",
                "conditionalRules", List.of(Map.of("targetVariable", "state", "condition", "EQUALS",
                        "value", "FAILURE",
                        "overrides", Map.of("pattern", "RANDOM", "min", 40, "max", 120, "precision", "INTEGER")))),
                "flow-1", "group-1"));

        for (int i = 0; i < 20; i++) {
            String[] parts = engine.evaluate("{{vibration}}|{{state}}", i, variables, "flow-1", "group-1").split("\\|");
            long vibration = Long.parseLong(parts[0]);
            if ("FAILURE".equals(parts[1])) {
                assertTrue("override range: " + vibration, vibration >= 40 && vibration <= 120);
            } else {
                assertEquals(1, vibration);
            }
        }
    }

    @Test
    public void ruleOverrideWithASingleValueStillWorks() {
        variables.put("s", new Variable("s", "state", "LOCAL", "string", "x",
                Map.of("pattern", "CONSTANT", "constantValue", "FAILURE"), "flow-1", "group-1"));
        variables.put("v", new Variable("v", "vibration", "LOCAL", "numeric", 0, Map.of(
                "pattern", "CONSTANT", "constantValue", 1,
                "conditionalRules", List.of(Map.of("targetVariable", "state", "condition", "EQUALS",
                        "value", "FAILURE", "overrides", Map.of("constantValue", 25)))),
                "flow-1", "group-1"));

        assertEquals("25", engine.evaluate("{{vibration}}", 1, variables, "flow-1", "group-1"));
    }

    @Test
    public void temporalSubPropertiesUseTheGeneratedInstantWhateverTheFormat() {
        variables.put("t", new Variable("t", "eventTime", "LOCAL", "temporal", "", Map.of(
                "timeAdvanceMode", "SIMULATED_STEP", "startDate", "2025-06-01T08:00:00Z", "incrementMs", 4000,
                "dateFormat", "yyyy-MM-dd'T'HH:mm:ss.SSSZ", "timeZone", "UTC"), "flow-1", "group-1"));

        assertEquals("2025-06-01T08:00:00.000+0000|1748764800000|8",
                engine.evaluate("{{eventTime}}|{{eventTime.timestamp}}|{{eventTime.hour}}", 1, variables, "flow-1", "group-1"));
        assertEquals("1748764804000", engine.evaluate("{{eventTime.timestamp}}", 2, variables, "flow-1", "group-1"));
    }

    @Test
    public void isoInstantFormatPresetWorks() {
        variables.put("t", new Variable("t", "eventTime", "LOCAL", "temporal", "", Map.of(
                "timeAdvanceMode", "SIMULATED_STEP", "startDate", "2025-06-01T08:00:00Z", "incrementMs", 1000,
                "dateFormat", "ISO_INSTANT"), "flow-1", "group-1"));

        assertEquals("2025-06-01T08:00:00Z", engine.evaluate("{{eventTime}}", 1, variables, "flow-1", "group-1"));
    }
    @Test
    public void stringTemplateModeFormatsValuesLikeTheFlowTemplate() {
        variables.put("lvl", constantNumeric("lvl", "level", 42));
        variables.put("ratio", constantNumeric("ratio", "ratio", 0.5));
        variables.put("lbl", new Variable("lbl", "label", "LOCAL", "string", "", Map.of(
                "pattern", "TEMPLATE", "template", "L-{{level}}-{{ratio}}"), "flow-1", "group-1"));

        assertEquals("42|0.5|L-42-0.5", engine.evaluate("{{level}}|{{ratio}}|{{label}}", 1, variables, "flow-1", "group-1"));
        // Rendered alone, the String variable generates its dependencies itself
        assertEquals("L-42-0.5", engine.evaluate("{{label}}", 2, variables, "flow-1", "group-1"));
    }

    @Test
    public void formatValueKeepsDecimalsOutsideTheConstantPattern() {
        assertEquals("42", TemplateEngine.formatValue(42.0, true));
        assertEquals("42.0", TemplateEngine.formatValue(42.0, false));
        assertEquals("[1, \"a\"]", TemplateEngine.formatValue(List.of(1, "a"), false));
        assertEquals("null", TemplateEngine.formatValue(null, false));
    }

    @Test
    public void inheritedGenerationFollowsTheListSequenceInMessages() {
        Map<String, Object> listConfig = new HashMap<>();
        listConfig.put("selectionStrategy", "SEQUENTIAL");
        listConfig.put("items", List.of(Map.of("id", "a", "value", "A"), Map.of("id", "b", "value", "B")));
        variables.put("list1", new Variable("list1", "zones", "GLOBAL", "list", "", listConfig, null, null));
        Map<String, Object> stringConfig = new HashMap<>();
        stringConfig.put("pattern", "CONSTANT");
        stringConfig.put("constantValue", "none");
        stringConfig.put("sourceListVariableId", "list1");
        stringConfig.put("sourceListSelectionMode", "INHERITED_GENERATION");
        variables.put("s1", new Variable("s1", "zone", "GLOBAL", "string", "", stringConfig, null, null));

        StringBuilder sent = new StringBuilder();
        for (int n = 1; n <= 3; n++) {
            sent.append(engine.evaluate("{{zone}}", n, variables, "f1", "g1"));
        }

        assertEquals("ABA", sent.toString());
    }

    @Test
    public void multiLineJsonTemplateWritesPointsAndListsOnIndentedLines() {
        Map<String, Object> pointConfig = new HashMap<>();
        pointConfig.put("pattern", "FIXED_POINT");
        pointConfig.put("coordinateSystem", "CARTESIAN_2D");
        pointConfig.put("fixedPoint", Map.of("x", 1.5, "y", 2.0, "z", 0.0));
        pointConfig.put("minPoint", Map.of("x", 0.0, "y", 0.0, "z", 0.0));
        pointConfig.put("maxPoint", Map.of("x", 10.0, "y", 10.0, "z", 0.0));
        variables.put("p1", new Variable("p1", "puntito", "LOCAL", "point", "", pointConfig, "f1", "g1"));
        Map<String, Object> listConfig = new HashMap<>();
        listConfig.put("selectionStrategy", "FIXED_SUBSET");
        listConfig.put("items", List.of(Map.of("id", "a", "value", "A"), Map.of("id", "b", "value", "B")));
        variables.put("l1", new Variable("l1", "lista", "GROUP", "list", "", listConfig, null, "g1"));

        String template = "{\n  \"list\": {{group.lista}},\n  \"posicion\": {{local.puntito}},\n  \"n\": {{n}}\n}";
        String message = engine.evaluate(template, 7, variables, "f1", "g1", "flow", null, "json");

        assertEquals("{\n  \"list\": [\n    \"A\",\n    \"B\"\n  ],\n"
            + "  \"posicion\": {\n    \"x\": 1.5,\n    \"y\": 2.0\n  },\n  \"n\": 7\n}", message);
    }
}
