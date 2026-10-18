package com.gensynth.core.ws.runtime;

import com.gensynth.core.model.FlowDefinition;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/**
 * Tests the event loss rules of {@link FlowRuntime}: periodic outages and the random loss.
 */
public class FlowRuntimeTest {

    private static FlowRuntime newFlow() {
        return new FlowRuntime("f", "Flow", "file", "connected", 0, 0, false, null,
            1000, 1, "t", "localhost", 0, "{}", "json", true, Map.of());
    }

    private static List<Long> outageTicks(FlowRuntime flow, long upTo) {
        List<Long> ticks = new ArrayList<>();
        for (long tick = 0; tick < upTo; tick++) {
            if (flow.isInOutage(tick)) {
                ticks.add(tick);
            }
        }
        return ticks;
    }

    @Test
    public void outageCoversTheLastTicksOfEveryPeriod() {
        FlowRuntime flow = newFlow();
        flow.outageEveryTicks.set(4);
        flow.outageDurationTicks.set(2);

        assertEquals(List.of(2L, 3L, 6L, 7L), outageTicks(flow, 8));
    }

    @Test
    public void outageLongerThanThePeriodLosesEveryTick() {
        FlowRuntime flow = newFlow();
        flow.outageEveryTicks.set(3);
        flow.outageDurationTicks.set(5);

        assertEquals(List.of(0L, 1L, 2L, 3L, 4L, 5L), outageTicks(flow, 6));
    }

    @Test
    public void outageIsOffWhenEitherValueIsZero() {
        FlowRuntime flow = newFlow();
        assertTrue("defaults are off", outageTicks(flow, 10).isEmpty());

        flow.outageEveryTicks.set(4);
        assertTrue("no duration", outageTicks(flow, 10).isEmpty());

        flow.outageEveryTicks.set(0);
        flow.outageDurationTicks.set(2);
        assertTrue("no period", outageTicks(flow, 10).isEmpty());
    }

    @Test
    public void shouldDropFollowsTheLossPercentage() {
        FlowRuntime flow = newFlow();
        assertFalse("0 % never drops", flow.shouldDrop(0, 0.0));

        flow.lossPercent = 100;
        assertTrue("100 % always drops", flow.shouldDrop(0, 99.999));
        assertTrue(flow.shouldDrop(0, 0.0));

        flow.lossPercent = 25;
        assertTrue(flow.shouldDrop(0, 24.9));
        assertFalse(flow.shouldDrop(0, 25.0));
    }

    @Test
    public void shouldDropAlwaysDuringAnOutage() {
        FlowRuntime flow = newFlow();
        flow.outageEveryTicks.set(4);
        flow.outageDurationTicks.set(1);

        assertTrue(flow.shouldDrop(3, 99.0));
        assertFalse(flow.shouldDrop(2, 99.0));
    }

    @Test
    public void eventLossSurvivesDefinitionRoundTripAndCopy() {
        FlowRuntime flow = newFlow();
        flow.everyTicks.set(3);
        flow.lossPercent = 12.5;
        flow.outageEveryTicks.set(10);
        flow.outageDurationTicks.set(2);

        FlowRuntime loaded = FlowRuntime.fromDefinition(flow.toDefinition("g"));
        assertEquals(12.5, loaded.lossPercent, 0.0);
        assertEquals(10, loaded.outageEveryTicks.get());
        assertEquals(2, loaded.outageDurationTicks.get());

        FlowRuntime copy = newFlow();
        copy.copySendSettingsFrom(flow);
        assertEquals(3, copy.everyTicks.get());
        assertEquals(12.5, copy.lossPercent, 0.0);
        assertEquals(10, copy.outageEveryTicks.get());
        assertEquals(2, copy.outageDurationTicks.get());

        Map<String, Object> payload = flow.toPayload();
        assertEquals(12.5, payload.get("lossPercent"));
        assertEquals(10, payload.get("outageEveryTicks"));
        assertEquals(2, payload.get("outageDurationTicks"));
    }

    @Test
    public void droppedIsResetWithTheOtherCounters() {
        FlowRuntime flow = newFlow();
        flow.dropped.set(5);
        flow.resetCounters();
        assertEquals(0, flow.dropped.get());
    }

    @Test
    public void lossPercentIsClamped() {
        assertEquals(0.0, FlowDefinition.clampPercent(Double.NaN), 0.0);
        assertEquals(0.0, FlowDefinition.clampPercent(-3), 0.0);
        assertEquals(100.0, FlowDefinition.clampPercent(250), 0.0);
        assertEquals(42.5, FlowDefinition.clampPercent(42.5), 0.0);
    }
}
