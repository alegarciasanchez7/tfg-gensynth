package com.gensynth.core.cli;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

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
    public void durationUsesHoursMinutesAndSeconds() {
        assertEquals("00:00:00", CliFormat.duration(0));
        assertEquals("00:00:00", CliFormat.duration(-5));
        assertEquals("01:01:05", CliFormat.duration(3_665_000));
    }
}
