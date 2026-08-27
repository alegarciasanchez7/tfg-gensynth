package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import org.junit.Before;
import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.*;

/**
 * Exhaustive unit test suite covering all coordinate systems, movement patterns, 
 * boundary behaviors, GPS noise jitter, and formatting options for Point variables.
 */
public class PointVariableExhaustiveGenerationTest {

    private PointVariableConfig config;

    @Before
    public void setUp() {
        config = new PointVariableConfig().identifier("exhaustive_point_sensor");
    }

    @Test
    public void testAllCoordinateSystemsAndFormats() {
        // 1. CARTESIAN_2D
        config.coordinateSystem(CoordinateSystem.CARTESIAN_2D)
              .pattern(GenerationPattern.FIXED_POINT)
              .fixedPoint(12.5, 45.0, 100.0);

        @SuppressWarnings("unchecked")
        Map<String, Object> val2d = (Map<String, Object>) config.generateNextValue();
        assertTrue(val2d.containsKey("x"));
        assertTrue(val2d.containsKey("y"));
        assertFalse(val2d.containsKey("z"));
        assertEquals(12.5, (Double) val2d.get("x"), 1e-6);
        assertEquals(45.0, (Double) val2d.get("y"), 1e-6);

        // 2. CARTESIAN_3D
        config.coordinateSystem(CoordinateSystem.CARTESIAN_3D);
        @SuppressWarnings("unchecked")
        Map<String, Object> val3d = (Map<String, Object>) config.generateNextValue();
        assertTrue(val3d.containsKey("x"));
        assertTrue(val3d.containsKey("y"));
        assertTrue(val3d.containsKey("z"));
        assertEquals(100.0, (Double) val3d.get("z"), 1e-6);

        // 3. GEOSPATIAL - DECIMAL_DEGREES
        config.coordinateSystem(CoordinateSystem.GEOSPATIAL)
              .geospatialFormat(GeospatialFormat.DECIMAL_DEGREES)
              .fixedPoint(40.7128, -74.0060, 15.0);

        @SuppressWarnings("unchecked")
        Map<String, Object> valGeoDD = (Map<String, Object>) config.generateNextValue();
        assertTrue(valGeoDD.containsKey("latitude"));
        assertTrue(valGeoDD.containsKey("longitude"));
        assertTrue(valGeoDD.containsKey("altitude"));
        assertEquals(40.7128, (Double) valGeoDD.get("latitude"), 1e-6);
        assertEquals(-74.0060, (Double) valGeoDD.get("longitude"), 1e-6);

        // 4. GEOSPATIAL - DEGREES_MINUTES_SECONDS
        config.geospatialFormat(GeospatialFormat.DEGREES_MINUTES_SECONDS);
        @SuppressWarnings("unchecked")
        Map<String, Object> valGeoDMS = (Map<String, Object>) config.generateNextValue();
        assertTrue(valGeoDMS.containsKey("latitude"));
        assertTrue(valGeoDMS.containsKey("longitude"));
        assertTrue(valGeoDMS.get("latitude") instanceof String);
        assertTrue(valGeoDMS.get("longitude") instanceof String);
        assertTrue(((String) valGeoDMS.get("latitude")).contains("N"));
        assertTrue(((String) valGeoDMS.get("longitude")).contains("W"));
        assertEquals(40.7128, (Double) valGeoDMS.get("latitudeDecimal"), 1e-6);
        assertEquals(-74.0060, (Double) valGeoDMS.get("longitudeDecimal"), 1e-6);
    }

    @Test
    public void testDmsConversionHelper() {
        String latDms = PointVariableConfig.convertToDMS(40.7128, true);
        String lonDms = PointVariableConfig.convertToDMS(-74.0060, false);
        String southLat = PointVariableConfig.convertToDMS(-33.8688, true);
        String eastLon = PointVariableConfig.convertToDMS(151.2093, false);

        assertTrue(latDms.contains("40° 42'"));
        assertTrue(latDms.endsWith("N"));
        assertTrue(lonDms.contains("74° 0'"));
        assertTrue(lonDms.endsWith("W"));
        assertTrue(southLat.endsWith("S"));
        assertTrue(eastLon.endsWith("E"));
    }

    @Test
    public void testMovementPatternRandomWalkWithInertia() {
        config.pattern(GenerationPattern.RANDOM_WALK)
              .coordinateSystem(CoordinateSystem.CARTESIAN_3D)
              .range(0.0, 100.0, 0.0, 100.0, 0.0, 100.0)
              .maxStepDistance(2.0)
              .inertia(0.8);

        @SuppressWarnings("unchecked")
        Map<String, Object> p1 = (Map<String, Object>) config.generateNextValue();
        @SuppressWarnings("unchecked")
        Map<String, Object> p2 = (Map<String, Object>) config.generateNextValue();
        @SuppressWarnings("unchecked")
        Map<String, Object> p3 = (Map<String, Object>) config.generateNextValue();

        assertNotNull(p1.get("x"));
        assertNotNull(p2.get("x"));
        assertNotNull(p3.get("x"));

        // Max distance change between steps should be within reasonable bounds
        double dx = Math.abs((Double) p2.get("x") - (Double) p1.get("x"));
        double dy = Math.abs((Double) p2.get("y") - (Double) p1.get("y"));
        assertTrue(dx <= 5.0);
        assertTrue(dy <= 5.0);
    }

