package com.gensynth.core.flow.variables;

import com.gensynth.core.flow.variables.config.BoundaryObstacle;
import com.gensynth.core.flow.variables.config.GraphNode;
import com.gensynth.core.flow.variables.config.ListVariableConfig;
import com.gensynth.core.flow.variables.config.NumericVariableConfig;
import com.gensynth.core.flow.variables.config.PointVariableConfig;
import com.gensynth.core.flow.variables.config.StringVariableConfig;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertThrows;

/**
 * Parsing of the config map into each variable config: conditional rules, list items and
 * matrix, point ranges, obstacles and graph routes, and the lenient handling of bad values.
 */
public class VariableFactoryParsingTest {

    // ---------------------------------------------------------------- common

    @Test
    public void unknownTypeIsRejected() {
        Map<String, Object> config = Map.of();
        assertThrows(IllegalArgumentException.class, () -> VariableFactory.createFromMap("v", "nope", config));
    }

    @Test
    public void invalidConfigIsRejectedWithItsErrors() {
        Map<String, Object> config = Map.of("min", 10, "max", 1);
        InvalidVariableConfigException e = assertThrows(InvalidVariableConfigException.class,
            () -> VariableFactory.createFromMap("v", "NUMERIC", config));
        assertTrue(e.getMessage().contains("min must be <= max"));
    }

    @Test
    public void unknownPatternNameKeepsTheDefaultPattern() {
        GenerationPattern defaultPattern = VariableFactory.createNumeric("v").getPattern();

        VariableConfiguration numeric = VariableFactory.createFromMap("v", "NUMERIC", Map.of("pattern", "nope"));

        assertEquals(defaultPattern, numeric.getPattern());
    }

    @Test
    public void conditionalRulesReadTheOperatorFallbackAndCopyTheOverrides() {
        Map<String, Object> overrides = new HashMap<>(Map.of("constantValue", 3));
        Map<String, Object> config = new HashMap<>();
        config.put("conditionalRules", List.of(
            Map.of("targetVariable", "t", "operator", "GREATER_THAN", "value", 5, "overrides", overrides),
            Map.of("targetVariable", "t", "condition", "EQUALS", "operator", "LESS_THAN", "value", 1),
            "not a rule"));

        VariableConfiguration numeric = VariableFactory.createFromMap("v", "NUMERIC", config);

        List<VariableConfiguration.ConditionalRule> rules = numeric.getConditionalRules();
        assertEquals(2, rules.size());
        assertEquals("t", rules.get(0).targetVariable);
        assertEquals("GREATER_THAN", rules.get(0).condition);
        assertEquals(5, rules.get(0).value);
        assertEquals(overrides, rules.get(0).overrides);
        overrides.put("other", 1);
        assertFalse(rules.get(0).overrides.containsKey("other"));
        assertEquals("EQUALS", rules.get(1).condition);
        assertTrue(rules.get(1).overrides.isEmpty());
    }

    @Test
    public void malformedConditionalRulesLeaveNoRules() {
        VariableConfiguration badTarget = VariableFactory.createFromMap("v", "NUMERIC",
            Map.of("conditionalRules", List.of(Map.of("targetVariable", 42))));
        VariableConfiguration notAList = VariableFactory.createFromMap("v", "NUMERIC",
            Map.of("conditionalRules", "nope"));

        assertTrue(badTarget.getConditionalRules().isEmpty());
        assertTrue(notAList.getConditionalRules().isEmpty());
    }

    @Test
    public void listIgnoresTheSourceListFields() {
        VariableConfiguration list = VariableFactory.createFromMap("v", "LIST",
            Map.of("items", List.of("a"), "sourceListVariableId", "other"));

        assertNull(list.getSourceListVariableId());
    }

    // ---------------------------------------------------------------- string

