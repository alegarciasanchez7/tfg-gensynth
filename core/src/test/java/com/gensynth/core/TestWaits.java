package com.gensynth.core;

import org.awaitility.core.ConditionFactory;

import java.time.Duration;
import java.util.function.LongSupplier;

import static org.awaitility.Awaitility.await;

/**
 * Shared waits for tests of asynchronous code (clocks, engines, dispatchers), built on Awaitility
 * so tests wait for a condition instead of sleeping for a fixed time.
 */
public final class TestWaits {

    /** Longest wait for a condition: generous, so slow CI runners do not make tests flaky. */
    public static final Duration TIMEOUT = Duration.ofSeconds(15);

    private TestWaits() {
    }

    /**
     * Starts a wait for a condition: checked right away, then every few milliseconds, for at
     * most {@link #TIMEOUT}.
     *
     * @return the Awaitility condition factory
     */
    public static ConditionFactory eventually() {
        return await().atMost(TIMEOUT).pollDelay(Duration.ZERO).pollInterval(Duration.ofMillis(5));
    }

    /**
     * Waits until a counter stops changing and stays the same for {@code quiet}, e.g. after
     * stopping something that may still be finishing the work it had started.
     *
     * @param counter the counter to watch
     * @param quiet   how long it must keep the same value
     */
    public static void awaitSettled(LongSupplier counter, Duration quiet) {
        long[] last = {counter.getAsLong()};
        eventually().during(quiet).until(() -> {
            long now = counter.getAsLong();
            boolean unchanged = now == last[0];
            last[0] = now;
            return unchanged;
        });
    }
}