    @Test
    public void testMovementPatternCircularOrbitAndSpiral() {
        config.pattern(GenerationPattern.CIRCULAR_ORBIT)
              .coordinateSystem(CoordinateSystem.CARTESIAN_3D)
              .orbitCenter(50.0, 50.0, 10.0)
              .orbitRadius(20.0)
              .angularSpeed(Math.PI / 2.0) // 90 deg per tick
              .spiralRate(1.0); // radius increases by 1 per tick

        // Tick 1: angle = 0, radius = 20 -> (50 + 20, 50 + 0, 10) = (70, 50, 10)
        @SuppressWarnings("unchecked")
        Map<String, Object> step1 = (Map<String, Object>) config.generateNextValue();
        assertEquals(70.0, (Double) step1.get("x"), 1e-4);
        assertEquals(50.0, (Double) step1.get("y"), 1e-4);

        // Tick 2: angle = PI/2, radius = 21 -> (50 + 0, 50 + 21, 10) = (50, 71, 10)
        @SuppressWarnings("unchecked")
        Map<String, Object> step2 = (Map<String, Object>) config.generateNextValue();
        assertEquals(50.0, (Double) step2.get("x"), 1e-4);
        assertEquals(71.0, (Double) step2.get("y"), 1e-4);
    }

    @Test
    public void testMovementPatternWaypointNavigation() {
        config.pattern(GenerationPattern.WAYPOINT_NAVIGATION)
              .coordinateSystem(CoordinateSystem.CARTESIAN_3D)
              .addPathPoint(0.0, 0.0, 0.0)
              .addPathPoint(10.0, 0.0, 0.0)
              .addPathPoint(10.0, 10.0, 0.0)
              .interpolationSteps(2)
              .loopPath(true);

        @SuppressWarnings("unchecked")
        Map<String, Object> p1 = (Map<String, Object>) config.generateNextValue();
        @SuppressWarnings("unchecked")
        Map<String, Object> p2 = (Map<String, Object>) config.generateNextValue();
        @SuppressWarnings("unchecked")
        Map<String, Object> p3 = (Map<String, Object>) config.generateNextValue();

        assertEquals(0.0, (Double) p1.get("x"), 1e-6);
        assertEquals(10.0, (Double) p2.get("x"), 1e-6);
        assertEquals(10.0, (Double) p3.get("x"), 1e-6);
        assertEquals(0.0, (Double) p3.get("y"), 1e-6);
    }

    @Test
    public void testAllBoundaryBehaviors() {
        // CLAMP behavior
        config.pattern(GenerationPattern.RANDOM_WALK)
              .coordinateSystem(CoordinateSystem.CARTESIAN_2D)
              .boundaryBehavior(BoundaryBehavior.CLAMP)
              .range(0.0, 10.0, 0.0, 10.0, 0.0, 10.0)
              .maxStepDistance(50.0);

        for (int i = 0; i < 50; i++) {
            @SuppressWarnings("unchecked")
            Map<String, Object> pt = (Map<String, Object>) config.generateNextValue();
            double x = (Double) pt.get("x");
            double y = (Double) pt.get("y");
            assertTrue("x should be >= 0.0", x >= 0.0);
            assertTrue("x should be <= 10.0", x <= 10.0);
            assertTrue("y should be >= 0.0", y >= 0.0);
            assertTrue("y should be <= 10.0", y <= 10.0);
        }

        // WRAP behavior
        config.boundaryBehavior(BoundaryBehavior.WRAP);
        for (int i = 0; i < 20; i++) {
            @SuppressWarnings("unchecked")
            Map<String, Object> pt = (Map<String, Object>) config.generateNextValue();
            double x = (Double) pt.get("x");
            assertTrue("WRAPPED x should be within bounds", x >= 0.0 && x <= 10.0);
        }

        // BOUNCE behavior
        config.boundaryBehavior(BoundaryBehavior.BOUNCE);
        for (int i = 0; i < 20; i++) {
            @SuppressWarnings("unchecked")
            Map<String, Object> pt = (Map<String, Object>) config.generateNextValue();
            double x = (Double) pt.get("x");
            assertTrue("BOUNCED x should be within bounds", x >= 0.0 && x <= 10.0);
        }
    }

