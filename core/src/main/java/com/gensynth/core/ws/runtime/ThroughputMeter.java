package com.gensynth.core.ws.runtime;

import com.gensynth.core.model.TickSettings;

import java.util.Arrays;

/**
 * Measures the send rate (messages per second) of one flow.
 *
 * Sends are recorded into one-second buckets ({@link #recordSend(long)}), and the metrics task
 * closes a bucket every second ({@link #rotate()}). The rate is computed over the last
 * completed buckets from the time between the first and the last send of the window, so a
 * regular flow reports its exact rate (e.g. 0.20 msg/s for one message every 5 s) instead of
 * jumping between 0 and 1 depending on how sends fall into the one-second buckets.
 */
public final class ThroughputMeter {

    /** Longest window kept, in seconds (one bucket per second). */
    public static final int MAX_WINDOW_SECONDS = 60;
    /** Shortest window used, in seconds. */
    public static final int MIN_WINDOW_SECONDS = 5;

    private static final double NANOS_PER_SECOND = 1_000_000_000.0;

    private final long[] counts = new long[MAX_WINDOW_SECONDS];
    private final long[] firstNanos = new long[MAX_WINDOW_SECONDS];
    private final long[] lastNanos = new long[MAX_WINDOW_SECONDS];
    /** Index of the completed bucket written last. */
    private int head = MAX_WINDOW_SECONDS - 1;
    private int completed;

    private long currentCount;
    private long currentFirstNanos;
    private long currentLastNanos;

    /**
     * Records one successful send.
     *
     * @param nowNanos {@link System#nanoTime()} of the send
     */
    public synchronized void recordSend(long nowNanos) {
        if (currentCount == 0) {
            currentFirstNanos = nowNanos;
        }
        currentCount++;
        currentLastNanos = nowNanos;
    }

    /**
     * Closes the current one-second bucket. Called once per second by the metrics task.
     */
    public synchronized void rotate() {
        head = (head + 1) % MAX_WINDOW_SECONDS;
        counts[head] = currentCount;
        firstNanos[head] = currentFirstNanos;
        lastNanos[head] = currentLastNanos;
        completed = Math.min(completed + 1, MAX_WINDOW_SECONDS);
        currentCount = 0;
    }

    /**
     * Computes the send rate over the last completed buckets.
     *
     * @param windowSeconds window length in seconds (see {@link #windowFor(TickSettings, int)})
     * @param periodSeconds expected time between two messages (0 when unknown, e.g. AFAP)
     * @param nowNanos      current {@link System#nanoTime()}
     * @return messages per second
     */
    public synchronized double rate(int windowSeconds, double periodSeconds, long nowNanos) {
        int buckets = Math.min(Math.max(1, windowSeconds), completed);
        if (buckets == 0) {
            return 0.0;
        }

        long total = 0;
        long first = Long.MAX_VALUE;
        long last = Long.MIN_VALUE;
        for (int i = 0; i < buckets; i++) {
            int index = Math.floorMod(head - i, MAX_WINDOW_SECONDS);
            if (counts[index] == 0) {
                continue;
            }
            total += counts[index];
            first = Math.min(first, firstNanos[index]);
            last = Math.max(last, lastNanos[index]);
        }

        if (total == 0) {
            return 0.0;
        }
        if (total == 1) {
            // A single send: assume one message per expected period (or per observed time)
            return 1.0 / Math.max(buckets, periodSeconds);
        }

        double spanSeconds = (last - first) / NANOS_PER_SECOND;
        if (spanSeconds <= 0) {
            return total / (double) buckets;
        }
        double averageInterval = spanSeconds / (total - 1);
        // If the flow stopped sending, let the rate decay with the time since the first send
        double sinceFirstSeconds = (nowNanos - first) / NANOS_PER_SECOND - averageInterval;
        return (total - 1) / Math.max(spanSeconds, sinceFirstSeconds);
    }

    /**
     * Forgets every recorded send.
     */
    public synchronized void reset() {
        Arrays.fill(counts, 0);
        head = MAX_WINDOW_SECONDS - 1;
        completed = 0;
        currentCount = 0;
    }

    /**
     * Expected time between two messages of a flow, in seconds.
     *
     * @param tick       global tick settings
     * @param everyTicks ticks between two messages of the flow
     * @return the period, or 0 when the tick rate is not fixed (as fast as possible)
     */
    public static double periodSeconds(TickSettings tick, int everyTicks) {
        if (tick.getMode() == TickSettings.Mode.AS_FAST_AS_POSSIBLE) {
            return 0.0;
        }
        return tick.periodNanos() / NANOS_PER_SECOND * Math.max(1, everyTicks);
    }

    /**
     * Window used to measure a flow: long enough to contain at least two sends.
     *
     * @param tick       global tick settings
     * @param everyTicks ticks between two messages of the flow
     * @return window length in seconds, between {@link #MIN_WINDOW_SECONDS} and {@link #MAX_WINDOW_SECONDS}
     */
    public static int windowFor(TickSettings tick, int everyTicks) {
        double period = periodSeconds(tick, everyTicks);
        int window = (int) Math.ceil(2 * period) + 1;
        return Math.max(MIN_WINDOW_SECONDS, Math.min(MAX_WINDOW_SECONDS, window));
    }
}
