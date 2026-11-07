package com.gensynth.core.util;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class NamingPatternTest {

    @Test
    public void replacesNameAndIndex() {
        assertEquals("Sensor (Clone 2)", NamingPattern.apply("${name} (Clone ${index})", "Sensor", 2));
        assertEquals("a-3-3", NamingPattern.apply("a-${index}-${index}", "x", 3));
    }

    @Test
    public void appliesIndexOffsets() {
        assertEquals("H2", NamingPattern.apply("H${index+1}", "H1", 1));
        assertEquals("H3", NamingPattern.apply("H${index + 1}", "H1", 2));
        assertEquals("Room 0", NamingPattern.apply("Room ${index-1}", "R", 1));
    }

    @Test
    public void leavesOtherTextAlone() {
        assertEquals("${other} 1 $", NamingPattern.apply("${other} ${index} $", "n", 1));
    }
}
