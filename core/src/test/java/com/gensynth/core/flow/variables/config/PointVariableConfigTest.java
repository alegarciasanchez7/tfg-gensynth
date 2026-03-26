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

        assertEquals(new PointVariableConfig.Point3D(1.0, 2.0, 3.0), v1);
        assertEquals(new PointVariableConfig.Point3D(1.0, 2.0, 3.0), v2);
    }

    @Test
    public void testRandomPointPatternWithinRange() {
        config.pattern(GenerationPattern.RANDOM_POINT)
            .range(10.0, 20.0, 30.0, 40.0, 50.0, 60.0);

        for (int i = 0; i < 30; i++) {
            PointVariableConfig.Point3D p = (PointVariableConfig.Point3D) config.generateNextValue();
            assertTrue(p.x >= 10.0 && p.x <= 20.0);
            assertTrue(p.y >= 30.0 && p.y <= 40.0);
            assertTrue(p.z >= 50.0 && p.z <= 60.0);
        }
    }

    @Test
    public void testPathInterpolatorTwoSteps() {
        config.pattern(GenerationPattern.PATH_INTERPOLATOR)
            .addPathPoint(0.0, 0.0, 0.0)
            .addPathPoint(10.0, 0.0, 0.0)
            .interpolationSteps(2);

        PointVariableConfig.Point3D v1 = (PointVariableConfig.Point3D) config.generateNextValue();
        PointVariableConfig.Point3D v2 = (PointVariableConfig.Point3D) config.generateNextValue();
        PointVariableConfig.Point3D v3 = (PointVariableConfig.Point3D) config.generateNextValue();

        assertEquals(new PointVariableConfig.Point3D(0.0, 0.0, 0.0), v1);
        assertEquals(new PointVariableConfig.Point3D(10.0, 0.0, 0.0), v2);
        assertEquals(new PointVariableConfig.Point3D(10.0, 0.0, 0.0), v3);
    }

    @Test
    public void testPathInterpolatorThreeSteps() {
        config.pattern(GenerationPattern.PATH_INTERPOLATOR)
            .addPathPoint(0.0, 0.0, 0.0)
            .addPathPoint(9.0, 0.0, 0.0)
            .interpolationSteps(3);

        PointVariableConfig.Point3D v1 = (PointVariableConfig.Point3D) config.generateNextValue();
        PointVariableConfig.Point3D v2 = (PointVariableConfig.Point3D) config.generateNextValue();
        PointVariableConfig.Point3D v3 = (PointVariableConfig.Point3D) config.generateNextValue();

        assertEquals(new PointVariableConfig.Point3D(0.0, 0.0, 0.0), v1);
        assertEquals(new PointVariableConfig.Point3D(4.5, 0.0, 0.0), v2);
        assertEquals(new PointVariableConfig.Point3D(9.0, 0.0, 0.0), v3);
    }

    @Test
    public void testPathInterpolatorWithEmptyPathReturnsFixed() {
        config.pattern(GenerationPattern.PATH_INTERPOLATOR).fixedPoint(3.0, 4.0, 5.0);

        Object value = config.generateNextValue();
        assertEquals(new PointVariableConfig.Point3D(3.0, 4.0, 5.0), value);
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

        assertEquals(new PointVariableConfig.Point3D(1.0, 1.0, 1.0), v1);
        assertEquals(anomalyPoint, v2);
        assertEquals(new PointVariableConfig.Point3D(1.0, 1.0, 1.0), v3);
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
        assertEquals(anomalyPoint, v1);
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
