package com.gensynth.core.connectors.plugin;

import org.junit.Test;

import java.time.Instant;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

public class InstalledPluginInfoTest {

    private static final Instant INSTALLED = Instant.parse("2026-01-02T03:04:05Z");

    @Test
    public void keepsTheMetadataOfAPlugin() {
        InstalledPluginInfo info = new InstalledPluginInfo("mqtt", "MQTT", "1.0.0", "mqtt-1.0.0.jar", INSTALLED, true);

        assertEquals("mqtt", info.pluginId());
        assertEquals("MQTT", info.displayName());
        assertEquals("1.0.0", info.pluginVersion());
        assertEquals("mqtt-1.0.0.jar", info.fileName());
        assertEquals(INSTALLED, info.installedAt());
        assertTrue(info.external());
    }

    @Test
    public void requiresEveryValueButExternal() {
        assertThrows(NullPointerException.class, () -> new InstalledPluginInfo(null, "n", "v", "f", INSTALLED, false));
        assertThrows(NullPointerException.class, () -> new InstalledPluginInfo("i", null, "v", "f", INSTALLED, false));
        assertThrows(NullPointerException.class, () -> new InstalledPluginInfo("i", "n", null, "f", INSTALLED, false));
        assertThrows(NullPointerException.class, () -> new InstalledPluginInfo("i", "n", "v", null, INSTALLED, false));
        assertThrows(NullPointerException.class, () -> new InstalledPluginInfo("i", "n", "v", "f", null, false));
    }
}
