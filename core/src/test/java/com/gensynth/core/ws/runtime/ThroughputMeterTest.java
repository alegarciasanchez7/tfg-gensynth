package com.gensynth.core.ws.runtime;

import com.gensynth.core.model.TickSettings;
import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.*;

public class ThroughputMeterTest {

    private static final long SECOND = 1_000_000_000L;
    private static final TickSettings ONE_SECOND = TickSettings.defaults();
    private static final TickSettings AFAP =
        new TickSettings(TickSettings.Mode.AS_FAST_AS_POSSIBLE, 1, TickSettings.Unit.SECONDS);

    /**
     * Simulates a flow sending at the given times (nanos) and returns the rate measured at
     * {@code untilSecond}, rotating the meter once per second like the metrics task.
     */
    private static double simulate(long[] sendTimes, int untilSecond, int window, double period) {
        ThroughputMeter meter = new ThroughputMeter();
        int next = 0;
        for (int second = 1; second <= untilSecond; second++) {
            long end = second * SECOND;
            while (next < sendTimes.length && sendTimes[next] < end) {
                meter.recordSend(sendTimes[next++]);
            }
            meter.rotate();
        }
        return meter.rate(window, period, untilSecond * SECOND);
    }

    private static long[] regular(double startSeconds, double intervalSeconds, int count) {
        long[] times = new long[count];
        for (int i = 0; i < count; i++) {
            times[i] = (long) ((startSeconds + i * intervalSeconds) * SECOND);
        }
        return times;
    }

    @Test
    public void emptyMeterReportsZero() {
        ThroughputMeter meter = new ThroughputMeter();
        assertEquals(0.0, meter.rate(5, 1, 0), 0.0);
        meter.rotate();
        assertEquals(0.0, meter.rate(5, 1, SECOND), 0.0);
    }

    @Test
    public void slowFlowReportsItsExactRateFromTheFirstSecond() {
        long[] everyFiveSeconds = regular(0.2, 5, 20);
        assertEquals(0.2, simulate(everyFiveSeconds, 1, 11, 5), 1e-9);
        assertEquals(0.2, simulate(everyFiveSeconds, 30, 11, 5), 1e-9);
    }

    @Test
    public void oneMessagePerSecondIsStable() {
        long[] perSecond = regular(0.3, 1, 100);
        for (int second = 5; second < 60; second++) {
            assertEquals("at second " + second, 1.0, simulate(perSecond, second, 5, 1), 1e-9);
        }
    }

    @Test
    public void fastFlowIsMeasured() {
        long[] hundredPerSecond = regular(0.001, 0.01, 1000);
        assertEquals(100.0, simulate(hundredPerSecond, 8, 5, 0), 1.0);
    }

    @Test
    public void rateDecaysWhenTheFlowStopsSending() {
        long[] fiveMessages = regular(0.5, 1, 5); // last send at 4.5 s
        double whileSending = simulate(fiveMessages, 5, 5, 1);
        double afterStopping = simulate(fiveMessages, 8, 5, 1);
        assertEquals(1.0, whileSending, 1e-9);
        assertTrue("rate should drop after the flow stops, got " + afterStopping, afterStopping < 0.6);
        assertEquals(0.0, simulate(fiveMessages, 11, 5, 1), 0.0);
    }

    @Test
    public void resetForgetsEverything() {
        ThroughputMeter meter = new ThroughputMeter();
        meter.recordSend(SECOND / 2);
        meter.rotate();
        meter.reset();
        meter.rotate();
        assertEquals(0.0, meter.rate(5, 1, 2 * SECOND), 0.0);
    }

    @Test
    public void windowAndPeriodFollowTheTickSettings() {
        assertEquals(1.0, ThroughputMeter.periodSeconds(ONE_SECOND, 1), 0.0);
        assertEquals(5.0, ThroughputMeter.periodSeconds(ONE_SECOND, 5), 0.0);
        assertEquals(0.0, ThroughputMeter.periodSeconds(AFAP, 5), 0.0);

        assertEquals(ThroughputMeter.MIN_WINDOW_SECONDS, ThroughputMeter.windowFor(ONE_SECOND, 1));
        assertEquals(11, ThroughputMeter.windowFor(ONE_SECOND, 5));
        assertEquals(ThroughputMeter.MAX_WINDOW_SECONDS, ThroughputMeter.windowFor(ONE_SECOND, 100));
        assertEquals(ThroughputMeter.MIN_WINDOW_SECONDS, ThroughputMeter.windowFor(AFAP, 100));
    }

    @Test
    public void flowIsDueEveryNTicksFromItsStartTick() {
        FlowRuntime flow = new FlowRuntime("f", "f", "file", "connected", 0, 0, false, null,
            1000, 1, "t", "localhost", 0, "{}", "json", true, Map.of());
        assertTrue(flow.isDueOn(1, 1));
        assertTrue(flow.isDueOn(2, 1));

        flow.everyTicks = 3;
        boolean[] expected = {true, false, false, true, false, false, true};
        for (int tick = 1; tick <= 7; tick++) {
            assertEquals("tick " + tick, expected[tick - 1], flow.isDueOn(tick, 1));
        }
        assertTrue(flow.isDueOn(10, 10));
        assertFalse(flow.isDueOn(11, 10));
        assertTrue(flow.isDueOn(13, 10));
    }
}
