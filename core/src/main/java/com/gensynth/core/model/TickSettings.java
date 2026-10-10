package com.gensynth.core.model;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

/**
 * Immutable configuration of the global simulation tick clock.
 *
 * A tick is the time unit that drives message generation: on every tick each running,
 * enabled flow publishes its burst. The clock either ticks at a fixed period
 * ({@link Mode#FIXED_RATE}, defined by {@code value} + {@code unit}) or as fast as the
 * machine allows ({@link Mode#AS_FAST_AS_POSSIBLE}). The period is kept in AFAP mode so
 * switching back to a fixed rate restores the previous value.
 */
public final class TickSettings {

    /** Tick clock modes. */
    public enum Mode {
        /** Ticks are emitted at a fixed period. */
        FIXED_RATE,
        /** Ticks are emitted back to back, without waiting between them. */
        AS_FAST_AS_POSSIBLE
    }

    /** Units accepted for the tick period. */
    public enum Unit {
        MILLISECONDS,
        SECONDS,
        MINUTES
    }

    /** Longest accepted tick period (24 hours), in nanoseconds. */
    public static final long MAX_PERIOD_NANOS = TimeUnit.HOURS.toNanos(24);

    private final Mode mode;
    private final long value;
    private final Unit unit;

    /**
     * Creates tick settings after validating them.
     *
     * @param mode  clock mode
     * @param value period value, at least 1
     * @param unit  period unit
     * @throws IllegalArgumentException if the values are out of range
     */
    public TickSettings(Mode mode, long value, Unit unit) {
        this.mode = Objects.requireNonNull(mode, "mode cannot be null");
        this.unit = Objects.requireNonNull(unit, "unit cannot be null");
        if (value < 1) {
            throw new IllegalArgumentException("Tick period value must be at least 1");
        }
        if (toTimeUnit(unit).toNanos(value) > MAX_PERIOD_NANOS) {
            throw new IllegalArgumentException("Tick period cannot exceed 24 hours");
        }
        this.value = value;
    }

    /**
     * Returns the default settings: one tick per second.
     *
     * @return default tick settings
     */
    public static TickSettings defaults() {
        return new TickSettings(Mode.FIXED_RATE, 1, Unit.SECONDS);
    }

    /**
     * Parses tick settings from a bridge or file payload. Parsing is strict: any missing or
     * invalid field is rejected.
     *
     * @param payload map with {@code mode}, {@code value} and {@code unit}
     * @return the parsed settings
     * @throws IllegalArgumentException if the payload is missing or invalid
     */
    public static TickSettings fromPayload(Map<String, Object> payload) {
        if (payload == null) {
            throw new IllegalArgumentException("Tick settings are required");
        }
        Mode mode = parseEnum(Mode.class, payload.get("mode"), "mode");
        Unit unit = parseEnum(Unit.class, payload.get("unit"), "unit");
        Object rawValue = payload.get("value");
        if (!(rawValue instanceof Integer || rawValue instanceof Long)) {
            throw new IllegalArgumentException("Tick 'value' must be an integer");
        }
        return new TickSettings(mode, ((Number) rawValue).longValue(), unit);
    }

    private static <E extends Enum<E>> E parseEnum(Class<E> type, Object raw, String field) {
        if (!(raw instanceof String text)) {
            throw new IllegalArgumentException("Tick '" + field + "' must be a string");
        }
        try {
            return Enum.valueOf(type, text.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown tick " + field + ": " + text, e);
        }
    }

    private static TimeUnit toTimeUnit(Unit unit) {
        return TimeUnit.valueOf(unit.name());
    }

    /**
     * Serializes the settings for the bridge and project files.
     *
     * @return map with {@code mode}, {@code value} and {@code unit}
     */
    public Map<String, Object> toPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("mode", mode.name());
        payload.put("value", value);
        payload.put("unit", unit.name());
        return payload;
    }

    /**
     * Returns the configured tick period in nanoseconds (ignored in AFAP mode).
     *
     * @return period in nanoseconds
     */
    public long periodNanos() {
        return toTimeUnit(unit).toNanos(value);
    }

    /**
     * Returns a short human-readable description, used in logs.
     *
     * @return description such as "1 SECONDS" or "AS_FAST_AS_POSSIBLE"
     */
    public String describe() {
        return mode == Mode.AS_FAST_AS_POSSIBLE ? mode.name() : value + " " + unit.name();
    }

    /**
     * @return the clock mode
     */
    public Mode getMode() {
        return mode;
    }

    /**
     * @return the period value
     */
    public long getValue() {
        return value;
    }

    /**
     * @return the period unit
     */
    public Unit getUnit() {
        return unit;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof TickSettings that)) return false;
        return value == that.value && mode == that.mode && unit == that.unit;
    }

    @Override
    public int hashCode() {
        return Objects.hash(mode, value, unit);
    }

    @Override
    public String toString() {
        return "TickSettings{" + describe() + "}";
    }
}
