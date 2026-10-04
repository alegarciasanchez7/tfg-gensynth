package com.gensynth.core.clock;

import com.gensynth.core.model.TickSettings;
import org.junit.After;
import org.junit.Test;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;

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

    private static void awaitTrue(String message, BooleanSupplier condition) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 3000;
        while (!condition.getAsBoolean()) {
            if (System.currentTimeMillis() > deadline) {
                fail(message);
            }
            Thread.sleep(5);
        }
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
        clock = new TickClockImpl(n -> true, FIVE_MS);
        clock.start();
        awaitTrue("expected ticks", () -> clock.getTickCount() >= 3);

        clock.stop();
        assertFalse(clock.isRunning());
        Thread.sleep(30); // let a tick already in progress finish
        long frozen = clock.getTickCount();
        Thread.sleep(50);
        assertEquals(frozen, clock.getTickCount());

        clock.start();
        awaitTrue("expected ticks after restart", () -> clock.getTickCount() >= 1);
        assertTrue("counter should restart from zero", clock.getTickCount() < frozen + 3);
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
            try {
                Thread.sleep(2);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            inFlight.decrementAndGet();
            return true;
        }, new TickSettings(TickSettings.Mode.FIXED_RATE, 1, TickSettings.Unit.MILLISECONDS));

        clock.start();
        for (int i = 0; i < 10; i++) {
            clock.applySettings(i % 2 == 0 ? AFAP : FIVE_MS);
            Thread.sleep(10);
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
        clock.start();
        Thread.sleep(100);
        long ticks = clock.getTickCount();
        clock.stop();

        // A 5 ms fixed rate would give about 20 ticks in 100 ms
        assertTrue("AFAP should emit far more ticks, got " + ticks, ticks > 200);
    }

    @Test
    public void asFastAsPossibleBacksOffWhenIdle() throws Exception {
        clock = new TickClockImpl(n -> false, AFAP);
        clock.start();
        Thread.sleep(100);
        long ticks = clock.getTickCount();
        clock.stop();

        // 1 ms back-off: at most ~100 idle ticks in 100 ms (generous bound for slow machines)
        assertTrue("idle AFAP should back off, got " + ticks, ticks < 400);
    }

    @Test
    public void sampleTicksPerSecondMeasuresRateAndIsZeroWhenStopped() throws Exception {
        clock = new TickClockImpl(n -> true, new TickSettings(TickSettings.Mode.FIXED_RATE, 10, TickSettings.Unit.MILLISECONDS));
        assertEquals(0.0, clock.sampleTicksPerSecond(), 0.0);

        clock.start();
        clock.sampleTicksPerSecond();
        Thread.sleep(300);
        double rate = clock.sampleTicksPerSecond();
        assertTrue("expected roughly 100 ticks/s, got " + rate, rate > 40 && rate < 160);

        clock.stop();
        assertEquals(0.0, clock.sampleTicksPerSecond(), 0.0);
    }
}
