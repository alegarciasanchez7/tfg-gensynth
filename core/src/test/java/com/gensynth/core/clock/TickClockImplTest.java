package com.gensynth.core.clock;

import com.gensynth.core.model.TickSettings;
import org.junit.After;
import org.junit.Test;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;

import static com.gensynth.core.TestWaits.awaitSettled;
import static com.gensynth.core.TestWaits.eventually;
import static org.junit.Assert.*;

public class TickClockImplTest {

    private static final TickSettings FIVE_MS =
        new TickSettings(TickSettings.Mode.FIXED_RATE, 5, TickSettings.Unit.MILLISECONDS);
    private static final TickSettings AFAP =
        new TickSettings(TickSettings.Mode.AS_FAST_AS_POSSIBLE, 1, TickSettings.Unit.SECONDS);

    private TickClockImpl clock;

    @After
    public void tearDown() {
        if (clock != null) {
            clock.shutdown();
        }
    }

    private static void awaitTrue(String message, BooleanSupplier condition) {
        eventually().alias(message).pollInterval(Duration.ofMillis(1)).until(condition::getAsBoolean);
    }

    /** Busy work of the given length inside a tick, to make overlapping ticks visible. */
    private static void work(Duration length) {
        long end = System.nanoTime() + length.toNanos();
        while (System.nanoTime() < end) {
            Thread.onSpinWait();
        }
    }

    /** Milliseconds the clock takes to emit the given number of ticks after starting it. */
    private long millisToReach(long ticks) {
        long start = System.nanoTime();
        clock.start();
        awaitTrue("expected " + ticks + " ticks", () -> clock.getTickCount() >= ticks);
        long elapsed = (System.nanoTime() - start) / 1_000_000;
        clock.stop();
        return elapsed;
    }

    @Test
    public void fixedRateEmitsSequentialTicks() throws Exception {
        List<Long> ticks = new CopyOnWriteArrayList<>();
        clock = new TickClockImpl(n -> ticks.add(n), FIVE_MS);
        assertFalse(clock.isRunning());

        clock.start();
        assertTrue(clock.isRunning());
        awaitTrue("expected several ticks", () -> ticks.size() >= 5);
        clock.stop();

        for (int i = 0; i < ticks.size(); i++) {
            assertEquals(i + 1L, (long) ticks.get(i));
        }
    }

    @Test
    public void stopFreezesCounterAndStartResetsIt() throws Exception {
        List<Long> ticks = new CopyOnWriteArrayList<>();
        clock = new TickClockImpl(n -> ticks.add(n), FIVE_MS);
        clock.start();
        awaitTrue("expected ticks", () -> clock.getTickCount() >= 3);

        clock.stop();
        assertFalse(clock.isRunning());
        // Once a tick already in progress finishes, the counter does not move any more
        awaitSettled(clock::getTickCount, Duration.ofMillis(50));

        // The first tick after the restart is number 1. Checked on the tick itself, not on the
        // counter after a wait: a slow CI runner may emit several ticks before the check
        ticks.clear();
        clock.start();
        awaitTrue("expected ticks after restart", () -> !ticks.isEmpty());
        assertEquals("counter should restart from zero", 1L, (long) ticks.get(0));
    }

    @Test
    public void applySettingsReschedulesLiveAndKeepsCounting() throws Exception {
        clock = new TickClockImpl(n -> true, FIVE_MS);
        clock.start();
        awaitTrue("expected ticks", () -> clock.getTickCount() >= 2);

        clock.applySettings(AFAP);
        assertTrue(clock.isRunning());
        assertEquals(AFAP, clock.getSettings());
        long afterSwitch = clock.getTickCount();
        awaitTrue("expected AFAP ticks", () -> clock.getTickCount() > afterSwitch + 100);

        clock.applySettings(FIVE_MS);
        long afterSecondSwitch = clock.getTickCount();
        awaitTrue("expected fixed ticks again", () -> clock.getTickCount() > afterSecondSwitch + 2);
        assertTrue(clock.isRunning());
    }

    @Test
    public void ticksNeverOverlapEvenAcrossReschedules() throws Exception {
        AtomicInteger inFlight = new AtomicInteger();
        AtomicInteger maxInFlight = new AtomicInteger();
        clock = new TickClockImpl(n -> {
            int current = inFlight.incrementAndGet();
            maxInFlight.accumulateAndGet(current, Math::max);
            work(Duration.ofMillis(2));
            inFlight.decrementAndGet();
            return true;
        }, new TickSettings(TickSettings.Mode.FIXED_RATE, 1, TickSettings.Unit.MILLISECONDS));

        clock.start();
        for (int i = 0; i < 10; i++) {
            clock.applySettings(i % 2 == 0 ? AFAP : FIVE_MS);
            // Let the clock tick a few times with the new settings before rescheduling it again
            long before = clock.getTickCount();
            awaitTrue("expected ticks after rescheduling", () -> clock.getTickCount() >= before + 2);
        }
        clock.stop();

        assertEquals(1, maxInFlight.get());
    }

    @Test
    public void listenerExceptionDoesNotStopTheClock() throws Exception {
        AtomicLong calls = new AtomicLong();
        clock = new TickClockImpl(n -> {
            calls.incrementAndGet();
            if (n == 2) {
                throw new IllegalStateException("boom");
            }
            return true;
        }, FIVE_MS);

        clock.start();
        awaitTrue("clock should keep ticking after an exception", () -> calls.get() >= 5);
    }

    @Test
    public void asFastAsPossibleIsMuchFasterThanFixedRate() throws Exception {
        clock = new TickClockImpl(n -> true, AFAP);

        // A 5 ms fixed rate would need a full second for 200 ticks
        long millis = millisToReach(200);
        assertTrue("AFAP should emit 200 ticks far sooner, took " + millis + " ms", millis < 500);
    }

    @Test
    public void asFastAsPossibleBacksOffWhenIdle() throws Exception {
        clock = new TickClockImpl(n -> false, AFAP);

        // 1 ms back-off: 100 idle ticks take about 100 ms (at least 25 ms, a generous bound)
        long millis = millisToReach(100);
        assertTrue("idle AFAP should back off, 100 ticks took " + millis + " ms", millis >= 25);
    }

    @Test
    public void sampleTicksPerSecondMeasuresRateAndIsZeroWhenStopped() throws Exception {
        clock = new TickClockImpl(n -> true, new TickSettings(TickSettings.Mode.FIXED_RATE, 10, TickSettings.Unit.MILLISECONDS));
        assertEquals(0.0, clock.sampleTicksPerSecond(), 0.0);

        clock.start();
        clock.sampleTicksPerSecond();
        // About 300 ms of ticks: the rate is measured over the time since the previous sample
        awaitTrue("expected ticks to measure", () -> clock.getTickCount() >= 30);
        double rate = clock.sampleTicksPerSecond();
        assertTrue("expected roughly 100 ticks/s, got " + rate, rate > 40 && rate < 160);

        clock.stop();
        assertEquals(0.0, clock.sampleTicksPerSecond(), 0.0);
    }

    @Test
    public void asFastAsPossibleRecoversQuicklyAfterIdleTicks() throws Exception {
        // Work appears every other tick (e.g. a busy flow freeing up): the adaptive back-off
        // must reset on work instead of always pausing 1 ms
        clock = new TickClockImpl(n -> n % 2 == 0, AFAP);

        // Pausing 1 ms on every idle tick would need at least 250 ms for 500 ticks
        long millis = millisToReach(500);
        assertTrue("expected 500 ticks in far less than 250 ms, took " + millis + " ms", millis < 150);
    }
}
