package com.gensynth.core.flow;

import com.gensynth.core.model.Variable;
import org.junit.Before;
import org.junit.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

/**
 * GROUP and GLOBAL variables give one value per tick, the same for every flow that renders a
 * message on that tick; LOCAL variables keep giving a new value on every message.
 */
public class SharedVariablesPerTickTest {

    private static final Map<String, Object> COUNTER = Map.of("pattern", "SEQUENTIAL", "min", 0, "max", 1000,
            "precision", "INTEGER", "sequentialGraph", List.of(Map.of("x", 0, "y", 0), Map.of("x", 1000, "y", 1000)));

    private TemplateEngine engine;
    private Map<String, Variable> variables;

    @Before
    public void setUp() {
        engine = new TemplateEngine();
        variables = new HashMap<>();
    }

    private String render(String template, String flowId, String groupId, long tick) {
        return engine.evaluate(template, tick, variables,
                new TemplateEngine.RenderTarget(flowId, groupId, flowId, null), null, tick);
    }

    private long number(String template, String flowId, String groupId, long tick) {
        return Long.parseLong(render(template, flowId, groupId, tick));
    }

    @Test
    public void groupVariableGivesEveryFlowOfTheGroupTheSameValueOnATick() {
        variables.put("c", new Variable("c", "counter", "GROUP", "numeric", 0, COUNTER, null, "g1"));

        long first = number("{{counter}}", "f1", "g1", 1);
        assertEquals(first, number("{{counter}}", "f2", "g1", 1));
        assertEquals(first, number("{{counter}}", "f3", "g1", 1));

        // One step per tick, however many flows use it
        long second = number("{{counter}}", "f1", "g1", 2);
        assertEquals(first + 1, second);
        assertEquals(second, number("{{counter}}", "f2", "g1", 2));
        assertEquals(second, number("{{counter}}", "f3", "g1", 2));
    }

    @Test
    public void globalVariableGivesTheSameValueToFlowsOfEveryGroup() {
        variables.put("c", new Variable("c", "counter", "GLOBAL", "numeric", 0, COUNTER, null, null));

        long first = number("{{counter}}", "f1", "g1", 1);
        assertEquals(first, number("{{counter}}", "f2", "g2", 1));
        assertEquals(first + 1, number("{{counter}}", "f2", "g2", 2));
        assertEquals(first + 1, number("{{counter}}", "f1", "g1", 2));
    }

    @Test
    public void localVariableStillGivesANewValueOnEveryMessage() {
        variables.put("c", new Variable("c", "counter", "LOCAL", "numeric", 0, COUNTER, "f1", "g1"));

        long first = number("{{counter}}", "f1", "g1", 1);
        assertEquals(first + 1, number("{{counter}}", "f1", "g1", 1));
    }

    @Test
    public void aFlowThatLagsBehindTheClockGetsTheLatestValue() {
        variables.put("c", new Variable("c", "counter", "GROUP", "numeric", 0, COUNTER, null, "g1"));

        long first = number("{{counter}}", "f1", "g1", 1);
        long second = number("{{counter}}", "f1", "g1", 2);
        assertEquals(first + 1, second);
        // A worker still generating tick 1 does not move the variable back or forward
        assertEquals(second, number("{{counter}}", "f2", "g1", 1));
        assertEquals(second + 1, number("{{counter}}", "f2", "g1", 3));
    }

    @Test
    public void withoutATickEveryCallGivesANewValue() {
        variables.put("c", new Variable("c", "counter", "GROUP", "numeric", 0, COUNTER, null, "g1"));

        long first = Long.parseLong(engine.evaluate("{{counter}}", 1, variables, "f1", "g1"));
        assertEquals(first + 1, Long.parseLong(engine.evaluate("{{counter}}", 2, variables, "f2", "g1")));
    }

    @Test
    public void groupFormulaReadsTheGlobalValueOfTheSameTick() {
        variables.put("b", new Variable("b", "base", "GLOBAL", "numeric", 0, COUNTER, null, null));
        variables.put("d", new Variable("d", "doubled", "GROUP", "numeric", 0,
                Map.of("pattern", "FORMULA", "formula", "{{base}}*2", "precision", "INTEGER"), null, "g1"));

        String[] f1 = render("{{doubled}}|{{base}}", "f1", "g1", 1).split("\\|");
        String[] f2 = render("{{doubled}}|{{base}}", "f2", "g1", 1).split("\\|");

        assertEquals(Long.parseLong(f1[1]) * 2, Long.parseLong(f1[0]));
        assertEquals(f1[0], f2[0]);
        assertEquals(f1[1], f2[1]);
    }