    @Test
    public void stringReadsTheMaskAndCorruptionKeys() {
        Map<String, Object> config = new HashMap<>();
        config.put("pattern", "FORMATTED");
        config.put("formattedMaskType", "CUSTOM");
        config.put("customMask", "AA-99");
        config.put("alphanumericCase", "UPPER");
        config.put("template", "id-{n}");
        config.put("corruptionMode", "TRUNCATE");
        config.put("corruptionMagnitude", 2);
        config.put("fixedLength", 8);

        StringVariableConfig string = (StringVariableConfig) VariableFactory.createFromMap("v", "STRING", config);

        Map<String, Object> saved = string.toMap();
        assertEquals("CUSTOM", saved.get("formattedMaskType"));
        assertEquals("AA-99", saved.get("customMask"));
        assertEquals("UPPER", saved.get("alphanumericCase"));
        assertEquals("id-{n}", saved.get("template"));
        assertEquals("TRUNCATE", saved.get("corruptionMode"));
        assertEquals(2, saved.get("corruptionMagnitude"));
        assertEquals(8, string.getFixedLength());
    }

    // ---------------------------------------------------------------- list

    @Test
    public void listReadsEveryKindOfItem() {
        ListVariableConfig.ListItem ready = new ListVariableConfig.ListItem("r", "ready", 1.0);
        Map<String, Object> embedded = Map.of("id", "e", "embeddedType", "STRING",
            "embeddedConfig", Map.of("type", "NUMERIC", "min", 0, "max", 1));
        Map<String, Object> literal = Map.of("id", "l", "value", "x", "isEmbedded", false,
            "embeddedConfig", Map.of("min", 0, "max", 1));
        Map<String, Object> weighted = Map.of("id", 7, "value", "w", "weight", 2.0);

        ListVariableConfig list = (ListVariableConfig) VariableFactory.createFromMap("v", "LIST",
            Map.of("items", List.of(ready, "plain", embedded, literal, weighted)));

        List<ListVariableConfig.ListItem> items = list.getItems();
        assertEquals(5, items.size());
        assertEquals("ready", items.get(0).getValue());
        assertEquals("plain", items.get(1).getValue());
        assertEquals(1.0, items.get(1).getWeight(), 0.0);
        assertTrue(items.get(2).getEmbeddedConfig() instanceof NumericVariableConfig);
        assertEquals("v_embedded_e", items.get(2).getEmbeddedConfig().getIdentifier());
        assertNull(items.get(3).getEmbeddedConfig());
        assertEquals("7", items.get(4).getId());
        assertEquals(2.0, items.get(4).getWeight(), 0.0);
    }

    @Test
    public void listReadsTheMatrixTheOrderAndTheStrategy() {
        Map<String, Object> rowA = new HashMap<>(Map.of("a", 0.25, "b", "not a number"));
        Map<String, Object> matrix = new HashMap<>();
        matrix.put("a", rowA);
        matrix.put("b", null);
        List<Object> order = new ArrayList<>(Arrays.asList("b", null, "a"));
        Map<String, Object> config = new HashMap<>();
        config.put("items", List.of(Map.of("id", "a", "value", 1), Map.of("id", "b", "value", 2)));
        config.put("transitionMatrix", matrix);
        config.put("itemOrder", order);
        config.put("selectionStrategy", "sequential");

        ListVariableConfig list = (ListVariableConfig) VariableFactory.createFromMap("v", "LIST", config);

        assertEquals(Map.of("a", 0.25), list.getTransitionMatrix().get("a"));
        assertTrue(list.getTransitionMatrix().get("b").isEmpty());
        assertEquals(List.of("b", "a"), list.getItemOrder());
        assertEquals(ListVariableConfig.SelectionStrategy.SEQUENTIAL, list.getSelectionStrategy());
    }

    @Test
    public void listUnknownStrategyKeepsTheDefault() {
        ListVariableConfig.SelectionStrategy defaultStrategy = VariableFactory.createList("v").getSelectionStrategy();

        ListVariableConfig list = (ListVariableConfig) VariableFactory.createFromMap("v", "LIST",
            Map.of("items", List.of("a"), "selectionStrategy", "nope"));

        assertEquals(defaultStrategy, list.getSelectionStrategy());
    }

    // ---------------------------------------------------------------- point

