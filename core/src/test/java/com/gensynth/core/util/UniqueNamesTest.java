package com.gensynth.core.util;

import org.junit.Test;

import java.util.List;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class UniqueNamesTest {

    @Test
    public void namesAreComparedTrimmedAndIgnoringCase() {
        assertTrue(UniqueNames.sameName("Sensor", " sensor "));
        assertFalse(UniqueNames.sameName("Sensor", "Sensor 2"));
        assertFalse(UniqueNames.sameName(null, "Sensor"));
    }

    @Test
    public void freeNameIsKept() {
        assertEquals("Sensor", UniqueNames.makeUnique(" Sensor ", List.of("Other")));
    }

    @Test
    public void takenNameGetsTheFirstFreeSuffix() {
        assertEquals("Sensor (2)", UniqueNames.makeUnique("Sensor", List.of("sensor")));
        assertEquals("Sensor (4)", UniqueNames.makeUnique("Sensor", List.of("Sensor", "Sensor (2)", "SENSOR (3)")));
        assertEquals("Sensor (Clone 1) (2)", UniqueNames.makeUnique("Sensor (Clone 1)", List.of("Sensor", "Sensor (Clone 1)")));
    }

    @Test
    public void duplicatesListsRepeatedNames() {
        assertEquals(Set.of("a"), UniqueNames.duplicates(List.of("A", "b", "a")));
        assertTrue(UniqueNames.duplicates(List.of("A", "B")).isEmpty());
    }
}