    @Test
    public void aLocalVariableWithTheSameNameDoesNotChangeTheSharedValue() {
        variables.put("gb", new Variable("gb", "base", "GLOBAL", "numeric", 0,
                Map.of("pattern", "CONSTANT", "constantValue", 5), null, null));
        variables.put("lb", new Variable("lb", "base", "LOCAL", "numeric", 0,
                Map.of("pattern", "CONSTANT", "constantValue", 100), "f1", "g1"));
        variables.put("d", new Variable("d", "doubled", "GROUP", "numeric", 0,
                Map.of("pattern", "FORMULA", "formula", "{{base}}*2", "precision", "INTEGER"), null, "g1"));

        // The flow reads its own LOCAL base, but the GROUP formula reads the GLOBAL one
        assertEquals("10|100", render("{{doubled}}|{{base}}", "f1", "g1", 1));
        assertEquals("10", render("{{doubled}}", "f2", "g1", 1));
    }

    @Test
    public void subPropertiesOfASharedTemporalReadTheInstantOfTheTick() {
        variables.put("t", new Variable("t", "eventTime", "GROUP", "temporal", "", Map.of(
                "timeAdvanceMode", "SIMULATED_STEP", "startDate", "2025-06-01T08:00:00Z", "incrementMs", 4000,
                "dateFormat", "yyyy-MM-dd'T'HH:mm:ss.SSSZ", "timeZone", "UTC"), null, "g1"));

        String template = "{{eventTime}}|{{eventTime.timestamp}}";
        String first = render(template, "f1", "g1", 1);
        assertEquals("2025-06-01T08:00:00.000+0000|1748764800000", first);
        assertEquals(first, render(template, "f2", "g1", 1));
        assertEquals("1748764804000", render("{{eventTime.timestamp}}", "f2", "g1", 2));
    }

    /** Two GROUP formulas that read each other, as an edit can leave them while running. */
    private void addSharedCycle() {
        variables.put("b", new Variable("b", "b", "GROUP", "numeric", 0,
                Map.of("pattern", "FORMULA", "formula", "{{c}} + 1", "precision", "INTEGER"), null, "g1"));
        variables.put("c", new Variable("c", "c", "GROUP", "numeric", 0,
                Map.of("pattern", "FORMULA", "formula", "{{b}} + 1", "precision", "INTEGER"), null, "g1"));
    }

    @Test
    public void aCycleMadeWhileRunningDoesNotOverflowTheStack() {
        addSharedCycle();

        String first = render("{{b}}|{{c}}", "f1", "g1", 1);
        assertEquals(first, render("{{b}}|{{c}}", "f2", "g1", 1));
        render("{{c}}|{{b}}", "f1", "g1", 2);
    }

    @Test(timeout = 30_000)
    public void flowsReadingSharedVariablesInAnyOrderNeverDeadlock() throws Exception {
        addSharedCycle();
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            for (long tick = 1; tick <= 500; tick++) {
                final long t = tick;
                java.util.concurrent.Future<String> one = pool.submit(() -> render("{{b}}|{{c}}", "f1", "g1", t));
                java.util.concurrent.Future<String> two = pool.submit(() -> render("{{c}}|{{b}}", "f2", "g1", t));
                one.get(5, java.util.concurrent.TimeUnit.SECONDS);
                two.get(5, java.util.concurrent.TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    public void localListInheritingFromAGroupListStillWorks() {
        variables.put("colors", new Variable("colors", "colors", "GROUP", "list", "", Map.of(
                "selectionStrategy", "SEQUENTIAL",
                "items", List.of(Map.of("id", "i1", "value", "red", "weight", 1.0),
                        Map.of("id", "i2", "value", "blue", "weight", 1.0))), null, "g1"));
        variables.put("pick", new Variable("pick", "pick", "LOCAL", "string", "", Map.of(
                "sourceListVariableId", "colors", "sourceListSelectionMode", "FIXED_ITEM", "selectedListItemId", "i2"),
                "f1", "g1"));

        assertEquals("blue", render("{{pick}}", "f1", "g1", 1));
        String shared = render("{{colors}}", "f1", "g1", 1);
        assertEquals(shared, render("{{colors}}", "f2", "g1", 1));
        assertNotEquals(shared, render("{{colors}}", "f2", "g1", 2));
    }
}
