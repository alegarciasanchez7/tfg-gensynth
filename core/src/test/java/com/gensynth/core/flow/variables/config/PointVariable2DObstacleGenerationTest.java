package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import org.junit.Before;
import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.*;

/**
 * Exhaustive unit test suite for 2D spatial Point variable generation
 * with wall barriers and interior obstacle polygons.
 */
public class PointVariable2DObstacleGenerationTest {

    private PointVariableConfig config;

    @Before
    public void setUp() {
        config = new PointVariableConfig()
                .identifier("test_2d_obstacles_point")
                .coordinateSystem(CoordinateSystem.CARTESIAN_2D)
                .range(0.0, 100.0, 0.0, 100.0, 0.0, 0.0);
    }

    @Test
    public void testRandomPointExcludesForbiddenInteriorPolygon() {
        // Outer boundary: [0, 100] x [0, 100]
        // Interior forbidden obstacle zone: [40, 60] x [40, 60]
        BoundaryObstacle holeObstacle = new BoundaryObstacle()
                .name("Forbidden Room Zone")
                .type(BoundaryObstacle.ObstacleType.OBSTACLE_POLYGON)
                .addPoint(40.0, 40.0, 0.0)
                .addPoint(60.0, 40.0, 0.0)
                .addPoint(60.0, 60.0, 0.0)
                .addPoint(40.0, 60.0, 0.0);

        config.pattern(GenerationPattern.RANDOM_POINT)
              .addObstacle(holeObstacle);

        for (int i = 0; i < 200; i++) {
            @SuppressWarnings("unchecked")
            Map<String, Object> val = (Map<String, Object>) config.generateNextValue();
            double x = (Double) val.get("x");
            double y = (Double) val.get("y");

            // Point must be inside outer bounds [0, 100]
            assertTrue("x must be >= 0.0", x >= 0.0);
            assertTrue("x must be <= 100.0", x <= 100.0);
            assertTrue("y must be >= 0.0", y >= 0.0);
            assertTrue("y must be <= 100.0", y <= 100.0);

            // Point MUST NOT be strictly inside the forbidden obstacle polygon [40, 60] x [40, 60]
            boolean insideObstacle = (x > 40.0 && x < 60.0 && y > 40.0 && y < 60.0);
            assertFalse("Point (" + x + ", " + y + ") must NOT land inside forbidden obstacle polygon", insideObstacle);
        }
    }

    @Test
    public void testRandomWalkBlockedByWallSegment() {
        // Wall barrier extending vertically from (50, 0) to (50, 100)
        BoundaryObstacle wall = new BoundaryObstacle()
                .name("Center Dividing Wall")
                .type(BoundaryObstacle.ObstacleType.WALL_SEGMENT)
                .addPoint(50.0, 0.0, 0.0)
                .addPoint(50.0, 100.0, 0.0);

        config.pattern(GenerationPattern.RANDOM_WALK)
              .fixedPoint(20.0, 50.0, 0.0)
              .boundaryBehavior(BoundaryBehavior.CLAMP)
              .maxStepDistance(15.0)
              .addObstacle(wall);

        for (int i = 0; i < 150; i++) {
            @SuppressWarnings("unchecked")
            Map<String, Object> val = (Map<String, Object>) config.generateNextValue();
            double x = (Double) val.get("x");

            // Since initial point starts at x=20 and wall is at x=50, random walk must not cross the wall (x <= 50)
            assertTrue("Random walk starting at x=20 must not cross wall at x=50", x <= 50.0);
        }
    }

    @Test
    public void testDisabledObstacleIsIgnored() {
        BoundaryObstacle wall = new BoundaryObstacle()
                .name("Disabled Wall")
                .type(BoundaryObstacle.ObstacleType.WALL_SEGMENT)
                .addPoint(50.0, 0.0, 0.0)
                .addPoint(50.0, 100.0, 0.0)
                .enabled(false);

        config.pattern(GenerationPattern.RANDOM_POINT)
              .addObstacle(wall);

        boolean generatedAcrossWall = false;
        for (int i = 0; i < 100; i++) {
            @SuppressWarnings("unchecked")
            Map<String, Object> val = (Map<String, Object>) config.generateNextValue();
            double x = (Double) val.get("x");
            if (x > 50.0) {
                generatedAcrossWall = true;
                break;
            }
        }
        assertTrue("Points can land on both sides when wall obstacle is disabled", generatedAcrossWall);
    }
}

