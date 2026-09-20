package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import org.junit.Before;
import org.junit.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.*;

/**
 * Exhaustive unit tests for TemporalVariableConfig.
 * Validates all combinations of output categories (DATE, TIME, TIMESTAMP),
 * time advance modes (WALL_CLOCK, SIMULATED_STEP, BACKFILL_HISTORICAL, FIXED),
 * clock drift/skew simulations (RANDOM_JITTER, CONSTANT_OFFSET, PROGRESSIVE_DRIFT),
 * custom formats, timezones, backfill strategies, and serialization.
 */
public class TemporalVariableExhaustiveGenerationTest {

    private TemporalVariableConfig config;

    @Before
    public void setUp() {
        config = new TemporalVariableConfig().identifier("exhaustive_temporal");
    }

    @Test
    public void testWallClockModeExhaustive() {
        config.timeAdvanceMode(TemporalVariableConfig.TimeAdvanceMode.WALL_CLOCK);

        Object val = config.generateNextValue();
        assertNotNull("Generated wall clock value must not be null", val);
        assertTrue("Wall clock default output should be an Instant instance", val instanceof Instant);

        // Test with custom format
        config.dateFormat("yyyy-MM-dd HH:mm:ss").timeZone("UTC");
        Object formattedVal = config.generateNextValue();
        assertTrue("Formatted output must be a String", formattedVal instanceof String);
        assertTrue("Formatted output must match year length pattern", ((String) formattedVal).length() >= 19);
    }

    @Test
    public void testSimulatedStepModeExhaustive() {
        Instant start = Instant.parse("2026-01-01T00:00:00Z");
        config.timeAdvanceMode(TemporalVariableConfig.TimeAdvanceMode.SIMULATED_STEP)
                .startDate(start)
                .increment(Duration.ofSeconds(10))
                .dateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'")
                .timeZone("UTC");

        Object step1 = config.generateNextValue();
        Object step2 = config.generateNextValue();
        Object step3 = config.generateNextValue();

        assertEquals("2026-01-01T00:00:00Z", step1);
        assertEquals("2026-01-01T00:00:10Z", step2);
        assertEquals("2026-01-01T00:00:20Z", step3);
    }

    @Test
    public void testBackfillHistoricalSequentialStrategy() {
        Instant rangeStart = Instant.parse("2026-01-01T00:00:00Z");
        Instant rangeEnd = Instant.parse("2026-01-01T01:00:00Z");
        config.timeAdvanceMode(TemporalVariableConfig.TimeAdvanceMode.BACKFILL_HISTORICAL)
                .range(rangeStart, rangeEnd)
                .backfillStrategy(TemporalVariableConfig.BackfillStrategy.SEQUENTIAL_STEP)
                .increment(Duration.ofMinutes(15))
                .dateFormat("UNIX_TIMESTAMP");

        long ts1 = ((Number) config.generateNextValue()).longValue();
        long ts2 = ((Number) config.generateNextValue()).longValue();

        assertEquals(rangeStart.toEpochMilli(), ts1);
        assertEquals(rangeStart.toEpochMilli() + 15 * 60 * 1000, ts2);
    }

    @Test
    public void testBackfillHistoricalRandomStrategy() {
        Instant rangeStart = Instant.parse("2026-01-01T00:00:00Z");
        Instant rangeEnd = Instant.parse("2026-01-01T01:00:00Z");
        config.timeAdvanceMode(TemporalVariableConfig.TimeAdvanceMode.BACKFILL_HISTORICAL)
                .range(rangeStart, rangeEnd)
                .backfillStrategy(TemporalVariableConfig.BackfillStrategy.RANDOM_IN_RANGE);

        for (int i = 0; i < 20; i++) {
            Instant val = (Instant) config.generateNextValue();
            assertFalse("Random backfill value should not be before range start", val.isBefore(rangeStart));
            assertFalse("Random backfill value should not be after range end", val.isAfter(rangeEnd));
        }
    }

    @Test
    public void testFixedTimeModeExhaustive() {
        Instant fixed = Instant.parse("2026-06-15T12:00:00Z");
        config.timeAdvanceMode(TemporalVariableConfig.TimeAdvanceMode.FIXED)
                .fixedDate(fixed);

        Object val1 = config.generateNextValue();
        Object val2 = config.generateNextValue();

        assertEquals(fixed, val1);
        assertEquals(fixed, val2);
    }

    @Test
    public void testClockDriftRandomJitter() {
        Instant start = Instant.parse("2026-01-01T10:00:00Z");
        long maxJitterMs = 5000;

        config.timeAdvanceMode(TemporalVariableConfig.TimeAdvanceMode.SIMULATED_STEP)
                .startDate(start)
                .increment(Duration.ofSeconds(0))
                .clockDriftEnabled(true)
                .maxDriftMs(maxJitterMs)
                .driftType(TemporalVariableConfig.ClockDriftType.RANDOM_JITTER);

        for (int i = 0; i < 25; i++) {
            Instant val = (Instant) config.generateNextValue();
            long diffMs = Math.abs(val.toEpochMilli() - start.toEpochMilli());
            assertTrue("Drift jitter must be within maxDriftMs bound", diffMs <= maxJitterMs);
        }
    }

