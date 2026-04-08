package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Generates date/time values using fixed, system, incremental or range modes.
 */
public class DateVariableConfig extends VariableConfiguration {

    private Instant fixedDate;
    private Instant startDate;
    private Duration increment;
    private Instant rangeStart;
    private Instant rangeEnd;
    private long sequenceIndex;
    private long fixedDateMillis;
    private long startDateMillis;
    private long incrementMillis;
    private long rangeStartMillis;
    private long rangeEndMillis;

    // Anomaly state
    private long cachedWhenTicks = -1;
    private boolean isAnomalous;
    private long anomalyStartTick;

    public DateVariableConfig() {
        this.type = VariableType.DATE;
        this.pattern = GenerationPattern.SYSTEM_NOW;
        this.fixedDate = Instant.now();
        this.startDate = Instant.now();
        this.increment = Duration.ofSeconds(1);
        this.rangeStart = Instant.now();
        this.rangeEnd = this.rangeStart.plus(Duration.ofMinutes(1));
        this.sequenceIndex = 0;
        this.fixedDateMillis = fixedDate.toEpochMilli();
        this.startDateMillis = startDate.toEpochMilli();
        this.incrementMillis = increment.toMillis();
        this.rangeStartMillis = rangeStart.toEpochMilli();
        this.rangeEndMillis = rangeEnd.toEpochMilli();
        this.isAnomalous = false;
        this.anomalyStartTick = 0;
    }

    public DateVariableConfig fixedDate(Instant value) {
        if (value == null) {
            throw new IllegalArgumentException("Fixed date cannot be null");
        }
        this.fixedDate = value;
        this.fixedDateMillis = value.toEpochMilli();
        return this;
    }

    public DateVariableConfig startDate(Instant value) {
        if (value == null) {
            throw new IllegalArgumentException("Start date cannot be null");
        }
        this.startDate = value;
        this.startDateMillis = value.toEpochMilli();
        this.sequenceIndex = 0;
        return this;
    }

    public DateVariableConfig increment(Duration value) {
        if (value == null || value.isNegative()) {
            throw new IllegalArgumentException("Increment must be non-negative");
        }
        this.increment = value;
        this.incrementMillis = value.toMillis();
        return this;
    }

    public DateVariableConfig range(Instant from, Instant to) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("Range dates cannot be null");
        }
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("Range end must be >= start");
        }
        this.rangeStart = from;
        this.rangeEnd = to;
        this.rangeStartMillis = from.toEpochMilli();
        this.rangeEndMillis = to.toEpochMilli();
        return this;
    }

    @Override
    public Object generateNextValue() {
        tickCounter++;
        checkAnomalyCondition();

        if (isAnomalous) {
            return anomalyConfig.getAnomalousValue();
        }

        switch (pattern) {
            case FIXED_DATE:
                return Instant.ofEpochMilli(fixedDateMillis);
            case SYSTEM_NOW:
                return Instant.ofEpochMilli(System.currentTimeMillis());
            case START_PLUS_INCREMENT:
                return generateIncremental();
            case DATE_RANGE:
                return generateRange();
            default:
                return Instant.ofEpochMilli(System.currentTimeMillis());
        }
    }

    private Instant generateIncremental() {
        long valueMillis = startDateMillis + (incrementMillis * sequenceIndex);
        sequenceIndex++;
        return Instant.ofEpochMilli(valueMillis);
    }

    private Instant generateRange() {
        if (rangeEndMillis <= rangeStartMillis) {
            return rangeStart;
        }
        long offset = ThreadLocalRandom.current().nextLong(rangeEndMillis - rangeStartMillis + 1);
        return Instant.ofEpochMilli(rangeStartMillis + offset);
    }

    @Override
    public void reset() {
        tickCounter = 0;
        sequenceIndex = 0;
        isAnomalous = false;
        anomalyStartTick = 0;
        cachedWhenTicks = -1;
    }

    @Override
    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>(9);
        map.put("identifier", identifier);
        map.put("type", type.toString());
        map.put("pattern", pattern.toString());
        map.put("fixedDate", fixedDate.toString());
        map.put("startDate", startDate.toString());
        map.put("incrementMs", increment.toMillis());
        map.put("rangeStart", rangeStart.toString());
        map.put("rangeEnd", rangeEnd.toString());
        return map;
    }

    @Override
    public DateVariableConfig identifier(String id) {
        this.identifier = id;
        return this;
    }

    @Override
    public DateVariableConfig pattern(GenerationPattern p) {
        this.pattern = p;
        return this;
    }

    @Override
    public DateVariableConfig defaultValue(Object value) {
        this.defaultValue = value;
        return this;
    }

    @Override
    public DateVariableConfig anomaly(AnomalyConfig config) {
        this.anomalyConfig = config;
        this.cachedWhenTicks = -1;
        return this;
    }

    private void checkAnomalyCondition() {
        if (anomalyConfig == null || !anomalyConfig.isEnabled()) {
            isAnomalous = false;
            return;
        }

        if (isAnomalous) {
            long elapsedTicks = tickCounter - anomalyStartTick;
            handleAnomalyDuration(elapsedTicks);
            return;
        }

        boolean shouldTrigger = false;

        if (anomalyConfig.getWhenTicks() > 0) {
            if (cachedWhenTicks == -1) {
                cachedWhenTicks = anomalyConfig.getWhenTicks();
            }
            shouldTrigger = (tickCounter == cachedWhenTicks);
        } else if (anomalyConfig.getProbabilityRatio() > 0) {
            double random100 = ThreadLocalRandom.current().nextDouble(100.0);
            shouldTrigger = (random100 < anomalyConfig.getProbabilityRatio());
        }

        if (shouldTrigger) {
            isAnomalous = true;
            anomalyStartTick = tickCounter;
        }
    }

    private void handleAnomalyDuration(long elapsedTicks) {
        switch (anomalyConfig.getType()) {
            case MAKE_AND_BACK:
                if (elapsedTicks >= 1) {
                    isAnomalous = false;
                    cachedWhenTicks = -1;
                }
                break;
            case MAKE_AND_KEEP:
                break;
            case MAKE_AND_KEEP_N_TIMES:
                if (elapsedTicks >= anomalyConfig.getKeepNTimes()) {
                    isAnomalous = false;
                    cachedWhenTicks = -1;
                }
                break;
        }
    }

    public long getSequenceIndex() {
        return sequenceIndex;
    }
}
