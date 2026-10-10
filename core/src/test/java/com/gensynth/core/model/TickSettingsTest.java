package com.gensynth.core.model;

import org.junit.Test;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.*;

public class TickSettingsTest {

    private static Map<String, Object> payload(Object mode, Object value, Object unit) {
        Map<String, Object> map = new HashMap<>();
        map.put("mode", mode);
        map.put("value", value);
        map.put("unit", unit);
        return map;
    }

    @Test
    public void defaultsAreOneTickPerSecond() {
        TickSettings defaults = TickSettings.defaults();
        assertEquals(TickSettings.Mode.FIXED_RATE, defaults.getMode());
        assertEquals(1, defaults.getValue());
        assertEquals(TickSettings.Unit.SECONDS, defaults.getUnit());
        assertEquals(TimeUnit.SECONDS.toNanos(1), defaults.periodNanos());
    }

    @Test
    public void periodNanosHonoursEachUnit() {
        assertEquals(TimeUnit.MILLISECONDS.toNanos(250),
            new TickSettings(TickSettings.Mode.FIXED_RATE, 250, TickSettings.Unit.MILLISECONDS).periodNanos());
        assertEquals(TimeUnit.SECONDS.toNanos(5),
            new TickSettings(TickSettings.Mode.FIXED_RATE, 5, TickSettings.Unit.SECONDS).periodNanos());
        assertEquals(TimeUnit.MINUTES.toNanos(2),
            new TickSettings(TickSettings.Mode.FIXED_RATE, 2, TickSettings.Unit.MINUTES).periodNanos());
    }

    @Test
    public void payloadRoundTrip() {
        TickSettings original = new TickSettings(TickSettings.Mode.AS_FAST_AS_POSSIBLE, 100, TickSettings.Unit.MILLISECONDS);
        Map<String, Object> serialized = original.toPayload();
        assertEquals("AS_FAST_AS_POSSIBLE", serialized.get("mode"));
        assertEquals("MILLISECONDS", serialized.get("unit"));
        assertEquals(original, TickSettings.fromPayload(serialized));
    }

    @Test
    public void fromPayloadAcceptsIntegerAndLongValues() {
        assertEquals(10, TickSettings.fromPayload(payload("FIXED_RATE", 10, "SECONDS")).getValue());
        assertEquals(10, TickSettings.fromPayload(payload("FIXED_RATE", 10L, "SECONDS")).getValue());
    }

    @Test
    public void fromPayloadRejectsInvalidValues() {
        assertThrows(IllegalArgumentException.class, () -> TickSettings.fromPayload(null));
        assertThrows(IllegalArgumentException.class, () -> TickSettings.fromPayload(payload("FIXED_RATE", 0, "SECONDS")));
        assertThrows(IllegalArgumentException.class, () -> TickSettings.fromPayload(payload("FIXED_RATE", -5, "SECONDS")));
        assertThrows(IllegalArgumentException.class, () -> TickSettings.fromPayload(payload("FIXED_RATE", 1.5, "SECONDS")));
        assertThrows(IllegalArgumentException.class, () -> TickSettings.fromPayload(payload("FIXED_RATE", "1", "SECONDS")));
        assertThrows(IllegalArgumentException.class, () -> TickSettings.fromPayload(payload("SOMETIMES", 1, "SECONDS")));
        assertThrows(IllegalArgumentException.class, () -> TickSettings.fromPayload(payload("FIXED_RATE", 1, "HOURS")));
        assertThrows(IllegalArgumentException.class, () -> TickSettings.fromPayload(payload(null, 1, "SECONDS")));
    }

    @Test
    public void periodCannotExceedOneDay() {
        assertNotNull(new TickSettings(TickSettings.Mode.FIXED_RATE, 1440, TickSettings.Unit.MINUTES));
        assertThrows(IllegalArgumentException.class,
            () -> new TickSettings(TickSettings.Mode.FIXED_RATE, 1441, TickSettings.Unit.MINUTES));
    }

    @Test
    public void projectSettingsFallBackToDefaultsWhenMissingOrInvalid() {
        assertEquals(ProjectSettings.defaults(), ProjectSettings.fromPayload(null));
        assertEquals(ProjectSettings.defaults(), ProjectSettings.fromPayload("garbage"));
        assertEquals(ProjectSettings.defaults(), ProjectSettings.fromPayload(Map.of("other", 1)));
        assertEquals(ProjectSettings.defaults(), ProjectSettings.fromPayload(Map.of("tick", payload("FIXED_RATE", 0, "SECONDS"))));
    }

    @Test
    public void projectSettingsRoundTrip() {
        ProjectSettings settings = new ProjectSettings(
            new TickSettings(TickSettings.Mode.FIXED_RATE, 3, TickSettings.Unit.MINUTES));
        assertEquals(settings, ProjectSettings.fromPayload(settings.toPayload()));
    }
}
