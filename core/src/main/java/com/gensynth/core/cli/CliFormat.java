package com.gensynth.core.cli;

import com.gensynth.core.model.TickSettings;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Number formats of the command line, the same ones the desktop application shows
 * ({@code metricsFormat.ts} and the resource bar).
 */
final class CliFormat {

    private static final String[] BYTE_UNITS = {"B/s", "KB/s", "MB/s", "GB/s"};
    private static final Pattern TICK_PERIOD = Pattern.compile("(\\d+)\\s*(ms|s|m|min)");

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

    /**
     * @param tick tick settings
     * @return the tick as typed in the {@code tick} command: {@code 500 ms}, {@code 2 s},
     *         {@code 1 min} or {@code as fast as possible}
     */
    static String tick(TickSettings tick) {
        if (tick.getMode() == TickSettings.Mode.AS_FAST_AS_POSSIBLE) {
            return "as fast as possible";
        }
        String unit = switch (tick.getUnit()) {
            case MILLISECONDS -> "ms";
            case SECONDS -> "s";
            case MINUTES -> "min";
        };
        return tick.getValue() + " " + unit;
    }

    /**
     * Reads the tick typed in the {@code tick} command: a period ({@code 500ms}, {@code 2s},
     * {@code 1m} or {@code 1min}) or {@code fast}, which keeps the current period so a later
     * change back to a fixed rate starts from it.
     *
     * @param text    the value typed
     * @param current tick settings now in use
     * @return the new tick settings
     * @throws IllegalArgumentException if the text is not a valid tick, or the period is out of
     *                                  range (at least 1, at most 24 hours)
     */
    static TickSettings parseTick(String text, TickSettings current) {
        String value = text.trim().toLowerCase(Locale.ROOT);
        if (value.equals("fast")) {
            return new TickSettings(TickSettings.Mode.AS_FAST_AS_POSSIBLE, current.getValue(), current.getUnit());
        }
        Matcher matcher = TICK_PERIOD.matcher(value);
        if (!matcher.matches()) {
            throw new IllegalArgumentException("Invalid tick '" + text + "': use a period such as 500ms, 2s or 1m, or 'fast'");
        }
        long period;
        try {
            period = Long.parseLong(matcher.group(1));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Tick period cannot exceed 24 hours");
        }
        TickSettings.Unit unit = switch (matcher.group(2)) {
            case "ms" -> TickSettings.Unit.MILLISECONDS;
            case "s" -> TickSettings.Unit.SECONDS;
            default -> TickSettings.Unit.MINUTES;
        };
        return new TickSettings(TickSettings.Mode.FIXED_RATE, period, unit);
    }

    private static String fixed(double value, int decimals) {
        return String.format(Locale.ROOT, "%." + decimals + "f", value);
    }
}
