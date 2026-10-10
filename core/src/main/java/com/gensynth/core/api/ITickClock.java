package com.gensynth.core.api;

import com.gensynth.core.model.TickSettings;

/**
 * Global simulation clock. It emits sequential ticks to a single {@link ITickListener},
 * either at a fixed period or as fast as possible, and never runs two ticks at once.
 */
public interface ITickClock {

    /**
     * Starts ticking. Idempotent; the tick counter is reset when the clock goes from
     * stopped to running.
     */
    void start();

    /**
     * Stops ticking. Idempotent and non-blocking: it does not wait for a tick in progress.
     */
    void stop();

    /**
     * @return true while the clock is ticking
     */
    boolean isRunning();

    /**
     * Applies new settings. If the clock is running it is rescheduled immediately,
     * keeping the tick counter.
     *
     * @param settings the new tick settings
     */
    void applySettings(TickSettings settings);

    /**
     * @return the current tick settings
     */
    TickSettings getSettings();

    /**
     * @return number of ticks emitted since the clock was last started
     */
    long getTickCount();

    /**
     * Measures the tick rate since the previous call. Intended to be called from a single
     * periodic task.
     *
     * @return ticks per second since the previous sample, or 0 while stopped
     */
    double sampleTicksPerSecond();

    /**
     * Stops the clock and releases its thread. The clock cannot be restarted afterwards.
     */
    void shutdown();
}
