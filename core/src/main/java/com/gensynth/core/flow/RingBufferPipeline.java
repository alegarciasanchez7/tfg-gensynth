package com.gensynth.core.flow;

import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Production-grade Pipeline implementation using RingBuffer.
 *
 * Features:
 * - Lock-free circular buffer for high throughput
 * - Configurable capacity with power-of-2 rounding
 * - Backpressure mechanism (prevents buffer overflow)
 * - Batch flushing for efficient processing
 * - Comprehensive metrics collection
 *
 * Performance target: 1M+ events/second
 */
public class RingBufferPipeline implements IPipeline {
    
    private final RingBuffer<DataEvent> buffer;
    private final double backpressureThreshold;  // Percentage (0-100)
    private final AtomicLong totalProcessed;
    private final AtomicLong lastFlushTime;
    
    /**
     * Create RingBufferPipeline with default settings.
     * Default capacity: 100,000 events
     * Default backpressure: 80% occupancy
     */
    public RingBufferPipeline() {
        this(100_000, 80.0);
    }

    /**
     * Create RingBufferPipeline with custom settings.
     *
     * @param capacity Initial capacity (rounded to power of 2)
     * @param backpressureThresholdPercent Percentage (0-100) when to apply backpressure
     */
    public RingBufferPipeline(int capacity, double backpressureThresholdPercent) {
        if (capacity <= 0) {
            throw new IllegalArgumentException("capacity must be positive");
        }
        if (backpressureThresholdPercent <= 0 || backpressureThresholdPercent > 100) {
            throw new IllegalArgumentException(
                "backpressureThresholdPercent must be between 0 and 100");
        }

        this.buffer = new RingBuffer<>(capacity);
        this.backpressureThreshold = backpressureThresholdPercent;
        this.totalProcessed = new AtomicLong(0);
        this.lastFlushTime = new AtomicLong(System.currentTimeMillis());
    }

    @Override
    public boolean submit(DataEvent event) {
        if (event == null) {
            throw new IllegalArgumentException("event cannot be null");
        }

        // Try to write to buffer
        boolean submitted = buffer.write(event);
        
        if (submitted) {
            totalProcessed.incrementAndGet();
        }

        return submitted;
    }

    @Override
    public boolean isFull() {
        double occupancy = getBufferOccupancy();
        return occupancy >= backpressureThreshold;
    }

    @Override
    public double getBufferOccupancy() {
        return buffer.occupancyPercent();
    }

    @Override
    public List<DataEvent> flush(int maxBatchSize) {
        List<DataEvent> batch = new ArrayList<>(Math.min(maxBatchSize, (int) buffer.size()));
        
        for (int i = 0; i < maxBatchSize; i++) {
            DataEvent event = buffer.read();
            if (event == null) {
                break;  // No more events
            }
            batch.add(event);
        }

        if (!batch.isEmpty()) {
            lastFlushTime.set(System.currentTimeMillis());
        }

        return batch;
    }

    @Override
    public long getTotalProcessed() {
        return totalProcessed.get();
    }

    @Override
    public long getBufferSize() {
        return buffer.size();
    }

    @Override
    public double getThroughput() {
        long now = System.currentTimeMillis();
        long lastFlush = lastFlushTime.get();
        long elapsedMs = now - lastFlush;
        
        if (elapsedMs == 0) {
            return 0.0;  // No time has elapsed
        }

        long processed = totalProcessed.get();
        // Events per millisecond * 1000 = events per second
        return (processed / (double) elapsedMs) * 1000.0;
    }

    @Override
    public void reset() {
        // Note: RingBuffer doesn't have reset method, would need to create new instance
        totalProcessed.set(0);
        lastFlushTime.set(System.currentTimeMillis());
    }

    /**
     * Get total number of events rejected due to backpressure.
     *
     * @return Count of rejected writes
     */
    public long getRejectedWrites() {
        return buffer.getRejectedWrites();
    }

    /**
     * Get underlying buffer state for monitoring.
     *
     * @return String representation of buffer state
     */
    public String getBufferStatus() {
        return buffer.toString();
    }

    @Override
    public String toString() {
        return String.format(
            "RingBufferPipeline{capacity=%d, occupancy=%.1f%%, processed=%d, rejected=%d, throughput=%.0f/s}",
            buffer.getCapacity(),
            getBufferOccupancy(),
            getTotalProcessed(),
            getRejectedWrites(),
            getThroughput()
        );
    }
}
