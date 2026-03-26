package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import org.junit.Before;
import org.junit.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import static org.junit.Assert.*;

public class DateVariableConfigTest {

    private DateVariableConfig config;

    @Before
    public void setUp() {
        config = new DateVariableConfig().identifier("date_sensor");
    }

    @Test
    public void testDateConfigCreation() {
        assertEquals("date_sensor", config.getIdentifier());
        assertEquals(VariableType.DATE, config.getType());
    }

    @Test
    public void testFixedDatePattern() {
        Instant fixed = Instant.parse("2025-01-01T00:00:00Z");
        config.pattern(GenerationPattern.FIXED_DATE).fixedDate(fixed);

        Object v1 = config.generateNextValue();
        Object v2 = config.generateNextValue();

        assertEquals(fixed, v1);
        assertEquals(fixed, v2);
    }

    @Test
    public void testSystemNowPattern() {
        config.pattern(GenerationPattern.SYSTEM_NOW);

        Object value = config.generateNextValue();

        assertTrue(value instanceof Instant);
    }

    @Test
    public void testStartPlusIncrementPattern() {
        Instant start = Instant.parse("2025-01-01T00:00:00Z");
        config.pattern(GenerationPattern.START_PLUS_INCREMENT)
            .startDate(start)
            .increment(Duration.ofSeconds(2));

        Object v1 = config.generateNextValue();
        Object v2 = config.generateNextValue();
        Object v3 = config.generateNextValue();

        assertEquals(start, v1);
        assertEquals(start.plusSeconds(2), v2);
        assertEquals(start.plusSeconds(4), v3);
    }

    @Test
    public void testDateRangePattern() {
        Instant from = Instant.parse("2025-01-01T00:00:00Z");
        Instant to = Instant.parse("2025-01-01T00:01:00Z");
        config.pattern(GenerationPattern.DATE_RANGE).range(from, to);

        for (int i = 0; i < 20; i++) {
            Instant value = (Instant) config.generateNextValue();
            assertFalse(value.isBefore(from));
            assertFalse(value.isAfter(to));
        }
    }

    @Test
    public void testReset() {
        Instant start = Instant.parse("2025-01-01T00:00:00Z");
        config.pattern(GenerationPattern.START_PLUS_INCREMENT)
            .startDate(start)
            .increment(Duration.ofSeconds(1));

        config.generateNextValue();
        config.generateNextValue();

        assertTrue(config.getTickCounter() > 0);
        assertTrue(config.getSequenceIndex() > 0);

        config.reset();

        assertEquals(0, config.getTickCounter());
        assertEquals(0, config.getSequenceIndex());
    }

    @Test
    public void testAnomalyTickBased() {
        Instant fixed = Instant.parse("2025-01-01T00:00:00Z");
        Instant anomalyDate = Instant.parse("2030-01-01T00:00:00Z");

        AnomalyConfig anomaly = new AnomalyConfig()
            .type(AnomalyType.MAKE_AND_BACK)
            .whenTicks(2)
            .anomalousValue(anomalyDate);
        anomaly.setEnabled(true);

        config.pattern(GenerationPattern.FIXED_DATE)
            .fixedDate(fixed)
            .anomaly(anomaly);

        Object v1 = config.generateNextValue();
        Object v2 = config.generateNextValue();
        Object v3 = config.generateNextValue();

        assertEquals(fixed, v1);
        assertEquals(anomalyDate, v2);
        assertEquals(fixed, v3);
    }

    @Test
    public void testAnomalyProbabilityBased() {
        Instant fixed = Instant.parse("2025-01-01T00:00:00Z");
        Instant anomalyDate = Instant.parse("2030-01-01T00:00:00Z");

        AnomalyConfig anomaly = new AnomalyConfig()
            .type(AnomalyType.MAKE_AND_BACK)
            .probabilityRatio(100.0)
            .anomalousValue(anomalyDate);
        anomaly.setEnabled(true);

        config.pattern(GenerationPattern.FIXED_DATE)
            .fixedDate(fixed)
            .anomaly(anomaly);

        Object v1 = config.generateNextValue();
        assertEquals(anomalyDate, v1);
    }

    @Test
    public void testToMap() {
        Map<String, Object> map = config.pattern(GenerationPattern.FIXED_DATE).toMap();

        assertEquals("date_sensor", map.get("identifier"));
        assertEquals("DATE", map.get("type"));
        assertEquals("FIXED_DATE", map.get("pattern"));
    }

    @Test
    public void testFactoryIntegration() {
        DateVariableConfig dateConfig = VariableFactory.createDate("factory_date")
            .pattern(GenerationPattern.FIXED_DATE)
            .fixedDate(Instant.parse("2025-01-01T00:00:00Z"));

        assertNotNull(dateConfig);
        assertEquals("factory_date", dateConfig.getIdentifier());
        assertEquals(VariableType.DATE, dateConfig.getType());
        assertNotNull(dateConfig.generateNextValue());
    }
}
