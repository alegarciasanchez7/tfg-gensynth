package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Configuration for temporal (date/time) variables.
 * Supports various time advance modes, formatting options, and clock drift/skew simulations.
 */
public class TemporalVariableConfig extends VariableConfiguration {

    public enum TimeAdvanceMode {
        WALL_CLOCK,
        SIMULATED_STEP,
        BACKFILL_HISTORICAL,
        FIXED
    }

    public enum ClockDriftType {
        RANDOM_JITTER,
        CONSTANT_OFFSET,
        PROGRESSIVE_DRIFT
    }

    public enum BackfillStrategy {
        SEQUENTIAL_STEP,
        RANDOM_IN_RANGE
    }

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

    // Advanced Formatting
    private String dateFormat; // "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "UNIX_TIMESTAMP", or null (returns Instant)
    private String timeZone;   // e.g. "UTC", "Europe/Madrid"
    private String temporalType; // "DATE", "TIMESTAMP", "TIME"
    private transient DateTimeFormatter formatter;

    // Time Advance & Drift Settings
    private TimeAdvanceMode timeAdvanceMode;
    private boolean clockDriftEnabled;
    private long maxDriftMs;
    private ClockDriftType driftType;
    private double driftRateMsPerTick;
    private BackfillStrategy backfillStrategy;

    // Anomaly state
    private long cachedWhenTicks = -1;
    private boolean isAnomalous;
    private long anomalyStartTick;

    public TemporalVariableConfig() {
        this.type = VariableType.TEMPORAL;
        this.pattern = GenerationPattern.SYSTEM_NOW;
        this.temporalType = "TIMESTAMP";
        this.timeAdvanceMode = TimeAdvanceMode.WALL_CLOCK;
        this.fixedDate = Instant.now();
        this.startDate = Instant.now();
        this.increment = Duration.ofSeconds(1);
        this.rangeStart = Instant.now().minus(Duration.ofDays(7));
        this.rangeEnd = Instant.now();
        this.sequenceIndex = 0;
        this.fixedDateMillis = fixedDate.toEpochMilli();
        this.startDateMillis = startDate.toEpochMilli();
        this.incrementMillis = increment.toMillis();
        this.rangeStartMillis = rangeStart.toEpochMilli();
        this.rangeEndMillis = rangeEnd.toEpochMilli();
        this.clockDriftEnabled = false;
        this.maxDriftMs = 0;
        this.driftType = ClockDriftType.RANDOM_JITTER;
        this.driftRateMsPerTick = 1.0;
        this.backfillStrategy = BackfillStrategy.SEQUENTIAL_STEP;
        this.isAnomalous = false;
        this.anomalyStartTick = 0;
    }

    public TemporalVariableConfig fixedDate(Instant value) {
        if (value == null) {
            throw new IllegalArgumentException("Fixed date cannot be null");
        }
        this.fixedDate = value;
        this.fixedDateMillis = value.toEpochMilli();
        return this;
    }

    public TemporalVariableConfig startDate(Instant value) {
        if (value == null) {
            throw new IllegalArgumentException("Start date cannot be null");
        }
        this.startDate = value;
        this.startDateMillis = value.toEpochMilli();
        this.sequenceIndex = 0;
        return this;
    }

    public TemporalVariableConfig increment(Duration value) {
        if (value == null || value.isNegative()) {
            throw new IllegalArgumentException("Increment must be non-negative");
        }
        this.increment = value;
        this.incrementMillis = value.toMillis();
        return this;
    }

    public TemporalVariableConfig incrementMillis(long value) {
        if (value < 0) {
            throw new IllegalArgumentException("Increment millis must be non-negative");
        }
        this.increment = Duration.ofMillis(value);
        this.incrementMillis = value;
        return this;
    }

