package com.gensynth.core.flow.variables;

import com.gensynth.core.flow.variables.config.ListVariableConfig;
import org.junit.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

/**
 * Conditional rules (which rule matches and what it overrides) and the values a variable takes
 * from a source list.
 */
public class VariableConfigurationRulesTest {

    /** Minimal configuration: only the behaviour of the base class is under test. */
    private static final class PlainConfig extends VariableConfiguration {
        PlainConfig(String id) {
            identifier(id);
        }

        @Override
        public Object generateNextValue() {
            return null;
        }

        @Override
        public void reset() {
            // nothing to reset
        }

        @Override
        public Map<String, Object> toMap() {
            return new HashMap<>();
        }

        @Override
        public List<String> validate() {
            return new ArrayList<>();
        }
    }

    private static VariableConfiguration.ConditionalRule rule(String target, String condition, Object value,
                                                              Map<String, Object> overrides) {
        VariableConfiguration.ConditionalRule rule = new VariableConfiguration.ConditionalRule();
        rule.targetVariable = target;
        rule.condition = condition;
        rule.value = value;
        rule.overrides = overrides;
        return rule;
    }

    /** Whether a single rule {@code t <condition> value} matches when t has the given context value. */
    private static boolean matches(Object contextValue, String condition, Object ruleValue) {
        PlainConfig config = new PlainConfig("v");
        config.setConditionalRules(List.of(rule("t", condition, ruleValue, null)));
        Map<String, Object> context = new HashMap<>();
        context.put("t", contextValue);
        config.setContext(context);
        return config.hasActiveOverride;
    }

    // ---------------------------------------------------------------- conditions

    @Test
    public void numbersAreComparedAsNumbersAndTheRestAsText() {
        assertTrue(matches("5", "EQUALS", 5.0));
        assertTrue(matches("abc", "equals", "abc"));
        assertFalse(matches("abc", "EQUALS", "abd"));
        assertTrue(matches(4, "NOT_EQUALS", 5));
        assertFalse(matches("abc", "NOT_EQUALS", "abc"));
        assertTrue(matches(10, "GREATER_THAN", 9));
        assertFalse(matches(9, "GREATER_THAN", 10));
        assertTrue(matches("b", "GREATER_THAN", "a"));
        assertTrue(matches(9, "LESS_THAN", 10));
        assertFalse(matches(10, "LESS_THAN", 9));
        assertTrue(matches("a", "LESS_THAN", "b"));
        assertFalse(matches("b", "LESS_THAN", "a"));
        assertTrue(matches("hello world", "CONTAINS", "world"));
    }

    @Test
    public void missingOperatorMeansEqualsAndUnknownOperatorsNeverMatch() {
        assertTrue(matches(3, null, 3));
        assertFalse(matches(3, "BETWEEN", 3));
        assertFalse(matches(3, "EQUALS", null));
    }

    // ---------------------------------------------------------------- overrides

    private static PlainConfig matchedWith(Map<String, Object> overrides) {
        PlainConfig config = new PlainConfig("v");
        config.setConditionalRules(List.of(rule("t", "EQUALS", 1, overrides)));
        config.setContext(Map.of("t", 1));
        return config;
    }

    @Test
    public void singleValueOverridesFollowTheirKeyPriority() {
        Map<String, Object> all = new LinkedHashMap<>();
        all.put("other", "o");
        all.put("value", "val");
        all.put("constantValue", "c");
        all.put("v", "own");
        assertEquals("own", matchedWith(all).activeOverrideValue);

        all.remove("v");
        assertEquals("c", matchedWith(all).activeOverrideValue);

        all.remove("constantValue");
        assertEquals("val", matchedWith(all).activeOverrideValue);

        all.remove("value");
        PlainConfig firstValue = matchedWith(all);
        assertEquals("o", firstValue.activeOverrideValue);
        assertTrue(firstValue.hasActiveOverride);
        assertNull(firstValue.getActiveOverrideConfig());
    }

