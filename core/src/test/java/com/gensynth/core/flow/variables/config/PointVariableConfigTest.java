package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import org.junit.Before;
import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.*;

public class PointVariableConfigTest {

    private PointVariableConfig config;

    @Before
    public void setUp() {
        config = new PointVariableConfig().identifier("point_sensor");
    }

    @Test
    public void testPointConfigCreation() {
        assertEquals("point_sensor", config.getIdentifier());
        assertEquals(VariableType.POINT, config.getType());
    }

    @Test
    public void testFixedPointPattern() {
        config.pattern(GenerationPattern.FIXED_POINT).fixedPoint(1.0, 2.0, 3.0);

        Object v1 = config.generateNextValue();
        Object v2 = config.generateNextValue();

        assertEquals(Map.of("x", 1.0, "y", 2.0, "z", 3.0), v1);
        assertEquals(Map.of("x", 1.0, "y", 2.0, "z", 3.0), v2);
    }

    @Test
    public void testRandomPointPatternWithinRange() {
        config.pattern(GenerationPattern.RANDOM_POINT)
            .range(10.0, 20.0, 30.0, 40.0, 50.0, 60.0);

        for (int i = 0; i < 30; i++) {
            @SuppressWarnings("unchecked")
            Map<String, Double> p = (Map<String, Double>) config.generateNextValue();
            assertTrue(p.get("x") >= 10.0 && p.get("x") <= 20.0);
            assertTrue(p.get("y") >= 30.0 && p.get("y") <= 40.0);
            assertTrue(p.get("z") >= 50.0 && p.get("z") <= 60.0);
        }
    }

    @Test
    public void testPathInterpolatorTwoSteps() {
        config.pattern(GenerationPattern.PATH_INTERPOLATOR)
            .addPathPoint(0.0, 0.0, 0.0)
            .addPathPoint(10.0, 0.0, 0.0)
            .interpolationSteps(2);

        // Each segment takes 2 ticks and each waypoint appears once; loop on returns to the first one
        Object v1 = config.generateNextValue();
        Object v2 = config.generateNextValue();
        Object v3 = config.generateNextValue();
        Object v4 = config.generateNextValue();
        Object v5 = config.generateNextValue();

        assertEquals(Map.of("x", 0.0, "y", 0.0, "z", 0.0), v1);
        assertEquals(Map.of("x", 5.0, "y", 0.0, "z", 0.0), v2);
        assertEquals(Map.of("x", 10.0, "y", 0.0, "z", 0.0), v3);
        assertEquals(Map.of("x", 5.0, "y", 0.0, "z", 0.0), v4);
        assertEquals(Map.of("x", 0.0, "y", 0.0, "z", 0.0), v5);
    }

    @Test
    public void testPathInterpolatorThreeSteps() {
        config.pattern(GenerationPattern.PATH_INTERPOLATOR)
            .addPathPoint(0.0, 0.0, 0.0)
            .addPathPoint(9.0, 0.0, 0.0)
            .interpolationSteps(3);

        Object v1 = config.generateNextValue();
        Object v2 = config.generateNextValue();
        Object v3 = config.generateNextValue();
        Object v4 = config.generateNextValue();

        assertEquals(Map.of("x", 0.0, "y", 0.0, "z", 0.0), v1);
        assertEquals(Map.of("x", 3.0, "y", 0.0, "z", 0.0), v2);
        assertEquals(Map.of("x", 6.0, "y", 0.0, "z", 0.0), v3);
        assertEquals(Map.of("x", 9.0, "y", 0.0, "z", 0.0), v4);
    }

    @Test
    public void testWaypointsWithoutLoopStopOnTheLastOne() {
        config.pattern(GenerationPattern.WAYPOINT_NAVIGATION)
            .addPathPoint(0.0, 0.0, 0.0)
            .addPathPoint(10.0, 0.0, 0.0)
            .addPathPoint(10.0, 10.0, 0.0)
            .interpolationSteps(2)
            .loopPath(false);

        double[][] expected = { {0, 0}, {5, 0}, {10, 0}, {10, 5}, {10, 10}, {10, 10}, {10, 10} };
        for (double[] e : expected) {
            @SuppressWarnings("unchecked")
            Map<String, Double> p = (Map<String, Double>) config.generateNextValue();
            assertEquals(e[0], p.get("x"), 1e-9);
            assertEquals(e[1], p.get("y"), 1e-9);
        }
    }

    @Test
    public void testWaypointsWithOneStepVisitEachWaypointOnce() {
        config.pattern(GenerationPattern.WAYPOINT_NAVIGATION)
            .addPathPoint(1.0, 0.0, 0.0)
            .addPathPoint(2.0, 0.0, 0.0)
            .addPathPoint(3.0, 0.0, 0.0)
            .interpolationSteps(1)
            .loopPath(true);

        double[] expectedX = { 1, 2, 3, 1, 2, 3, 1 };
        for (double e : expectedX) {
            @SuppressWarnings("unchecked")
            Map<String, Double> p = (Map<String, Double>) config.generateNextValue();
            assertEquals(e, p.get("x"), 1e-9);
        }

        // Loop off: the walk ends on the last waypoint and stays there
        config.loopPath(false).reset();
        double[] expectedNoLoop = { 1, 2, 3, 3, 3 };
        for (double e : expectedNoLoop) {
            @SuppressWarnings("unchecked")
            Map<String, Double> p = (Map<String, Double>) config.generateNextValue();
            assertEquals(e, p.get("x"), 1e-9);
        }
    }