    public TemporalVariableConfig range(Instant from, Instant to) {
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

    public TemporalVariableConfig timeAdvanceMode(TimeAdvanceMode mode) {
        if (mode != null) {
            this.timeAdvanceMode = mode;
            syncPatternWithTimeAdvanceMode();
        }
        return this;
    }

    public TemporalVariableConfig timeAdvanceMode(String modeStr) {
        if (modeStr != null && !modeStr.trim().isEmpty()) {
            try {
                this.timeAdvanceMode = TimeAdvanceMode.valueOf(modeStr.toUpperCase());
                syncPatternWithTimeAdvanceMode();
            } catch (IllegalArgumentException ignored) {
            }
        }
        return this;
    }

    public TemporalVariableConfig clockDriftEnabled(boolean enabled) {
        this.clockDriftEnabled = enabled;
        return this;
    }

    public TemporalVariableConfig maxDriftMs(long ms) {
        this.maxDriftMs = ms;
        return this;
    }

    public TemporalVariableConfig driftType(ClockDriftType type) {
        if (type != null) {
            this.driftType = type;
        }
        return this;
    }

    public TemporalVariableConfig driftType(String typeStr) {
        if (typeStr != null && !typeStr.trim().isEmpty()) {
            try {
                this.driftType = ClockDriftType.valueOf(typeStr.toUpperCase());
            } catch (IllegalArgumentException ignored) {
            }
        }
        return this;
    }

    public TemporalVariableConfig driftRateMsPerTick(double rate) {
        this.driftRateMsPerTick = rate;
        return this;
    }

    public TemporalVariableConfig backfillStrategy(BackfillStrategy strategy) {
        if (strategy != null) {
            this.backfillStrategy = strategy;
        }
        return this;
    }

    public TemporalVariableConfig backfillStrategy(String strategyStr) {
        if (strategyStr != null && !strategyStr.trim().isEmpty()) {
            try {
                this.backfillStrategy = BackfillStrategy.valueOf(strategyStr.toUpperCase());
            } catch (IllegalArgumentException ignored) {
            }
        }
        return this;
    }

    private void syncPatternWithTimeAdvanceMode() {
        if (timeAdvanceMode != null) {
            switch (timeAdvanceMode) {
                case WALL_CLOCK:
                    this.pattern = GenerationPattern.SYSTEM_NOW;
                    break;
                case SIMULATED_STEP:
                    this.pattern = GenerationPattern.START_PLUS_INCREMENT;
                    break;
                case BACKFILL_HISTORICAL:
                    this.pattern = GenerationPattern.TEMPORAL_RANGE;
                    break;
                case FIXED:
                    this.pattern = GenerationPattern.FIXED_TEMPORAL;
                    break;
            }
        }
    }

    @Override
    public java.util.List<String> validate() {
        java.util.List<String> errors = new java.util.ArrayList<>();
        if (dateFormat != null && !dateFormat.trim().isEmpty() && !"UNIX_TIMESTAMP".equalsIgnoreCase(dateFormat)) {
            try {
                DateTimeFormatter.ofPattern(dateFormat);
            } catch (IllegalArgumentException e) {
                errors.add("Invalid date format: " + e.getMessage());
            }
        }
        if (timeZone != null && !timeZone.trim().isEmpty()) {
            try {
                ZoneId.of(timeZone);
            } catch (Exception e) {
                errors.add("Invalid timezone: " + e.getMessage());
            }
        }
        return errors;
    }

    @Override
    public Object generateNextValue() {
        tickCounter++;
        checkAnomalyCondition();

        if (isAnomalous) {
            return anomalyConfig.getAnomalousValue();
        }

        long currentSeq = sequenceIndex;
        Instant generatedInstant = computeBaseInstant();

        // Apply Clock Drift / Skew if enabled
        if (clockDriftEnabled) {
            long driftOffsetMs = 0;
            ClockDriftType effectiveDriftType = (driftType != null) ? driftType : ClockDriftType.RANDOM_JITTER;
            switch (effectiveDriftType) {
                case RANDOM_JITTER:
                    if (maxDriftMs > 0) {
                        driftOffsetMs = ThreadLocalRandom.current().nextLong(-maxDriftMs, maxDriftMs + 1);
                    }
                    break;
                case CONSTANT_OFFSET:
                    driftOffsetMs = maxDriftMs;
                    break;
                case PROGRESSIVE_DRIFT:
                    driftOffsetMs = Math.round(currentSeq * driftRateMsPerTick);
                    break;
            }
            generatedInstant = generatedInstant.plusMillis(driftOffsetMs);
        }

        return formatOutput(generatedInstant);
    }

    private Instant computeBaseInstant() {
        TimeAdvanceMode effectiveMode = (timeAdvanceMode != null) ? timeAdvanceMode : mapPatternToTimeAdvanceMode();
        switch (effectiveMode) {
            case WALL_CLOCK:
                return Instant.ofEpochMilli(System.currentTimeMillis());
            case SIMULATED_STEP:
                return generateIncremental();
            case BACKFILL_HISTORICAL:
                return generateBackfill();
            case FIXED:
                return Instant.ofEpochMilli(fixedDateMillis);
            default:
                return Instant.ofEpochMilli(System.currentTimeMillis());
        }
    }

    private TimeAdvanceMode mapPatternToTimeAdvanceMode() {
        if (pattern == null) return TimeAdvanceMode.WALL_CLOCK;
        switch (pattern) {
            case START_PLUS_INCREMENT:
                return TimeAdvanceMode.SIMULATED_STEP;
            case TEMPORAL_RANGE:
                return TimeAdvanceMode.BACKFILL_HISTORICAL;
            case FIXED_TEMPORAL:
                return TimeAdvanceMode.FIXED;
            case SYSTEM_NOW:
            default:
                return TimeAdvanceMode.WALL_CLOCK;
        }
    }

    private Instant generateIncremental() {
        long valueMillis = startDateMillis + (incrementMillis * sequenceIndex);
        sequenceIndex++;
        return Instant.ofEpochMilli(valueMillis);
    }

    private Instant generateBackfill() {
        BackfillStrategy strategy = (backfillStrategy != null) ? backfillStrategy : BackfillStrategy.SEQUENTIAL_STEP;
        if (strategy == BackfillStrategy.SEQUENTIAL_STEP) {
            long totalSpan = rangeEndMillis - rangeStartMillis;
            if (totalSpan <= 0) {
                return Instant.ofEpochMilli(rangeStartMillis);
            }
            long offset = (incrementMillis * sequenceIndex) % (totalSpan + 1);
            sequenceIndex++;
            return Instant.ofEpochMilli(rangeStartMillis + offset);
        } else {
            return generateRange();
        }
    }

    private Instant generateRange() {
        if (rangeEndMillis <= rangeStartMillis) {
            return Instant.ofEpochMilli(rangeStartMillis);
        }
        long offset = ThreadLocalRandom.current().nextLong(rangeEndMillis - rangeStartMillis + 1);
        return Instant.ofEpochMilli(rangeStartMillis + offset);
    }

    private Object formatOutput(Instant instant) {
        if (dateFormat == null || dateFormat.trim().isEmpty()) {
            return instant;
        }
        if ("UNIX_TIMESTAMP".equalsIgnoreCase(dateFormat)) {
            return instant.toEpochMilli();
        }

        if (formatter == null) {
            ZoneId zone = (timeZone != null && !timeZone.trim().isEmpty()) 
                ? ZoneId.of(timeZone) 
                : ZoneId.systemDefault();
            formatter = DateTimeFormatter.ofPattern(dateFormat).withZone(zone);
        }
        return formatter.format(instant);
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
        Map<String, Object> map = new HashMap<>(18);
        map.put("identifier", identifier);
        map.put("type", type.toString());
        map.put("pattern", pattern.toString());
        map.put("fixedDate", fixedDate.toString());
        map.put("startDate", startDate.toString());
        map.put("incrementMs", increment.toMillis());
        map.put("rangeStart", rangeStart.toString());
        map.put("rangeEnd", rangeEnd.toString());
        map.put("dateFormat", dateFormat);
        map.put("timeZone", timeZone);
        map.put("temporalType", temporalType);
        map.put("timeAdvanceMode", timeAdvanceMode != null ? timeAdvanceMode.name() : TimeAdvanceMode.WALL_CLOCK.name());
        map.put("clockDriftEnabled", clockDriftEnabled);
        map.put("maxDriftMs", maxDriftMs);
        map.put("driftType", driftType != null ? driftType.name() : ClockDriftType.RANDOM_JITTER.name());
        map.put("driftRateMsPerTick", driftRateMsPerTick);
        map.put("backfillStrategy", backfillStrategy != null ? backfillStrategy.name() : BackfillStrategy.SEQUENTIAL_STEP.name());
        return map;
    }

    @Override
    public TemporalVariableConfig identifier(String id) {
        this.identifier = id;
        return this;
    }

    @Override
    public TemporalVariableConfig pattern(GenerationPattern p) {
        this.pattern = p;
        if (p == GenerationPattern.SYSTEM_NOW) this.timeAdvanceMode = TimeAdvanceMode.WALL_CLOCK;
        else if (p == GenerationPattern.START_PLUS_INCREMENT) this.timeAdvanceMode = TimeAdvanceMode.SIMULATED_STEP;
        else if (p == GenerationPattern.TEMPORAL_RANGE) this.timeAdvanceMode = TimeAdvanceMode.BACKFILL_HISTORICAL;
        else if (p == GenerationPattern.FIXED_TEMPORAL) this.timeAdvanceMode = TimeAdvanceMode.FIXED;
        return this;
    }

    @Override
    public TemporalVariableConfig defaultValue(Object value) {
        this.defaultValue = value;
        return this;
    }

    @Override
    public TemporalVariableConfig anomaly(AnomalyConfig config) {
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

    public TemporalVariableConfig dateFormat(String format) {
        this.dateFormat = format;
        this.formatter = null; // reset formatter
        return this;
    }

    public TemporalVariableConfig timeZone(String timeZone) {
        this.timeZone = timeZone;
        this.formatter = null; // reset formatter
        return this;
    }

    public TemporalVariableConfig temporalType(String type) {
        this.temporalType = type;
        return this;
    }

    public TimeAdvanceMode getTimeAdvanceMode() {
        return timeAdvanceMode;
    }

    public boolean isClockDriftEnabled() {
        return clockDriftEnabled;
    }

    public long getMaxDriftMs() {
        return maxDriftMs;
    }

    public ClockDriftType getDriftType() {
        return driftType;
    }

    public double getDriftRateMsPerTick() {
        return driftRateMsPerTick;
    }

    public BackfillStrategy getBackfillStrategy() {
        return backfillStrategy;
    }

    public Instant getFixedDate() {
        return fixedDate;
    }

    public Instant getStartDate() {
        return startDate;
    }

    public Duration getIncrement() {
        return increment;
    }

    public Instant getRangeStart() {
        return rangeStart;
    }

    public Instant getRangeEnd() {
        return rangeEnd;
    }

    public String getDateFormat() {
        return dateFormat;
    }

    public String getTimeZone() {
        return timeZone;
    }

    public String getTemporalType() {
        return temporalType;
    }
}