    @Test
    public void pointFlatRangeKeysOverrideTheRangePoints() {
        Map<String, Object> config = new HashMap<>();
        config.put("minPoint", Map.of("lat", -5, "lon", -6, "alt", -7));
        config.put("maxPoint", Map.of("x", 50));
        config.put("minLat", 1);
        config.put("maxLat", 2);
        config.put("minLon", 3);
        config.put("maxLon", 4);
        config.put("minAlt", 5);
        config.put("maxAlt", 6);

        PointVariableConfig point = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT", config);

        assertEquals(1.0, point.getMinPoint().x, 0.0);
        assertEquals(2.0, point.getMaxPoint().x, 0.0);
        assertEquals(3.0, point.getMinPoint().y, 0.0);
        assertEquals(4.0, point.getMaxPoint().y, 0.0);
        assertEquals(5.0, point.getMinPoint().z, 0.0);
        assertEquals(6.0, point.getMaxPoint().z, 0.0);

        config.put("minZ", 10);
        config.put("maxZ", 20);
        PointVariableConfig withZ = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT", config);
        assertEquals(10.0, withZ.getMinPoint().z, 0.0);
        assertEquals(20.0, withZ.getMaxPoint().z, 0.0);
    }

    @Test
    public void pointRangePointsFillMissingAxesWithTheDefaults() {
        PointVariableConfig point = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT",
            Map.of("minPoint", Map.of("lat", -5, "lon", -6, "alt", -7), "maxPoint", Map.of("x", 50)));

