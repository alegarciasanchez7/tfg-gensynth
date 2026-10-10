package com.gensynth.core.model;

import org.junit.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

public class GroupFlowDefinitionTest {

    @Test
    public void outputModeIsStrictForCommandsAndLenientForFiles() {
        assertTrue(OutputMode.isValid("parallel"));
        assertTrue(OutputMode.isValid("Sequential"));
        assertFalse(OutputMode.isValid("serial"));
        assertFalse(OutputMode.isValid("round-robin"));
        assertFalse(OutputMode.isValid(null));

        assertEquals(OutputMode.SEQUENTIAL, OutputMode.fromValue(" SEQUENTIAL "));
        assertEquals(OutputMode.PARALLEL, OutputMode.fromValue("serial"));
        assertEquals(OutputMode.PARALLEL, OutputMode.fromValue("TEXT"));
        assertEquals(OutputMode.PARALLEL, OutputMode.fromValue("round-robin"));
        assertEquals(OutputMode.PARALLEL, OutputMode.fromValue(null));
    }

    @Test
    public void groupWithoutLegacyFieldsLoadsWithDefaults() {
        Map<String, Object> payload = new HashMap<>();
        payload.put("id", "g1");
        payload.put("name", "Group");

        GroupDefinition group = GroupDefinition.fromPayload(payload);

        assertEquals(1, group.getThreads());
        assertEquals("parallel", group.getOutputMode());
    }

    @Test
    public void legacyOutputModesAreNormalized() {
        assertEquals("parallel", new GroupDefinition("g", "G", "", 1, "serial").getOutputMode());
        assertEquals("sequential", new GroupDefinition("g", "G", "", 1, "sequential").getOutputMode());
    }

    @Test
    public void flowOrderAndEveryTicksSurviveARoundTrip() {
        GroupDefinition group = new GroupDefinition("g", "G", "", 1, "sequential");
        List<String> ids = List.of("z", "a", "m", "b", "y");
        for (String id : ids) {
            FlowDefinition flow = new FlowDefinition(id, "g", "Flow " + id, "file", "localhost", 0, "t",
                1000, 1, "{}", "json", "file", Map.of());
            flow.setEveryTicks(id.equals("m") ? 4 : 1);
            group.addFlow(flow);
        }

        GroupDefinition loaded = GroupDefinition.fromPayload(group.toPayload());

        assertEquals(ids, new ArrayList<>(loaded.getAllFlows().keySet()));
        assertEquals(4, loaded.getFlow("m").getEveryTicks());
        assertEquals(1, loaded.getFlow("z").getEveryTicks());
        assertEquals("sequential", loaded.getOutputMode());
    }

    @Test
    public void flowWithoutEveryTicksDefaultsToOne() {
        Map<String, Object> payload = new HashMap<>();
        payload.put("id", "f");
        payload.put("groupId", "g");
        assertEquals(1, FlowDefinition.fromPayload(payload).getEveryTicks());

        payload.put("everyTicks", 0);
        assertEquals("values below 1 are clamped", 1, FlowDefinition.fromPayload(payload).getEveryTicks());
    }
}