    @Test
    public void generatorConfigOverridesReplaceTheWholeGenerator() {
        Map<String, Object> generator = Map.of("pattern", "CONSTANT", "constantValue", 4);

        PlainConfig config = matchedWith(generator);

        assertTrue(config.hasActiveOverride);
        assertSame(generator, config.getActiveOverrideConfig());
        assertNull(config.activeOverrideValue);
    }

    @Test
    public void ruleWithoutOverridesUsesItsValue() {
        assertEquals(1, matchedWith(new HashMap<>()).activeOverrideValue);
        assertEquals(1, matchedWith(null).activeOverrideValue);
    }

    @Test
    public void firstMatchingRuleWinsAndNoMatchClearsTheOverride() {
        PlainConfig config = new PlainConfig("v");
        config.setConditionalRules(List.of(
            rule(null, "EQUALS", 1, Map.of("value", "no target")),
            rule("", "EQUALS", 1, Map.of("value", "empty target")),
            rule("missing", "EQUALS", 1, Map.of("value", "not in context")),
            rule("t", "EQUALS", 1, Map.of("value", "first")),
            rule("t", "EQUALS", 1, Map.of("value", "second"))));

        config.setContext(Map.of("t", 1));
        assertEquals("first", config.activeOverrideValue);

        config.setContext(Map.of("t", 2));
        assertFalse(config.hasActiveOverride);
        assertNull(config.activeOverrideValue);
        assertNull(config.getActiveOverrideConfig());
    }

    @Test
    public void noRulesMeansNoOverride() {
        PlainConfig config = matchedWith(Map.of("pattern", "CONSTANT"));
        config.setConditionalRules(null);

        config.setContext(Map.of("t", 1));

        assertFalse(config.hasActiveOverride);
        assertNull(config.getActiveOverrideConfig());
    }

    // ---------------------------------------------------------------- source list

    private static ListVariableConfig listOf(String... ids) {
        List<ListVariableConfig.ListItem> items = new ArrayList<>();
        for (String id : ids) {
            items.add(new ListVariableConfig.ListItem(id, "value-" + id, 1.0));
        }
        return VariableFactory.createList("list").items(items);
    }

    @Test
    public void withoutASourceListThereIsNoReferenceValue() {
        PlainConfig config = new PlainConfig("v");
        assertNull(config.resolveListReferenceValue());

        config.setSourceListVariableId("  ");
        assertNull(config.resolveListReferenceValue());
    }

    @Test
    public void fixedItemModeGivesTheSelectedItem() {
        PlainConfig config = new PlainConfig("v");
        config.setSourceListVariableId(" list ");
        config.setSourceListSelectionMode("FIXED_ITEM");
        config.setSelectedListItemId("b");
        config.setContext(Map.of("list_config", new ConfigurableVariable(listOf("a", "b"))));

        assertEquals("value-b", config.resolveListReferenceValue());
    }

    @Test
    public void unknownFixedItemFallsBackToARandomItem() {
        PlainConfig config = new PlainConfig("v");
        config.setSourceListVariableId("list");
        config.setSourceListSelectionMode("FIXED_ITEM");
        config.setSelectedListItemId("gone");
        config.setContext(Map.of("list", listOf("a")));

        assertEquals("value-a", config.resolveListReferenceValue());
    }

    @Test
    public void sourceThatIsNotAListGivesItsContextValue() {
        PlainConfig config = new PlainConfig("v");
        config.setSourceListVariableId("src");

        config.setContext(Map.of("src", "plain value"));
        assertEquals("plain value", config.resolveListReferenceValue());

        ConfigurableVariable numeric = new ConfigurableVariable(VariableFactory.createNumeric("src"));
        config.setContext(Map.of("src", numeric));
        assertSame(numeric, config.resolveListReferenceValue());

        ListVariableConfig empty = VariableFactory.createList("src");
        config.setContext(Map.of("src", empty));
        assertSame(empty, config.resolveListReferenceValue());
    }
}
