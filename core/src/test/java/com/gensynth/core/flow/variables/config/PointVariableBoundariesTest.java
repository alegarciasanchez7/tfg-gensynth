package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.BoundaryBehavior;
import com.gensynth.core.flow.variables.CoordinateSystem;
import com.gensynth.core.flow.variables.GenerationPattern;
import com.gensynth.core.flow.variables.config.BoundaryObstacle.ObstacleType;
import com.gensynth.core.flow.variables.config.PointVariableConfig.Point3D;
import com.gensynth.core.flow.variables.config.PointVariableConfig.Shape3DType;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/**
 * Boundary behaviour per region (2D/Geo box, cube, sphere, cone, pyramid) and wall/obstacle
 * crossing. A circular orbit is deterministic: its first point is (centre.x + radius, centre.y,
 * centre.z), so an orbit centred on the region with a large radius starts outside it.
 */
public class PointVariableBoundariesTest {

    private static final double EPS = 1e-9;

    /** First orbit point, bounded by a 0..100 Cartesian 3D region. */
    private static Map<?, ?> firstOrbitPoint3D(Shape3DType shape, BoundaryBehavior behavior,
                                               double centreZ, double radius, PointVariableConfig shapeDims) {
        PointVariableConfig config = shapeDims
            .pattern(GenerationPattern.CIRCULAR_ORBIT)
            .coordinateSystem(CoordinateSystem.CARTESIAN_3D)
            .shape3DType(shape)
            .boundaryBehavior(behavior)
            .orbitRadius(radius)
            .orbitCenter(50, 50, centreZ)
            .range(0, 100, 0, 100, 0, 100);
        return (Map<?, ?>) config.generateNextValue();
    }

    private static void assertPoint(Map<?, ?> value, double x, double y, double z) {
        assertEquals(x, (Double) value.get("x"), EPS);
        assertEquals(y, (Double) value.get("y"), EPS);
        assertEquals(z, (Double) value.get("z"), EPS);
    }

    @Test
    public void cubeClampsWrapsAndBouncesEachAxis() {
        // Cube 20 x 20 centred at (50, 50): X range 40..60
        assertPoint(firstOrbitPoint3D(Shape3DType.CUBE, BoundaryBehavior.CLAMP, 50, 30,
            new PointVariableConfig().shape3DWidth(20).shape3DLength(20)), 60, 50, 50);
        assertPoint(firstOrbitPoint3D(Shape3DType.CUBE, BoundaryBehavior.WRAP, 50, 25,
            new PointVariableConfig().shape3DWidth(20).shape3DLength(20)), 55, 50, 50);
        assertPoint(firstOrbitPoint3D(Shape3DType.CUBE, BoundaryBehavior.BOUNCE, 50, 25,
            new PointVariableConfig().shape3DWidth(20).shape3DLength(20)), 45, 50, 50);
    }

    @Test
    public void cubeKeepsAPointThatIsAlreadyInside() {
        assertPoint(firstOrbitPoint3D(Shape3DType.CUBE, BoundaryBehavior.BOUNCE, 50, 5,
            new PointVariableConfig().shape3DWidth(20).shape3DLength(20)), 55, 50, 50);
    }

    @Test
    public void sphereClampsToTheSurfaceBouncesInsideAndWrapsToTheOppositeSide() {
        // Sphere of radius 10 resting on minZ = 0: centre (50, 50, 10); the orbit starts at (70, 50, 10)
        assertPoint(firstOrbitPoint3D(Shape3DType.SPHERE, BoundaryBehavior.CLAMP, 10, 20,
            new PointVariableConfig().shape3DRadius(10)), 60, 50, 10);
        assertPoint(firstOrbitPoint3D(Shape3DType.SPHERE, BoundaryBehavior.BOUNCE, 10, 20,
            new PointVariableConfig().shape3DRadius(10)), 59.5, 50, 10);
        assertPoint(firstOrbitPoint3D(Shape3DType.SPHERE, BoundaryBehavior.WRAP, 10, 20,
            new PointVariableConfig().shape3DRadius(10)), 40.5, 50, 10);
    }