    @Test
    public void testGpsNoiseJitter() {
        config.pattern(GenerationPattern.FIXED_POINT)
              .coordinateSystem(CoordinateSystem.CARTESIAN_3D)
              .fixedPoint(100.0, 100.0, 100.0)
              .jitterRadius(2.0)
              .gpsNoiseEnabled(true);

        boolean deviationFound = false;
        for (int i = 0; i < 20; i++) {
            @SuppressWarnings("unchecked")
            Map<String, Object> pt = (Map<String, Object>) config.generateNextValue();
            double x = (Double) pt.get("x");
            if (Math.abs(x - 100.0) > 1e-4) {
                deviationFound = true;
                break;
            }
        }
        assertTrue("Jitter should introduce small position noise variations", deviationFound);
    }

    @Test
    public void testResetAndAnomalyIntegration() {
        config.pattern(GenerationPattern.FIXED_POINT)
              .fixedPoint(10.0, 20.0, 30.0);

        PointVariableConfig.Point3D anomalyVal = new PointVariableConfig.Point3D(999.0, 999.0, 999.0);
        AnomalyConfig anomaly = new AnomalyConfig()
              .type(AnomalyType.MAKE_AND_BACK)
              .whenTicks(2)
              .anomalousValue(anomalyVal);
        anomaly.setEnabled(true);

        config.anomaly(anomaly);

        @SuppressWarnings("unchecked")
        Map<String, Object> normal1 = (Map<String, Object>) config.generateNextValue();
        @SuppressWarnings("unchecked")
        Map<String, Object> anomalous = (Map<String, Object>) config.generateNextValue();

        assertEquals(10.0, (Double) normal1.get("x"), 1e-6);
        assertEquals(999.0, (Double) anomalous.get("x"), 1e-6);

        config.reset();
        assertEquals(0, config.getTickCounter());
    }

    @Test
    public void testExhaustiveSpatialBoundariesIntegration() {
        // 1. Test 2D Custom Spatial Boundaries [minX=10, maxX=50, minY=-20, maxY=80]
        config.coordinateSystem(CoordinateSystem.CARTESIAN_2D)
              .boundaryBehavior(BoundaryBehavior.CLAMP)
              .range(10.0, 50.0, -20.0, 80.0, 0.0, 0.0)
              .pattern(GenerationPattern.RANDOM_WALK)
              .maxStepDistance(100.0); // Extremely large step to force boundary collisions

        for (int i = 0; i < 100; i++) {
            @SuppressWarnings("unchecked")
            Map<String, Object> pt = (Map<String, Object>) config.generateNextValue();
            double x = (Double) pt.get("x");
            double y = (Double) pt.get("y");
            assertTrue("2D x must respect min boundary 10.0", x >= 10.0);
            assertTrue("2D x must respect max boundary 50.0", x <= 50.0);
            assertTrue("2D y must respect min boundary -20.0", y >= -20.0);
            assertTrue("2D y must respect max boundary 80.0", y <= 80.0);
        }

        // 2. Test 3D Custom Spatial Boundaries [minZ=50.0, maxZ=150.0]
        config.coordinateSystem(CoordinateSystem.CARTESIAN_3D)
              .boundaryBehavior(BoundaryBehavior.CLAMP)
              .range(-10.0, 10.0, -10.0, 10.0, 50.0, 150.0)
              .pattern(GenerationPattern.RANDOM_WALK)
              .maxStepDistance(200.0);

        for (int i = 0; i < 100; i++) {
            @SuppressWarnings("unchecked")
            Map<String, Object> pt = (Map<String, Object>) config.generateNextValue();
            double z = (Double) pt.get("z");
            assertTrue("3D z altitude must respect min boundary 50.0", z >= 50.0);
            assertTrue("3D z altitude must respect max boundary 150.0", z <= 150.0);
        }

        // 3. Test Geospatial Geo-Fence Boundaries [minLat=36.0, maxLat=43.0, minLon=-9.0, maxLon=3.0] (Iberian Peninsula box)
        config.coordinateSystem(CoordinateSystem.GEOSPATIAL)
              .geospatialFormat(GeospatialFormat.DECIMAL_DEGREES)
              .boundaryBehavior(BoundaryBehavior.CLAMP)
              .range(36.0, 43.0, -9.0, 3.0, 0.0, 1000.0)
              .pattern(GenerationPattern.RANDOM_WALK)
              .maxStepDistance(20.0);

        for (int i = 0; i < 100; i++) {
            @SuppressWarnings("unchecked")
            Map<String, Object> pt = (Map<String, Object>) config.generateNextValue();
            double lat = (Double) pt.get("latitude");
            double lon = (Double) pt.get("longitude");
            assertTrue("Geo Latitude must be within geofence min 36.0", lat >= 36.0);
            assertTrue("Geo Latitude must be within geofence max 43.0", lat <= 43.0);
            assertTrue("Geo Longitude must be within geofence min -9.0", lon >= -9.0);
            assertTrue("Geo Longitude must be within geofence max 3.0", lon <= 3.0);
        }
    }
}
