package com.gensynth.core.flow;

import java.util.List;

/**
 * Interface for event pipeline/buffering system.
 *
 * The Pipeline is responsible for:
 * - Receiving data events from FlowEngine
 * - Buffering events (ring buffer)
 * - Applying backpressure when buffer is getting full
 * - Batching events for efficient processing
 * - Serialization for external connectors
 */
public interface IPipeline {

    /**
     * Submit a data event to the pipeline.
     *
     * @param event The DataEvent to submit
     * @return true if submitted successfully, false if buffer is full (backpressure)
     */
    boolean submit(DataEvent event);

    /**
     * Check if pipeline buffer is nearing capacity.
     *
     * @return true if backpressure should be applied, false otherwise
     */
    boolean isFull();

    /**
     * Get current buffer occupancy as percentage (0-100).
     *
     * @return Percentage of buffer used
     */
    double getBufferOccupancy();

    /**
     * Flush and get a batch of events for processing.
     *
     * @param maxBatchSize Maximum number of events to fetch
     * @return List of DataEvent objects (may be smaller than maxBatchSize)
     */
    List<DataEvent> flush(int maxBatchSize);

    /**
     * Get total number of events processed so far.
     *
     * @return Count of successfully processed events
     */
    long getTotalProcessed();

    /**
     *Reset all statistics and counters.
     */
    void reset();
}