    @Test
    public void sphereWrapJustOutsideTheSurfaceMirrorsAtEightyPercent() {
        // dist 11: 11 * 0.8 <= 10, so the point reappears at 80% of its distance on the other side
        assertPoint(firstOrbitPoint3D(Shape3DType.SPHERE, BoundaryBehavior.WRAP, 10, 11,
            new PointVariableConfig().shape3DRadius(10)), 50 - 8.8, 50, 10);
    }

    @Test
    public void sphereKeepsAPointThatIsAlreadyInside() {
        assertPoint(firstOrbitPoint3D(Shape3DType.SPHERE, BoundaryBehavior.CLAMP, 10, 5,
            new PointVariableConfig().shape3DRadius(10)), 55, 50, 10);
    }

    @Test
    public void conePullsTheFootprintOntoItsSectionAndClampsZ() {
        // Cone of radius 20 and height 100: at z = 50 its section radius is 10
        assertPoint(firstOrbitPoint3D(Shape3DType.CONE, BoundaryBehavior.BOUNCE, 50, 30,
            new PointVariableConfig().shape3DRadius(20)), 60, 50, 50);
        // Above the apex the point is clamped onto it
        assertPoint(firstOrbitPoint3D(Shape3DType.CONE, BoundaryBehavior.CLAMP, 150, 30,
            new PointVariableConfig().shape3DRadius(20)), 50, 50, 100);
        // Inside the section nothing moves
        assertPoint(firstOrbitPoint3D(Shape3DType.CONE, BoundaryBehavior.CLAMP, 50, 5,
            new PointVariableConfig().shape3DRadius(20)), 55, 50, 50);
    }

    @Test
    public void pyramidClampsTheFootprintToItsSection() {
        // Pyramid 40 x 40 and height 100: at z = 50 its half side is 10
        assertPoint(firstOrbitPoint3D(Shape3DType.PYRAMID, BoundaryBehavior.BOUNCE, 50, 30,
            new PointVariableConfig().shape3DWidth(40).shape3DLength(40)), 60, 50, 50);
        assertPoint(firstOrbitPoint3D(Shape3DType.PYRAMID, BoundaryBehavior.CLAMP, 50, 5,
            new PointVariableConfig().shape3DWidth(40).shape3DLength(40)), 55, 50, 50);
    }

    @Test
    public void cartesian2DBoxClampsWrapsAndBounces() {
        assertEquals(Map.of("x", 10.0, "y", 5.0), firstOrbitPoint2D(BoundaryBehavior.CLAMP));
        assertEquals(Map.of("x", 2.0, "y", 5.0), firstOrbitPoint2D(BoundaryBehavior.WRAP));
        assertEquals(Map.of("x", 8.0, "y", 5.0), firstOrbitPoint2D(BoundaryBehavior.BOUNCE));
    }

    /** Orbit of radius 7 around (5, 5) in a 0..10 square: its first point (12, 5) is out on X. */
    private static Map<?, ?> firstOrbitPoint2D(BoundaryBehavior behavior) {
        PointVariableConfig config = new PointVariableConfig()
            .pattern(GenerationPattern.CIRCULAR_ORBIT)
            .coordinateSystem(CoordinateSystem.CARTESIAN_2D)
            .boundaryBehavior(behavior)
            .orbitRadius(7)
            .orbitCenter(5, 5, 0)
            .range(0, 10, 0, 10, 0, 0);
        return (Map<?, ?>) config.generateNextValue();
    }

    @Test
    public void geospatialRandomWalkStartsAtTheInitialAltitude() {
        PointVariableConfig config = new PointVariableConfig()
            .pattern(GenerationPattern.RANDOM_WALK)
            .coordinateSystem(CoordinateSystem.GEOSPATIAL)
            .fixedPoint(10, 20, 0)
            .initialAltitude(123.0)
            .range(0, 50, 0, 50, 0, 200);

        Map<?, ?> first = (Map<?, ?>) config.generateNextValue();

        assertEquals(10.0, first.get("latitude"));
        assertEquals(20.0, first.get("longitude"));
        assertEquals(123.0, first.get("altitude"));
    }

