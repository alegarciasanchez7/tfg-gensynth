package com.gensynth.core.config;

import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * The command line edition is detected from its launcher property, or from a classpath without
 * the embedded browser.
 */
public class AppEditionTest {

    @Test
    public void theFullApplicationIsNotTheCliEdition() {
        assertFalse(AppEdition.isCliOnly(Map.<String, String>of()::get, className -> true));
        assertFalse(AppEdition.isCliOnly(Map.of(AppEdition.EDITION_PROPERTY, "full")::get, className -> true));
    }

    @Test
    public void theLauncherPropertyMarksTheCliEdition() {
        assertTrue(AppEdition.isCliOnly(Map.of(AppEdition.EDITION_PROPERTY, "cli")::get, className -> true));
        assertTrue(AppEdition.isCliOnly(Map.of(AppEdition.EDITION_PROPERTY, " CLI ")::get, className -> true));
    }

    @Test
    public void withoutTheEmbeddedBrowserOnlyTheCommandLineCanRun() {
        assertTrue(AppEdition.isCliOnly(Map.<String, String>of()::get,
            className -> !AppEdition.BROWSER_CLASS.equals(className)));
    }

    @Test
    public void theTestClasspathHasTheEmbeddedBrowser() {
        // The core is built with JCEF, so from source the desktop is available
        assertFalse(AppEdition.isCliOnly(Map.<String, String>of()::get,
            className -> {
                try {
                    Class.forName(className, false, getClass().getClassLoader());
                    return true;
                } catch (ClassNotFoundException e) {
                    return false;
                }
            }));
    }
}
