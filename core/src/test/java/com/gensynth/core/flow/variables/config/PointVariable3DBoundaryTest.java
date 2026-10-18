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
        // As the 3D editor stores it: the sphere rests on minZ and spans its diameter
        config.range(-40.0, 40.0, -40.0, 40.0, 0.0, 80.0);
        config.shape3DType(PointVariableConfig.Shape3DType.SPHERE);
        config.shape3DRadius(40.0);
        config.boundaryBehavior(BoundaryBehavior.CLAMP);

        double cx = 0.0, cy = 0.0, cz = 40.0;
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
        // As the 3D editor stores it: the sphere rests on minZ and spans its diameter
        config.range(-35.0, 35.0, -35.0, 35.0, 0.0, 70.0);
        config.shape3DType(PointVariableConfig.Shape3DType.SPHERE);
        config.shape3DRadius(35.0);
        config.boundaryBehavior(BoundaryBehavior.BOUNCE);

        double cx = 0.0, cy = 0.0, cz = 35.0;
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
    @SuppressWarnings("unchecked")
    private double[] next() {
        Map<String, Object> p = (Map<String, Object>) config.generateNextValue();
        return new double[] {
            ((Number) p.get("x")).doubleValue(),
            ((Number) p.get("y")).doubleValue(),
            ((Number) p.get("z")).doubleValue()
        };
    }

    @Test
    public void testRandomPointFillsTheSphere() {
        config.pattern(GenerationPattern.RANDOM_POINT)
              .range(-40.0, 40.0, -40.0, 40.0, 0.0, 80.0)
              .shape3DType(PointVariableConfig.Shape3DType.SPHERE)
              .shape3DRadius(40.0);

        int deep = 0;
        for (int i = 0; i < 1000; i++) {
            double[] p = next();
            double d = Math.sqrt(p[0] * p[0] + p[1] * p[1] + (p[2] - 40.0) * (p[2] - 40.0));
            assertTrue("inside the sphere: " + d, d <= 40.0 + 1e-6);
            if (d < 20.0) deep++;
        }
        // A uniform fill puts 12.5 % of the points within half the radius (none if they piled on the surface)
        assertTrue("points fill the volume: " + deep, deep > 50);
    }

    @Test
    public void testRandomPointFillsTheCone() {
        config.pattern(GenerationPattern.RANDOM_POINT)
              .shape3DType(PointVariableConfig.Shape3DType.CONE)
              .shape3DRadius(30.0)
              .shape3DHeight(100.0);

        int deep = 0;
        for (int i = 0; i < 1000; i++) {
            double[] p = next();
            assertTrue("z within the cone", p[2] >= -1e-9 && p[2] <= 100.0 + 1e-9);
            double rAtZ = 30.0 * (1.0 - p[2] / 100.0);
            double dxy = Math.hypot(p[0], p[1]);
            assertTrue("inside the cone at z=" + p[2], dxy <= rAtZ + 1e-6);
            if (dxy < rAtZ * 0.5) deep++;
        }
        assertTrue("points fill the volume: " + deep, deep > 50);
    }

    @Test
    public void testRandomPointFillsThePyramidAndCube() {
        config.pattern(GenerationPattern.RANDOM_POINT)
              .shape3DType(PointVariableConfig.Shape3DType.PYRAMID);

        int deep = 0;
        for (int i = 0; i < 1000; i++) {
            double[] p = next();
            double half = 50.0 * (1.0 - p[2] / 100.0);
            assertTrue("z within the pyramid", p[2] >= -1e-9 && p[2] <= 100.0 + 1e-9);
            assertTrue("inside the pyramid", Math.abs(p[0]) <= half + 1e-6 && Math.abs(p[1]) <= half + 1e-6);
            if (Math.abs(p[0]) < half * 0.5 && Math.abs(p[1]) < half * 0.5) deep++;
        }
        assertTrue("points fill the pyramid: " + deep, deep > 50);

        config.shape3DType(PointVariableConfig.Shape3DType.CUBE);
        for (int i = 0; i < 500; i++) {
            double[] p = next();
            assertTrue(config.isInsideShape3D(p[0], p[1], p[2]));
        }
    }

    @Test
    public void testPyramidWithNegativeHeightHangsFromMaxZ() {
        // The editor stores a downward pyramid with its base at maxZ and its apex at minZ
        config.pattern(GenerationPattern.RANDOM_POINT)
              .range(-50.0, 50.0, -50.0, 50.0, -100.0, 0.0)
              .shape3DType(PointVariableConfig.Shape3DType.PYRAMID)
              .shape3DHeight(-100.0);

        assertTrue("base corner at maxZ", config.isInsideShape3D(49.0, 49.0, -0.5));
        assertFalse("no base at minZ", config.isInsideShape3D(49.0, 49.0, -99.5));
        assertTrue("apex at minZ", config.isInsideShape3D(0.0, 0.0, -100.0));

        for (int i = 0; i < 500; i++) {
            double[] p = next();
            assertTrue("z within [-100, 0]", p[2] >= -100.0 - 1e-9 && p[2] <= 1e-9);
            double half = 50.0 * (1.0 - (p[2] - 0.0) / -100.0);
            assertTrue("inside the hanging pyramid", Math.abs(p[0]) <= half + 1e-6 && Math.abs(p[1]) <= half + 1e-6);
        }
    }

    @Test
    public void testCubeWithUnsetDimensionsIsTheBoundingBox() {
        config.range(10.0, 30.0, -5.0, 5.0, 100.0, 140.0)
              .pattern(GenerationPattern.RANDOM_POINT)
              .shape3DType(PointVariableConfig.Shape3DType.CUBE);

        assertEquals(20.0, config.getShape3DWidth(), 1e-9);
        assertEquals(10.0, config.getShape3DLength(), 1e-9);
        assertEquals(40.0, config.getShape3DHeight(), 1e-9);

        double minX = 30, maxX = 10, minZ = 140, maxZ = 100;
        for (int i = 0; i < 500; i++) {
            double[] p = next();
            assertTrue(p[0] >= 10.0 && p[0] <= 30.0);
            assertTrue(p[1] >= -5.0 && p[1] <= 5.0);
            assertTrue(p[2] >= 100.0 && p[2] <= 140.0);
            minX = Math.min(minX, p[0]);
            maxX = Math.max(maxX, p[0]);
            minZ = Math.min(minZ, p[2]);
            maxZ = Math.max(maxZ, p[2]);
        }
        assertTrue("spreads over the whole box", minX < 12 && maxX > 28 && minZ < 104 && maxZ > 136);
    }

    @Test
    public void testPolygonIsIgnoredIn3D() {
        // A small polygon in one corner: in 3D the cube is the region, so points spread over all of it
        config.pattern(GenerationPattern.RANDOM_POINT)
              .shape3DType(PointVariableConfig.Shape3DType.CUBE)
              .addBoundaryPolygonPoint(-50.0, -50.0, 0.0)
              .addBoundaryPolygonPoint(-40.0, -50.0, 0.0)
              .addBoundaryPolygonPoint(-40.0, -40.0, 0.0)
              .addBoundaryPolygonPoint(-50.0, -40.0, 0.0);

        boolean outsidePolygon = false;
        for (int i = 0; i < 200; i++) {
            double[] p = next();
            if (p[0] > -40.0 || p[1] > -40.0) {
                outsidePolygon = true;
            }
        }
        assertTrue(outsidePolygon);

        config.pattern(GenerationPattern.RANDOM_WALK).maxStepDistance(5.0);
        for (int i = 0; i < 300; i++) {
            double[] p = next();
            assertTrue(config.isInsideShape3D(p[0], p[1], p[2]));
        }
    }

    @Test
    public void testRandomWalkStaysInsideEveryShape() {
        config.maxStepDistance(8.0);
        for (PointVariableConfig.Shape3DType shape : PointVariableConfig.Shape3DType.values()) {
            for (BoundaryBehavior behavior : BoundaryBehavior.values()) {
                config.reset();
                config.shape3DType(shape).boundaryBehavior(behavior);
                if (shape == PointVariableConfig.Shape3DType.SPHERE) {
                    config.range(-40.0, 40.0, -40.0, 40.0, 0.0, 80.0).shape3DRadius(40.0);
                } else {
                    config.range(-50.0, 50.0, -50.0, 50.0, 0.0, 100.0).shape3DRadius(30.0);
                }
                for (int i = 0; i < 300; i++) {
                    double[] p = next();
                    assertTrue(shape + "/" + behavior + " " + p[0] + "," + p[1] + "," + p[2],
                            config.isInsideShape3D(p[0], p[1], p[2]));
                }
            }
        }
    }
}