    // --- Walls and polygon obstacles ---

    private static BoundaryObstacle obstacle(ObstacleType type, double... xy) {
        List<Point3D> pts = new ArrayList<>();
        for (int i = 0; i < xy.length; i += 2) {
            pts.add(new Point3D(xy[i], xy[i + 1], 0));
        }
        return new BoundaryObstacle("o", type, pts);
    }

    @Test
    public void segmentWithoutObstaclesNeverHitsAWall() {
        assertFalse(new PointVariableConfig().doesSegmentIntersectAnyWall(0, 0, 10, 10));
    }

    @Test
    public void wallSegmentBlocksCrossingAndTouchingMoves() {
        PointVariableConfig config = new PointVariableConfig()
            .addObstacle(obstacle(ObstacleType.WALL_SEGMENT, 5, 0, 5, 10));

        assertTrue(config.doesSegmentIntersectAnyWall(0, 5, 10, 5));
        assertTrue("touching the wall counts", config.doesSegmentIntersectAnyWall(0, 10, 5, 10));
        assertFalse(config.doesSegmentIntersectAnyWall(0, 5, 4, 5));
        assertFalse("collinear but past its end", config.doesSegmentIntersectAnyWall(5, 11, 5, 20));
    }

    @Test
    public void wallPolylineIsOpenButPolygonObstacleIsClosed() {
        // Same three points: only the polygon has the closing edge (0,10) -> (0,0)
        PointVariableConfig wall = new PointVariableConfig()
            .addObstacle(obstacle(ObstacleType.WALL_SEGMENT, 0, 0, 10, 0, 0, 10));
        PointVariableConfig polygon = new PointVariableConfig()
            .addObstacle(obstacle(ObstacleType.OBSTACLE_POLYGON, 0, 0, 10, 0, 0, 10));

        assertFalse(wall.doesSegmentIntersectAnyWall(-5, 5, 1, 5));
        assertTrue(polygon.doesSegmentIntersectAnyWall(-5, 5, 1, 5));
    }

    @Test
    public void disabledNullAndDegenerateObstaclesAreIgnored() {
        PointVariableConfig config = new PointVariableConfig().obstacles(Arrays.asList(
            null,
            obstacle(ObstacleType.WALL_SEGMENT, 5, 0, 5, 10).enabled(false),
            obstacle(ObstacleType.WALL_SEGMENT, 5, 5),
            obstacle(ObstacleType.OBSTACLE_POLYGON, 5, 0, 5, 10)));

        assertFalse(config.doesSegmentIntersectAnyWall(0, 5, 10, 5));
    }

    @Test
    public void geospatialRandomWalkAvoidsForbiddenZonesAndWalls() {
        // x = latitude, y = longitude, as in the UI: a zone in the middle of the region and a
        // wall across it at longitude 1.5
        PointVariableConfig config = new PointVariableConfig()
            .pattern(GenerationPattern.RANDOM_WALK)
            .coordinateSystem(CoordinateSystem.GEOSPATIAL)
            .maxStepDistance(0.05)
            .range(0, 2, 0, 2, 0, 100)
            .addObstacle(obstacle(ObstacleType.OBSTACLE_POLYGON, 0.8, 0.2, 1.2, 0.2, 1.2, 0.6, 0.8, 0.6))
            .addObstacle(obstacle(ObstacleType.WALL_SEGMENT, -1, 1.5, 3, 1.5));

        Map<?, ?> previous = null;
        for (int i = 0; i < 2000; i++) {
            Map<?, ?> point = (Map<?, ?>) config.generateNextValue();
            double lat = (Double) point.get("latitude");
            double lon = (Double) point.get("longitude");
            assertFalse("inside the forbidden zone at " + lat + ", " + lon, config.isPointInAnyObstacle(lat, lon));
            if (previous != null) {
                double prevLon = (Double) previous.get("longitude");
                assertEquals("never crosses the wall", prevLon < 1.5, lon < 1.5);
            }
            previous = point;
        }
    }
}