        assertEquals(-5.0, point.getMinPoint().x, 0.0);
        assertEquals(-6.0, point.getMinPoint().y, 0.0);
        assertEquals(-7.0, point.getMinPoint().z, 0.0);
        assertEquals(50.0, point.getMaxPoint().x, 0.0);
        assertEquals(100.0, point.getMaxPoint().y, 0.0);
        assertEquals(100.0, point.getMaxPoint().z, 0.0);
    }

    @Test
    public void pointPolygonReRangesIn2DButNotIn3D() {
        List<Object> polygon = List.of(Map.of("x", 10, "y", 20), Map.of("lat", 30, "lon", 40), "not a point");

        PointVariableConfig flat = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT",
            Map.of("boundaryPolygon", polygon, "coordinateSystem", "CARTESIAN_2D"));
        PointVariableConfig solid = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT",
            Map.of("boundaryPolygon", polygon, "coordinateSystem", "CARTESIAN_3D"));

        assertEquals(2, flat.getBoundaryPolygon().size());
        assertEquals(10.0, flat.getMinPoint().x, 0.0);
        assertEquals(30.0, flat.getMaxPoint().x, 0.0);
        assertEquals(20.0, flat.getMinPoint().y, 0.0);
        assertEquals(40.0, flat.getMaxPoint().y, 0.0);
        assertEquals(0.0, solid.getMinPoint().x, 0.0);
        assertEquals(100.0, solid.getMaxPoint().x, 0.0);
    }

    @Test
    public void pointReadsTheLegacyPathKey() {
        PointVariableConfig point = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT",
            Map.of("path", List.of(Map.of("lat", 1, "lon", 2, "alt", 3), "not a point")));

        assertEquals(1, point.getPath().size());
        assertEquals(1.0, point.getPath().get(0).x, 0.0);
        assertEquals(3.0, point.getPath().get(0).z, 0.0);
    }

    @Test
    public void obstaclesReadTheirFieldsAndDefaults() {
        Map<String, Object> full = Map.of("id", "o1", "name", "Box", "type", "obstacle_polygon", "enabled", false,
            "points", List.of(Map.of("x", 1, "y", 2), "not a point"));
        Map<String, Object> bare = Map.of("type", "nope");

        PointVariableConfig point = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT",
            Map.of("obstacles", List.of(full, bare, "not an obstacle")));

        List<BoundaryObstacle> obstacles = point.getObstacles();
        assertEquals(2, obstacles.size());
        assertEquals("o1", obstacles.get(0).getId());
        assertEquals("Box", obstacles.get(0).getName());
        assertEquals(BoundaryObstacle.ObstacleType.OBSTACLE_POLYGON, obstacles.get(0).getType());
        assertFalse(obstacles.get(0).isEnabled());
        assertEquals(1, obstacles.get(0).getPoints().size());
        assertEquals(0.0, obstacles.get(0).getPoints().get(0).z, 0.0);
        assertEquals("Obstacle", obstacles.get(1).getName());
        assertEquals(BoundaryObstacle.ObstacleType.WALL_SEGMENT, obstacles.get(1).getType());
        assertTrue(obstacles.get(1).isEnabled());
    }

    @Test
    public void graphNodesReadTheLongCoordinateNamesAndAutoAssignIds() {
        PointVariableConfig point = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT",
            Map.of("nodes", List.of(
                Map.of("latitude", 1, "longitude", 2, "altitude", 3),
                "not a node",
                Map.of("id", "n2", "name", "Second", "lat", 4, "lng", 5, "alt", 6))));

        List<GraphNode> nodes = point.getGraphNodes();
        assertEquals(2, nodes.size());
        assertEquals("node-1", nodes.get(0).getId());
        assertEquals("node-1", nodes.get(0).getName());
        assertEquals(1.0, nodes.get(0).getX(), 0.0);
        assertEquals(2.0, nodes.get(0).getY(), 0.0);
        assertEquals(3.0, nodes.get(0).getZ(), 0.0);
        assertEquals("n2", nodes.get(1).getId());
        assertEquals("Second", nodes.get(1).getName());
        assertEquals(5.0, nodes.get(1).getY(), 0.0);
    }

    @Test
    public void graphEdgesAutoAssignIdsAndReadTheDirection() {
        PointVariableConfig point = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT",
            Map.of("graphEdges", List.of(
                Map.of("fromNodeId", "a", "toNodeId", "b", "bidirectional", false),
                "not an edge",
                Map.of("id", "e2", "from", "b", "to", "c"))));

        assertEquals(2, point.getGraphEdges().size());
        assertEquals("edge-1", point.getGraphEdges().get(0).getId());
        assertFalse(point.getGraphEdges().get(0).isBidirectional());
        assertEquals("e2", point.getGraphEdges().get(1).getId());
        assertTrue(point.getGraphEdges().get(1).isBidirectional());
    }

    @Test
    public void graphNavigationReadsTheLegacyKeys() {
        Map<String, Object> config = new HashMap<>();
        config.put("navigationMode", "random_neighbor");
        config.put("sequence", Arrays.asList("a", null, "b"));
        config.put("loopSequence", "false");
        config.put("pauseProbability", "0,5");
        config.put("pauseDurationTicks", "3");
        config.put("antiBacktracking", 0);
        config.put("interpolationSteps", 0);

        PointVariableConfig point = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT", config);

        assertEquals(PointVariableConfig.GraphNavigationMode.RANDOM_NEIGHBOR, point.getGraphNavigationMode());
        assertEquals(List.of("a", "b"), point.getGraphSequence());
        assertFalse(point.isGraphLoopSequence());
        assertEquals(0.5, point.getGraphStopProbability(), 0.0);
        assertEquals(3, point.getGraphStopTicks());
        assertFalse(point.isGraphPreventCycles());
        // The waypoint steps are the fallback, clamped to at least 1
        assertEquals(1, point.getGraphInterpolationSteps());
    }

    @Test
    public void graphNavigationModeKeyWinsAndBadValuesAreIgnored() {
        PointVariableConfig.GraphNavigationMode defaultMode = VariableFactory.createPoint("v").getGraphNavigationMode();

        PointVariableConfig invalid = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT",
            Map.of("graphNavigationMode", "nope", "navigationMode", "RANDOM_NEIGHBOR"));
        PointVariableConfig current = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT",
            Map.of("graphNavigationMode", "RANDOM_NEIGHBOR", "graphInterpolationSteps", 4, "interpolationSteps", 9));

        // An invalid current key does not fall back to the legacy one
        assertEquals(defaultMode, invalid.getGraphNavigationMode());
        assertEquals(PointVariableConfig.GraphNavigationMode.RANDOM_NEIGHBOR, current.getGraphNavigationMode());
        assertEquals(4, current.getGraphInterpolationSteps());
    }
}
