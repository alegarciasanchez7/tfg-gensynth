package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.BoundaryBehavior;
import com.gensynth.core.flow.variables.CoordinateSystem;
import com.gensynth.core.flow.variables.GenerationPattern;
import org.junit.Before;
import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.*;

/**
 * Exhaustive unit tests for 3D volume boundary shapes (Cube, Pyramid, Cone, Sphere, Custom)
 * and boundary behaviors (CLAMP, BOUNCE, WRAP).
 */
public class PointVariable3DBoundaryTest {

    private PointVariableConfig config;

    @Before
    public void setUp() {
        config = new PointVariableConfig();
        config.coordinateSystem(CoordinateSystem.CARTESIAN_3D);
        config.pattern(GenerationPattern.RANDOM_WALK);
        config.range(-50.0, 50.0, -50.0, 50.0, 0.0, 100.0);
    }

    @Test
    @SuppressWarnings("unchecked")
    public void testCube3DBoundaries() {
        config.shape3DType(PointVariableConfig.Shape3DType.CUBE);
        config.boundaryBehavior(BoundaryBehavior.CLAMP);

        for (int i = 0; i < 300; i++) {
            Map<String, Object> point = (Map<String, Object>) config.generateNextValue();
            double x = ((Number) point.get("x")).doubleValue();
            double y = ((Number) point.get("y")).doubleValue();
            double z = ((Number) point.get("z")).doubleValue();

            assertTrue("X within [-50, 50]", x >= -50.0 && x <= 50.0);
            assertTrue("Y within [-50, 50]", y >= -50.0 && y <= 50.0);
            assertTrue("Z within [0, 100]", z >= 0.0 && z <= 100.0);
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    public void testSphere3DBoundaries() {
        config.shape3DType(PointVariableConfig.Shape3DType.SPHERE);
        config.shape3DRadius(40.0);
        config.boundaryBehavior(BoundaryBehavior.CLAMP);

        double cx = 0.0, cy = 0.0, cz = 50.0;
        double radius = 40.0 + 1e-3;

        for (int i = 0; i < 300; i++) {
            Map<String, Object> point = (Map<String, Object>) config.generateNextValue();
            double x = ((Number) point.get("x")).doubleValue();
            double y = ((Number) point.get("y")).doubleValue();
            double z = ((Number) point.get("z")).doubleValue();

            double dist = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2) + Math.pow(z - cz, 2));
            assertTrue("Point inside sphere radius: dist=" + dist, dist <= radius);
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    public void testCone3DBoundaries() {
        config.shape3DType(PointVariableConfig.Shape3DType.CONE);
        config.shape3DRadius(30.0);
        config.boundaryBehavior(BoundaryBehavior.CLAMP);

        double cx = 0.0, cy = 0.0;

        for (int i = 0; i < 300; i++) {
            Map<String, Object> point = (Map<String, Object>) config.generateNextValue();
            double x = ((Number) point.get("x")).doubleValue();
            double y = ((Number) point.get("y")).doubleValue();
            double z = ((Number) point.get("z")).doubleValue();

            assertTrue("Z in altitude bounds", z >= 0.0 && z <= 100.0);
            double normZ = Math.max(0.0, Math.min(1.0, (z - 0.0) / 100.0));
            double radiusAtZ = 30.0 * (1.0 - normZ) + 1e-3;
            double distXY = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));

            assertTrue("Point within cone radius at altitude Z=" + z + ", distXY=" + distXY + ", maxR=" + radiusAtZ, distXY <= radiusAtZ);
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    public void testPyramid3DBoundaries() {
        config.shape3DType(PointVariableConfig.Shape3DType.PYRAMID);
        config.boundaryBehavior(BoundaryBehavior.CLAMP);

        for (int i = 0; i < 300; i++) {
            Map<String, Object> point = (Map<String, Object>) config.generateNextValue();
            double x = ((Number) point.get("x")).doubleValue();
            double y = ((Number) point.get("y")).doubleValue();
            double z = ((Number) point.get("z")).doubleValue();

            assertTrue("Z in altitude bounds", z >= 0.0 && z <= 100.0);
            double scale = 1.0 - Math.max(0.0, Math.min(1.0, z / 100.0));
            double halfX = 50.0 * scale + 1e-3;
            double halfY = 50.0 * scale + 1e-3;

            assertTrue("X in pyramid bounds", Math.abs(x) <= halfX);
            assertTrue("Y in pyramid bounds", Math.abs(y) <= halfY);
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    public void testSphereBounceBehavior() {
        config.shape3DType(PointVariableConfig.Shape3DType.SPHERE);
        config.shape3DRadius(35.0);
        config.boundaryBehavior(BoundaryBehavior.BOUNCE);

        double cx = 0.0, cy = 0.0, cz = 50.0;
        double radius = 35.0 + 1e-3;

        for (int i = 0; i < 300; i++) {
            Map<String, Object> point = (Map<String, Object>) config.generateNextValue();
            double x = ((Number) point.get("x")).doubleValue();
            double y = ((Number) point.get("y")).doubleValue();
            double z = ((Number) point.get("z")).doubleValue();

            double dist = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2) + Math.pow(z - cz, 2));
            assertTrue("Point inside sphere after bounce", dist <= radius);
        }
    }
}
