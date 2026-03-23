package com.gensynth.core.flow;

import com.gensynth.core.api.IMetrics;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Mock implementation of IMetrics for testing.
 *
 * Features:
 * - Thread-safe metric recording using ConcurrentHashMap
 * - Cumulative metric tracking (sum aggregation)
 * - Snapshot retrieval for monitoring
 *
 * This is a simplified implementation.
 * Production implementation should support:
 * - Rate-based metrics (events/sec)
 * - Latency distribution (p50, p95, p99)
 * - Time-based aggregation windows
 * - Export to monitoring systems
 */
public class MockMetrics implements IMetrics {

    private final Map<String, AtomicLong> metrics;
    private final Map<String, Double> doubleMetrics;

    /**
     * Constructor - initializes empty metrics.
     */
    public MockMetrics() {
        this.metrics = new ConcurrentHashMap<>();
        this.doubleMetrics = new ConcurrentHashMap<>();
    }

    @Override
    public void recordMetric(String name, double value) {
        if (name == null || name.isEmpty()) {
            throw new IllegalArgumentException("metric name cannot be null or empty");
        }

        // For double metrics, store last value (not cumulative)
        doubleMetrics.put(name, value);

        // Also track as long for integer counting
        if (value == Math.floor(value) && !Double.isInfinite(value)) {
            metrics.computeIfAbsent(name, k -> new AtomicLong(0))
                .addAndGet((long) value);
        }
    }

    @Override
    public double getMetric(String name) {
        if (name == null || name.isEmpty()) {
            throw new IllegalArgumentException("metric name cannot be null or empty");
        }

        // Try double metrics first
        if (doubleMetrics.containsKey(name)) {
            return doubleMetrics.get(name);
        }

        // Fall back to long metrics
        if (metrics.containsKey(name)) {
            return metrics.get(name).get();
        }

        return 0.0;  // Default if not found
    }

    @Override
    public void reset() {
        metrics.clear();
        doubleMetrics.clear();
    }

    /**
     * Get a snapshot of all current metrics.
     *
     * @return Map of metric name → value
     */
    public Map<String, Double> getSnapshot() {
        Map<String, Double> snapshot = new HashMap<>(doubleMetrics);

        // Add cumulative metrics
        for (Map.Entry<String, AtomicLong> entry : metrics.entrySet()) {
            snapshot.putIfAbsent(entry.getKey(), (double) entry.getValue().get());
        }

        return snapshot;
    }

    /**
     * Get all metric names.
     */
    public Set<String> getMetricNames() {
        Set<String> names = new HashSet<>(doubleMetrics.keySet());
        names.addAll(metrics.keySet());
        return names;
    }

    /**
     * Get metric value as long (for counting metrics).
     */
    public long getMetricAsLong(String name) {
        if (metrics.containsKey(name)) {
            return metrics.get(name).get();
        }
        return 0L;
    }

    /**
     * Get count of how many different metrics are being tracked.
     */
    public int getMetricCount() {
        return getMetricNames().size();
    }

    @Override
    public String toString() {
        return String.format("MockMetrics{count=%d, metrics=%s}",
            getMetricCount(), getMetricNames());
    }
}