    @Test
    public void testClockDriftConstantOffset() {
        Instant start = Instant.parse("2026-01-01T10:00:00Z");
        long offsetMs = 3000;

        config.timeAdvanceMode(TemporalVariableConfig.TimeAdvanceMode.SIMULATED_STEP)
                .startDate(start)
                .increment(Duration.ofSeconds(0))
                .clockDriftEnabled(true)
                .maxDriftMs(offsetMs)
                .driftType(TemporalVariableConfig.ClockDriftType.CONSTANT_OFFSET);

        Instant val = (Instant) config.generateNextValue();
        assertEquals(start.plusMillis(offsetMs), val);
    }

    @Test
    public void testClockDriftProgressiveDrift() {
        Instant start = Instant.parse("2026-01-01T10:00:00Z");
        double rateMs = 10.0;

        config.timeAdvanceMode(TemporalVariableConfig.TimeAdvanceMode.SIMULATED_STEP)
                .startDate(start)
                .increment(Duration.ofSeconds(1))
                .clockDriftEnabled(true)
                .driftRateMsPerTick(rateMs)
                .driftType(TemporalVariableConfig.ClockDriftType.PROGRESSIVE_DRIFT);

        Instant val0 = (Instant) config.generateNextValue(); // seq 0 -> offset 0
        Instant val1 = (Instant) config.generateNextValue(); // seq 1 -> offset 10ms + 1000ms increment
        Instant val2 = (Instant) config.generateNextValue(); // seq 2 -> offset 20ms + 2000ms increment

        assertEquals(start, val0);
        assertEquals(start.plusSeconds(1).plusMillis(10), val1);
        assertEquals(start.plusSeconds(2).plusMillis(20), val2);
    }

    @Test
    public void testOutputFormatsAndTemporalTypes() {
        Instant instant = Instant.parse("2026-08-27T15:30:45Z");
        config.timeAdvanceMode(TemporalVariableConfig.TimeAdvanceMode.FIXED)
                .fixedDate(instant)
                .timeZone("UTC");

        // Category: DATE
        config.temporalType("DATE").dateFormat("yyyy-MM-dd");
        assertEquals("2026-08-27", config.generateNextValue());

        // Category: TIME
        config.temporalType("TIME").dateFormat("HH:mm:ss");
        assertEquals("15:30:45", config.generateNextValue());

        // Category: TIMESTAMP Unix
        config.temporalType("TIMESTAMP").dateFormat("UNIX_TIMESTAMP");
        assertEquals(instant.toEpochMilli(), config.generateNextValue());
    }

    @Test
    public void testMapSerializationAndDeserializationRoundtrip() {
        config.identifier("temp_sensor_01")
                .temporalType("TIMESTAMP")
                .timeAdvanceMode(TemporalVariableConfig.TimeAdvanceMode.SIMULATED_STEP)
                .startDate(Instant.parse("2026-01-01T00:00:00Z"))
                .incrementMillis(5000)
                .clockDriftEnabled(true)
                .maxDriftMs(1500)
                .driftType(TemporalVariableConfig.ClockDriftType.RANDOM_JITTER)
                .backfillStrategy(TemporalVariableConfig.BackfillStrategy.SEQUENTIAL_STEP)
                .dateFormat("yyyy-MM-dd HH:mm:ss")
                .timeZone("Europe/Madrid");

        Map<String, Object> map = config.toMap();
        assertEquals("temp_sensor_01", map.get("identifier"));
        assertEquals("TEMPORAL", map.get("type"));
        assertEquals("SIMULATED_STEP", map.get("timeAdvanceMode"));
        assertTrue((Boolean) map.get("clockDriftEnabled"));
        assertEquals(1500L, map.get("maxDriftMs"));
        assertEquals("RANDOM_JITTER", map.get("driftType"));
        assertEquals("Europe/Madrid", map.get("timeZone"));

        // Recreate using VariableFactory
        Map<String, Object> mapForFactory = new HashMap<>(map);
        mapForFactory.put("id", "temp_sensor_01");

        TemporalVariableConfig restored = (TemporalVariableConfig) VariableFactory.createFromMap("temp_sensor_01", "TEMPORAL", mapForFactory);
        assertNotNull(restored);
        assertEquals(TemporalVariableConfig.TimeAdvanceMode.SIMULATED_STEP, restored.getTimeAdvanceMode());
        assertTrue(restored.isClockDriftEnabled());
        assertEquals(1500L, restored.getMaxDriftMs());
        assertEquals("Europe/Madrid", restored.getTimeZone());
    }

    @Test
    public void testResetAndValidation() {
        config.timeAdvanceMode(TemporalVariableConfig.TimeAdvanceMode.SIMULATED_STEP);
        config.generateNextValue();
        config.generateNextValue();
        assertTrue(config.getTickCounter() > 0);

        config.reset();
        assertEquals(0, config.getTickCounter());
        assertEquals(0, config.getSequenceIndex());

        // Validate method
        config.dateFormat("INVALID_PATTERN_xyz");
        assertFalse(config.validate().isEmpty());

        config.dateFormat("yyyy-MM-dd").timeZone("INVALID_TZ");
        assertFalse(config.validate().isEmpty());

        config.dateFormat("yyyy-MM-dd").timeZone("UTC");
        assertTrue(config.validate().isEmpty());
    }
}
