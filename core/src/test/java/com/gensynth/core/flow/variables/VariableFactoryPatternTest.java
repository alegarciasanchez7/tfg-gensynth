package com.gensynth.core.flow.variables;

import com.gensynth.core.flow.variables.config.PointVariableConfig;
import org.junit.Test;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** The pattern selected in the editor wins over keys left behind by patterns used before. */
public class VariableFactoryPatternTest {

    private static Object generate(String type, Map<String, Object> config) {
        return VariableFactory.createFromConfig(VariableFactory.createFromMap("v", type, config)).getValue();
    }

    @Test
    public void numericRandomIgnoresALeftoverConstantValue() {
        Map<String, Object> config = Map.of("pattern", "RANDOM", "min", 0, "max", 1000, "precision", "INTEGER",
                "constantValue", 42);
        Set<Object> values = new HashSet<>();
        for (int i = 0; i < 20; i++) {
            values.add(generate("numeric", config));
        }
        assertTrue("Random must not be stuck on the old constant: " + values, values.size() > 1);
    }

    @Test
    public void stringRegexIgnoresLeftoverFixedAndTemplateValues() {
        Object value = generate("string", Map.of("pattern", "REGEX", "regexPattern", "AB[0-9]{3}",
                "constantValue", "fixed", "template", "t"));
        assertTrue(String.valueOf(value), String.valueOf(value).matches("AB[0-9]{3}"));
    }