    @Test
    public void testWaypointsLoopClosesLastToFirst() {
        config.pattern(GenerationPattern.WAYPOINT_NAVIGATION)
            .addPathPoint(0.0, 0.0, 0.0)
            .addPathPoint(10.0, 0.0, 0.0)
            .addPathPoint(10.0, 10.0, 0.0)
            .interpolationSteps(2)
            .loopPath(true);

        for (int i = 0; i < 5; i++) {
            config.generateNextValue(); // (0,0) (5,0) (10,0) (10,5) (10,10)
        }
        @SuppressWarnings("unchecked")
        Map<String, Double> closing = (Map<String, Double>) config.generateNextValue();
        @SuppressWarnings("unchecked")
        Map<String, Double> back = (Map<String, Double>) config.generateNextValue();
        assertEquals(5.0, closing.get("x"), 1e-9);
        assertEquals(5.0, closing.get("y"), 1e-9);
        assertEquals(0.0, back.get("x"), 1e-9);
        assertEquals(0.0, back.get("y"), 1e-9);
    }

    @Test
    public void testEmptyWaypointsWithoutFixedPointUseTheCentre() {
        config.pattern(GenerationPattern.WAYPOINT_NAVIGATION)
            .range(0.0, 100.0, 0.0, 50.0, 0.0, 10.0);

        assertEquals(Map.of("x", 50.0, "y", 25.0, "z", 5.0), config.generateNextValue());
    }

    @Test
    public void testPathInterpolatorWithEmptyPathReturnsFixed() {
        config.pattern(GenerationPattern.PATH_INTERPOLATOR).fixedPoint(3.0, 4.0, 5.0);

        Object value = config.generateNextValue();
        assertEquals(Map.of("x", 3.0, "y", 4.0, "z", 5.0), value);
    }

    @Test
    public void testReset() {
        config.pattern(GenerationPattern.PATH_INTERPOLATOR)
            .addPathPoint(0.0, 0.0, 0.0)
            .addPathPoint(10.0, 0.0, 0.0)
            .interpolationSteps(3);

        config.generateNextValue();
        config.generateNextValue();

        assertTrue(config.getTickCounter() > 0);

        config.reset();
        assertEquals(0, config.getTickCounter());
    }

    @Test
    public void testAnomalyTickBased() {
        PointVariableConfig.Point3D anomalyPoint = new PointVariableConfig.Point3D(999.0, 999.0, 999.0);

        AnomalyConfig anomaly = new AnomalyConfig()
            .type(AnomalyType.MAKE_AND_BACK)
            .whenTicks(2)
            .anomalousValue(anomalyPoint);
        anomaly.setEnabled(true);

        config.pattern(GenerationPattern.FIXED_POINT)
            .fixedPoint(1.0, 1.0, 1.0)
            .anomaly(anomaly);

        Object v1 = config.generateNextValue();
        Object v2 = config.generateNextValue();
        Object v3 = config.generateNextValue();

        assertEquals(Map.of("x", 1.0, "y", 1.0, "z", 1.0), v1);
        assertEquals(Map.of("x", 999.0, "y", 999.0, "z", 999.0), v2);
        assertEquals(Map.of("x", 1.0, "y", 1.0, "z", 1.0), v3);
    }

    @Test
    public void testAnomalyProbabilityBased() {
        PointVariableConfig.Point3D anomalyPoint = new PointVariableConfig.Point3D(777.0, 777.0, 777.0);

        AnomalyConfig anomaly = new AnomalyConfig()
            .type(AnomalyType.MAKE_AND_BACK)
            .probabilityRatio(100.0)
            .anomalousValue(anomalyPoint);
        anomaly.setEnabled(true);

        config.pattern(GenerationPattern.FIXED_POINT)
            .fixedPoint(1.0, 1.0, 1.0)
            .anomaly(anomaly);

        Object v1 = config.generateNextValue();
        assertEquals(Map.of("x", 777.0, "y", 777.0, "z", 777.0), v1);
    }

    @Test
    public void testToMap() {
        Map<String, Object> map = config.pattern(GenerationPattern.RANDOM_POINT).toMap();

        assertEquals("point_sensor", map.get("identifier"));
        assertEquals("POINT", map.get("type"));
        assertEquals("RANDOM_POINT", map.get("pattern"));
    }

    @Test
    public void testFactoryIntegration() {
        PointVariableConfig pointConfig = VariableFactory.createPoint("factory_point")
            .pattern(GenerationPattern.FIXED_POINT)
            .fixedPoint(8.0, 9.0, 10.0);

        assertNotNull(pointConfig);
        assertEquals("factory_point", pointConfig.getIdentifier());
        assertEquals(VariableType.POINT, pointConfig.getType());
        assertNotNull(pointConfig.generateNextValue());
    }
}
