package com.gensynth.core.flow;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Lock-free, circular ring buffer for high-performance event buffering.
 *
 * Design:
 * - Single producer, single consumer (or multiple consumers with external sync)
 * - Pre-allocated array of fixed capacity
 * - Atomic indices for thread-safe updates without locks
 * - Wrap-around logic for circular behavior
 *
 * Performance characteristics:
 * - Write latency: O(1) with CAS
 * - Read latency: O(1) array access
 * - Memory: Fixed, pre-allocated (no GC pressure)
 * - Throughput target: 1M+ events/sec
 *
 * @param <T> Type of elements to buffer
 */
public class RingBuffer<T> {
    
    private final T[] buffer;
    private final int capacity;
    private final int capacityMask;  // For efficient modulo: capacity - 1 (capacity must be power of 2)
    
    // Lock-free indices using atomic operations
    private final AtomicLong writeIndex;
    private final AtomicLong readIndex;
    
    // Metrics
    private final AtomicLong totalWritten;
    private final AtomicLong totalRead;
    private final AtomicLong rejectedWrites;

    /**
     * Create a RingBuffer with specified capacity.
     * Capacity must be a power of 2 for efficient masking.
     *
     * @param capacity Required capacity (will be rounded to next power of 2 if not)
     * @throws IllegalArgumentException if capacity <= 0
     */
    public RingBuffer(int capacity) {
        if (capacity <= 0) {
            throw new IllegalArgumentException("capacity must be positive");
        }
        
        // Round up to nearest power of 2
        int actualCapacity = nextPowerOfTwo(capacity);
        
        @SuppressWarnings("unchecked")
        T[] tempBuffer = (T[]) new Object[actualCapacity];
        this.buffer = tempBuffer;
        this.capacity = actualCapacity;
        this.capacityMask = actualCapacity - 1;
        this.writeIndex = new AtomicLong(0);
        this.readIndex = new AtomicLong(0);
        this.totalWritten = new AtomicLong(0);
        this.totalRead = new AtomicLong(0);
        this.rejectedWrites = new AtomicLong(0);
    }

    /**
     * Try to write an element into the buffer (non-blocking).
     *
     * @param element Element to write
     * @return true if write was successful, false if buffer is full (backpressure)
     */
    public boolean write(T element) {
        if (element == null) {
            throw new IllegalArgumentException("element cannot be null");
        }

        long write = writeIndex.get();
        long read = readIndex.get();

        // Calculate next write position
        long nextWrite = write + 1;

        // Check if buffer is full (next write position would overwrite unread data)
        if ((nextWrite & capacityMask) == (read & capacityMask)) {
            // Buffer full - apply backpressure
            rejectedWrites.incrementAndGet();
            return false;
        }

        // Write element atomically
        int index = (int) (write & capacityMask);
        buffer[index] = element;

        // Update write index atomically (CAS ensures atomic update)
        writeIndex.incrementAndGet();
        totalWritten.incrementAndGet();

        return true;
    }

    /**
     * Try to read an element from the buffer (non-blocking).
     *
     * @return Element if available, null if buffer is empty
     */
    public T read() {
        long read = readIndex.get();
        long write = writeIndex.get();

        // Check if buffer is empty
        if ((read & capacityMask) == (write & capacityMask) && read == write) {
            return null;  // Empty
        }

        // Read element
        int index = (int) (read & capacityMask);
        T element = (T) buffer[index];

        // Clear slot to help GC
        buffer[index] = null;

        // Update read index atomically
        readIndex.incrementAndGet();
        totalRead.incrementAndGet();

        return element;
    }

    /**
     * Get current number of elements in buffer.
     *
     * @return Approximate count (may change between read and use)
     */
    public long size() {
        return writeIndex.get() - readIndex.get();
    }

    /**
     * Get buffer occupancy as percentage (0-100).
     *
     * @return Percentage of capacity used
     */
    public double occupancyPercent() {
        long size = size();
        return (size / (double) capacity) * 100.0;
    }

    /**
     * Check if buffer is empty.
     *
     * @return true if empty, false otherwise
     */
    public boolean isEmpty() {
        return writeIndex.get() == readIndex.get();
    }

    /**
     * Check if buffer is full (no space for new writes).
     *
     * @return true if full, false otherwise
     */
    public boolean isFull() {
        long write = writeIndex.get();
        long read = readIndex.get();
        return ((write + 1) & capacityMask) == (read & capacityMask);
    }

    /**
     * Get capacity of the ring buffer.
     *
     * @return Maximum elements that can be buffered
     */
    public int getCapacity() {
        return capacity;
    }

    /**
     * Get total elements written since creation.
     *
     * @return Cumulative writes
     */
    public long getTotalWritten() {
        return totalWritten.get();
    }

    /**
     * Get total elements read since creation.
     *
     * @return Cumulative reads
     */
    public long getTotalRead() {
        return totalRead.get();
    }

    /**
     * Get total rejected writes due to buffer full.
     *
     * @return Count of rejected writes
     */
    public long getRejectedWrites() {
        return rejectedWrites.get();
    }

    /**
     * Round up to nearest power of 2.
     * Used to ensure efficient bit masking for modulo operations.
     */
    private static int nextPowerOfTwo(int n) {
        int power = 1;
        while (power < n) {
            power *= 2;
        }
        return power;
    }

    @Override
    public String toString() {
        return String.format(
            "RingBuffer{capacity=%d, size=%d, occupancy=%.1f%%, total_written=%d, total_read=%d, rejected=%d}",
            capacity, size(), occupancyPercent(), getTotalWritten(), getTotalRead(), getRejectedWrites()
        );
    }
}