    @Test
    public void legacyConfigsWithoutPatternStillInferIt() {
        assertEquals("fixed", generate("string", Map.of("constantValue", "fixed")));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void pointWithoutBoundsUsesTheSameDefaultRegionAsTheUi() {
        Map<String, Object> config = Map.of("pattern", "RANDOM_POINT", "coordinateSystem", "CARTESIAN_2D");
        double maxSeen = 0;
        for (int i = 0; i < 200; i++) {
            Map<String, Object> point = (Map<String, Object>) generate("point", config);
            double x = ((Number) point.get("x")).doubleValue();
            double y = ((Number) point.get("y")).doubleValue();
            assertTrue("x " + x, x >= 0 && x <= 100);
            assertTrue("y " + y, y >= 0 && y <= 100);
            maxSeen = Math.max(maxSeen, Math.max(x, y));
        }
        assertTrue("points must spread over 0..100, not 0..1: " + maxSeen, maxSeen > 1);
    }
    private static PointVariableConfig point(Map<String, Object> config) {
        return (PointVariableConfig) VariableFactory.createFromMap("p", "point", config);
    }

    @Test
    public void pointOrbitCenterIsParsedAndTheRegionStillWins() {
        Map<String, Object> config = new HashMap<>();
        config.put("pattern", "CIRCULAR_ORBIT");
        config.put("orbitCenter", Map.of("x", 20, "y", 30, "z", 5));
        config.put("orbitRadius", 10);
        config.put("minPoint", Map.of("x", 0, "y", 0, "z", 0));
        config.put("maxPoint", Map.of("x", 100, "y", 100, "z", 10));
        PointVariableConfig pc = point(config);

        assertNotNull(pc.getOrbitCenter());
        assertEquals(20.0, pc.getOrbitCenter().x, 1e-9);
        assertEquals(30.0, pc.getOrbitCenter().y, 1e-9);
        assertEquals(5.0, pc.getOrbitCenter().z, 1e-9);
        assertEquals(100.0, pc.getMaxPoint().x, 1e-9);

        assertNull("no orbitCenter key: the bbox centre is used", point(Map.of("pattern", "CIRCULAR_ORBIT")).getOrbitCenter());
    }

    @Test
    public void pointShape3DIsParsedFromTheLowerCaseUiValue() {
        Map<String, Object> config = new HashMap<>();
        config.put("coordinateSystem", "CARTESIAN_3D");
        config.put("shape3DType", "sphere");
        config.put("shape3DRadius", 25);
        config.put("shape3DWidth", 40);
        config.put("shape3DLength", 60);
        config.put("shape3DHeight", -30);
        PointVariableConfig pc = point(config);

        assertEquals(PointVariableConfig.Shape3DType.SPHERE, pc.getShape3DType());
        assertEquals(25.0, pc.getShape3DRadius(), 1e-9);
        assertEquals(40.0, pc.getShape3DWidth(), 1e-9);
        assertEquals(60.0, pc.getShape3DLength(), 1e-9);
        assertEquals(-30.0, pc.getShape3DHeight(), 1e-9);

        // An unknown type ("custom") keeps the cube; unset dimensions follow the region
        PointVariableConfig custom = point(Map.of("coordinateSystem", "CARTESIAN_3D", "shape3DType", "custom",
                "minPoint", Map.of("x", 0, "y", 0, "z", 0), "maxPoint", Map.of("x", 20, "y", 40, "z", 60)));
        assertEquals(PointVariableConfig.Shape3DType.CUBE, custom.getShape3DType());
        assertEquals(20.0, custom.getShape3DWidth(), 1e-9);
        assertEquals(40.0, custom.getShape3DLength(), 1e-9);
        assertEquals(60.0, custom.getShape3DHeight(), 1e-9);
    }

    @Test
    public void pointPolygonDoesNotReRangeTheRegionIn3D() {
        List<Map<String, Object>> polygon = List.of(
                Map.of("x", 10, "y", 10, "z", 0), Map.of("x", 20, "y", 10, "z", 0), Map.of("x", 20, "y", 20, "z", 0));
        Map<String, Object> config = new HashMap<>();
        config.put("minPoint", Map.of("x", 0, "y", 0, "z", 0));
        config.put("maxPoint", Map.of("x", 100, "y", 100, "z", 100));
        config.put("boundaryPolygon", polygon);

        config.put("coordinateSystem", "CARTESIAN_3D");
        PointVariableConfig in3d = point(config);
        assertEquals(3, in3d.getBoundaryPolygon().size());
        assertEquals(0.0, in3d.getMinPoint().x, 1e-9);
        assertEquals(100.0, in3d.getMaxPoint().x, 1e-9);

        config.put("coordinateSystem", "CARTESIAN_2D");
        PointVariableConfig in2d = point(config);
        assertEquals(10.0, in2d.getMinPoint().x, 1e-9);
        assertEquals(20.0, in2d.getMaxPoint().x, 1e-9);
    }

    @Test
    public void pointWaypointsLegacyPathAndLoopAreParsed() {
        List<Map<String, Object>> route = List.of(Map.of("x", 1, "y", 2, "z", 3), Map.of("x", 4, "y", 5, "z", 6));

        PointVariableConfig fromWaypoints = point(Map.of("pattern", "WAYPOINT_NAVIGATION", "waypoints", route,
                "path", List.of(Map.of("x", 9, "y", 9, "z", 9)), "loopPath", false, "interpolationSteps", 3));
        assertEquals(2, fromWaypoints.getPathSize());
        assertEquals(4.0, fromWaypoints.getPath().get(1).x, 1e-9);
        assertEquals(3, fromWaypoints.getInterpolationSteps());

        PointVariableConfig fromLegacyPath = point(Map.of("pattern", "WAYPOINT_NAVIGATION", "path", route));
        assertEquals(2, fromLegacyPath.getPathSize());

        // Loop off: (1,2) then (4,5), and it stays on the last waypoint
        PointVariableConfig noLoop = point(Map.of("pattern", "WAYPOINT_NAVIGATION", "waypoints", route,
                "loopPath", false, "interpolationSteps", 1));
        Set<Object> xs = new HashSet<>();
        for (int i = 0; i < 4; i++) {
            Object v = VariableFactory.createFromConfig(noLoop).getValue();
            xs.add(((Map<?, ?>) v).get("x"));
        }
        assertEquals(Set.of(1.0, 4.0), xs);
        Object last = noLoop.generateNextValue();
        assertEquals(4.0, ((Map<?, ?>) last).get("x"));
    }

    @Test
    public void pointInterpolationStepsZeroIsClampedToOne() {
        PointVariableConfig pc = point(Map.of("pattern", "WAYPOINT_NAVIGATION", "interpolationSteps", 0,
                "waypoints", List.of(Map.of("x", 1, "y", 0), Map.of("x", 2, "y", 0))));
        assertEquals(1, pc.getInterpolationSteps());
        assertEquals(1, pc.getGraphInterpolationSteps());
        assertFalse(pc.validate().stream().anyMatch(e -> e.contains("interpolation")));
    }
}
