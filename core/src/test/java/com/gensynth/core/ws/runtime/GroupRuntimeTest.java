package com.gensynth.core.ws.runtime;

import org.junit.Test;

import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

public class GroupRuntimeTest {

    private static FlowRuntime flow(String id) {
        return new FlowRuntime(id, id, "file", "stopped", 0, 0, false, null,
            1000, 1, "t", "localhost", 0, "{}", "json", true, Map.of());
    }

    private static GroupRuntime group(String... flowIds) {
        GroupRuntime group = new GroupRuntime("g", "G", "stopped", "", 1, "sequential", true);
        for (String id : flowIds) {
            group.flows.add(flow(id));
        }
        return group;
    }

    private static List<String> ids(GroupRuntime group) {
        return group.flows.stream().map(flow -> flow.id).toList();
    }

    @Test
    public void reorderFlowsAppliesTheGivenOrder() {
        GroupRuntime group = group("A", "B", "C");

        assertTrue(group.reorderFlows(List.of("C", "A", "B")));

        assertEquals(List.of("C", "A", "B"), ids(group));
        assertFalse("The same order is not a change", group.reorderFlows(List.of("C", "A", "B")));
    }

    @Test
    public void flowsMissingFromTheListKeepTheirOrderAfterTheListedOnes() {
        GroupRuntime group = group("A", "B", "C", "D");

        group.reorderFlows(List.of("D", "B"));

        assertEquals(List.of("D", "B", "A", "C"), ids(group));
    }

    @Test
    public void unknownAndRepeatedIdsAreIgnored() {
        GroupRuntime group = group("A", "B", "C");

        group.reorderFlows(List.of("X", "B", "B", "A"));

        assertEquals(List.of("B", "A", "C"), ids(group));
    }

    @Test
    public void orderAndSequentialOrderSurviveTheDefinition() {
        GroupRuntime group = group("A", "B", "C");
        group.sequentialOrder = "generated";
        group.reorderFlows(List.of("B", "C", "A"));

        GroupRuntime copy = GroupRuntime.fromDefinition(group.toDefinition());

        assertEquals(List.of("B", "C", "A"), ids(copy));
        assertEquals("generated", copy.sequentialOrder);
        assertEquals("generated", copy.toPayload().get("sequentialOrder"));
    }
}
