package com.gensynth.core.cli;

import java.util.Locale;

/**
 * Number formats of the command line, the same ones the desktop application shows
 * ({@code metricsFormat.ts} and the resource bar).
 */
final class CliFormat {

    private static final String[] BYTE_UNITS = {"B/s", "KB/s", "MB/s", "GB/s"};

    private CliFormat() {
    }

    /**
     * Formats a rate: {@code 0}, {@code 0.20}, {@code 1.5}, {@code 12}, {@code 1.2K}, {@code 3.4M}.
     *
     * @param value events per second
     * @return the short text
     */
    static String rate(double value) {
        if (!Double.isFinite(value) || value <= 0) {
            return "0";
        }
        if (value >= 1_000_000) {
            return fixed(value / 1_000_000, 1) + "M";
        }
        if (value >= 1_000) {
            return fixed(value / 1_000, 1) + "K";
        }
        if (value >= 10) {
            return String.valueOf(Math.round(value));
        }
        return fixed(value, value >= 1 ? 1 : 2);
    }

    /**
     * Formats a counter: {@code 0}, {@code 999}, {@code 1.2K}, {@code 3.4M}.
     *
     * @param value the count
     * @return the short text
     */
    static String count(long value) {
        if (value <= 0) {
            return "0";
        }
        if (value >= 1_000_000) {
            return fixed(value / 1_000_000.0, 1) + "M";
        }
        if (value >= 1_000) {
            return fixed(value / 1_000.0, 1) + "K";
        }
        return String.valueOf(value);
    }

    /**
     * Formats a transfer rate: {@code 0 B/s}, {@code 512 B/s}, {@code 2.1 KB/s}, {@code 3 MB/s}.
     *
     * @param bytesPerSecond bytes per second
     * @return the short text
     */
    static String bytes(double bytesPerSecond) {
        if (!Double.isFinite(bytesPerSecond) || bytesPerSecond < 1) {
            return "0 B/s";
        }
        int unit = Math.min(BYTE_UNITS.length - 1, (int) (Math.log(bytesPerSecond) / Math.log(1024)));
        String value = fixed(bytesPerSecond / Math.pow(1024, unit), 1);
        if (value.endsWith(".0")) {
            value = value.substring(0, value.length() - 2);
        }
        return value + " " + BYTE_UNITS[unit];
    }

    /**
     * @param millis a duration
     * @return the duration as {@code HH:MM:SS}
     */
    static String duration(long millis) {
        long seconds = Math.max(0, millis) / 1000;
        return String.format(Locale.ROOT, "%02d:%02d:%02d", seconds / 3600, (seconds / 60) % 60, seconds % 60);
    }

    private static String fixed(double value, int decimals) {
        return String.format(Locale.ROOT, "%." + decimals + "f", value);
    }
}
