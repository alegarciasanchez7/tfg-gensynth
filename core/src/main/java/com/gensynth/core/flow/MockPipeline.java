package com.gensynth.core.flow;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Mock implementation of IPipeline for testing.
 *
 * Features:
 * - Uses BlockingQueue for thread-safe event buffering
 * - Configurable capacity (default 10,000)
 * - Backpressure at 80% capacity
 * - Tracks statistics (total processed, occupancy)
 *
 * This is a simplified implementation.
 * Production implementation should use ring buffers for better performance.
 */
public class MockPipeline implements IPipeline {

    private final BlockingQueue<DataEvent> buffer;
    private final int capacity;
    private final double backpressureThreshold;  // Default 0.8 (80%)
    private final AtomicLong totalProcessed;
    private final AtomicLong lastFlushTime;

    /**
     * Constructor with default settings.
     * Capacity: 10,000
     * Backpressure threshold: 80%
     */
    public MockPipeline() {
        this(10000, 0.8);
    }

    /**
     * Constructor with custom settings.
     *
     * @param capacity Maximum events to buffer
     * @param backpressureThreshold Percentage (0-1) when to apply backpressure
     */
    public MockPipeline(int capacity, double backpressureThreshold) {
        if (capacity <= 0) {
            throw new IllegalArgumentException("capacity must be positive");
        }
        if (backpressureThreshold <= 0 || backpressureThreshold > 1) {
            throw new IllegalArgumentException(
                "backpressureThreshold must be between 0 and 1");
        }

        this.buffer = new LinkedBlockingQueue<>(capacity);
        this.capacity = capacity;
        this.backpressureThreshold = backpressureThreshold;
        this.totalProcessed = new AtomicLong(0);
        this.lastFlushTime = new AtomicLong(System.currentTimeMillis());
    }

    @Override
    public boolean submit(DataEvent event) {
        if (event == null) {
            throw new IllegalArgumentException("event cannot be null");
        }

        // Try non-blocking insert
        boolean submitted = buffer.offer(event);

        if (submitted) {
            totalProcessed.incrementAndGet();
        }

        return submitted;
    }

    @Override
    public boolean isFull() {
        double occupancy = getBufferOccupancy();
        return occupancy >= (backpressureThreshold * 100);
    }

    @Override
    public double getBufferOccupancy() {
        return (buffer.size() / (double) capacity) * 100.0;
    }

    @Override
    public List<DataEvent> flush(int maxBatchSize) {
        List<DataEvent> batch = new ArrayList<>();

        // Try to get up to maxBatchSize events
        buffer.drainTo(batch, maxBatchSize);

        return batch;
    }

    @Override
    public long getTotalProcessed() {
        return totalProcessed.get();
    }

    @Override
    public void reset() {
        buffer.clear();
        totalProcessed.set(0);
        lastFlushTime.set(System.currentTimeMillis());
    }

    @Override
    public long getBufferSize() {
        return (long) buffer.size();
    }

    @Override
    public double getThroughput() {
        long now = System.currentTimeMillis();
        long lastFlush = lastFlushTime.get();
        long elapsedMs = now - lastFlush;
        
        if (elapsedMs == 0) {
            return 0.0;
        }

        long processed = totalProcessed.get();
        return (processed / (double) elapsedMs) * 1000.0;
    }

    /**
     * Get capacity of the buffer.
     */
    public int getCapacity() {
        return capacity;
    }

    @Override
    public String toString() {
        return String.format(
            "MockPipeline{size=%d, capacity=%d, occupancy=%.1f%%, processed=%d}",
            buffer.size(), capacity, getBufferOccupancy(), totalProcessed.get());
    }
}
