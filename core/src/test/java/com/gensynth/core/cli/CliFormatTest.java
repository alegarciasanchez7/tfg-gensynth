package com.gensynth.core.cli;

import com.gensynth.core.model.TickSettings;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

/**
 * The formats must match the ones of the desktop application (metricsFormat.ts and the resource bar).
 */
public class CliFormatTest {

    @Test
    public void rateMatchesTheDesktop() {
        assertEquals("0", CliFormat.rate(0));
        assertEquals("0", CliFormat.rate(Double.NaN));
        assertEquals("0.20", CliFormat.rate(0.2));
        assertEquals("1.5", CliFormat.rate(1.5));
        assertEquals("12", CliFormat.rate(12.4));
        assertEquals("1.2K", CliFormat.rate(1_234));
        assertEquals("3.4M", CliFormat.rate(3_400_000));
    }

    @Test
    public void countMatchesTheDesktop() {
        assertEquals("0", CliFormat.count(0));
        assertEquals("999", CliFormat.count(999));
        assertEquals("1.2K", CliFormat.count(1_234));
        assertEquals("3.4M", CliFormat.count(3_400_000));
    }

    @Test
    public void bytesUseTheLargestUnit() {
        assertEquals("0 B/s", CliFormat.bytes(0));
        assertEquals("512 B/s", CliFormat.bytes(512));
        assertEquals("2.1 KB/s", CliFormat.bytes(2_150));
        assertEquals("3 MB/s", CliFormat.bytes(3 * 1024 * 1024));
    }

    @Test
    public void ticksAreShownAsTheyAreTyped() {
        assertEquals("500 ms", CliFormat.tick(new TickSettings(TickSettings.Mode.FIXED_RATE, 500, TickSettings.Unit.MILLISECONDS)));
        assertEquals("2 s", CliFormat.tick(new TickSettings(TickSettings.Mode.FIXED_RATE, 2, TickSettings.Unit.SECONDS)));
        assertEquals("1 min", CliFormat.tick(new TickSettings(TickSettings.Mode.FIXED_RATE, 1, TickSettings.Unit.MINUTES)));
        assertEquals("as fast as possible", CliFormat.tick(new TickSettings(TickSettings.Mode.AS_FAST_AS_POSSIBLE, 1, TickSettings.Unit.SECONDS)));
    }

    @Test
    public void parseTickReadsPeriodsAndFast() {
        TickSettings current = new TickSettings(TickSettings.Mode.FIXED_RATE, 3, TickSettings.Unit.SECONDS);

        assertEquals("500 MILLISECONDS", CliFormat.parseTick("500ms", current).describe());
        assertEquals("2 SECONDS", CliFormat.parseTick(" 2 S ", current).describe());
        assertEquals("1 MINUTES", CliFormat.parseTick("1m", current).describe());
        assertEquals("1 MINUTES", CliFormat.parseTick("1min", current).describe());
        TickSettings fast = CliFormat.parseTick("FAST", current);
        assertEquals(TickSettings.Mode.AS_FAST_AS_POSSIBLE, fast.getMode());
        assertEquals("keeps the period to come back to", 3, fast.getValue());
    }

    @Test
    public void parseTickRejectsWhatIsNotAPeriodOrIsOutOfRange() {
        TickSettings current = TickSettings.defaults();
        for (String invalid : new String[]{"", "2x", "-1s", "1.5s", "s"}) {
            IllegalArgumentException e = assertThrows(invalid, IllegalArgumentException.class, () -> CliFormat.parseTick(invalid, current));
            assertTrue(e.getMessage(), e.getMessage().startsWith("Invalid tick"));
        }
        assertThrows(IllegalArgumentException.class, () -> CliFormat.parseTick("0ms", current));
        assertThrows(IllegalArgumentException.class, () -> CliFormat.parseTick("25h", current));
        IllegalArgumentException tooLong = assertThrows(IllegalArgumentException.class, () -> CliFormat.parseTick("1441m", current));
        assertEquals("Tick period cannot exceed 24 hours", tooLong.getMessage());
        assertThrows(IllegalArgumentException.class, () -> CliFormat.parseTick("99999999999999999999s", current));
    }

    @Test
    public void durationUsesHoursMinutesAndSeconds() {
        assertEquals("00:00:00", CliFormat.duration(0));
        assertEquals("00:00:00", CliFormat.duration(-5));
        assertEquals("01:01:05", CliFormat.duration(3_665_000));
    }
}
