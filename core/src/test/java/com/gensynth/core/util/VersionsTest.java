package com.gensynth.core.util;

import org.junit.Test;

import static org.junit.Assert.*;

public class VersionsTest {

    @Test
    public void comparesPartsAsNumbers() {
        assertTrue(Versions.compare("0.5.10", "0.5.9") > 0);
        assertTrue(Versions.compare("1.0", "0.9.9") > 0);
        assertEquals(0, Versions.compare("1.2.0", "1.2.0"));
        assertTrue(Versions.compare("1.2", "1.2.0") < 0);
    }

    @Test
    public void aReleaseIsNewerOnlyIfItsNumberIsHigher() {
        assertTrue(Versions.isNewer("v0.5.3", "0.5.2"));
        assertTrue(Versions.isNewer("0.5.10", "0.5.9"));
        assertFalse(Versions.isNewer("v0.5.2", "0.5.2"));
        assertFalse(Versions.isNewer("0.5.1", "0.5.2"));
        assertFalse("Suffixes are ignored", Versions.isNewer("0.5.2-rc1", "0.5.2"));
        assertFalse(Versions.isNewer("0.5.2+build7", "0.5.2"));
    }

    @Test
    public void readsTheVersionOfThisBuild() {
        String version = Versions.current();
        assertNotNull("gensynth-version.properties is filtered by Maven", version);
        assertTrue(version, version.matches("\\d+\\.\\d+\\.\\d+.*"));
    }
}
