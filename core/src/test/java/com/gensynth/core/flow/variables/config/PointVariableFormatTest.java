package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.CoordinateSystem;
import com.gensynth.core.flow.variables.GenerationPattern;
import com.gensynth.core.flow.variables.GeospatialFormat;
import com.gensynth.core.flow.variables.config.PointVariableConfig.GraphNavigationMode;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/** Output map of a point: keys and their order per coordinate system, and the Graph Route fields. */
public class PointVariableFormatTest {

    private static Map<?, ?> fixedValue(CoordinateSystem system, GeospatialFormat format) {
        return (Map<?, ?>) new PointVariableConfig()
            .pattern(GenerationPattern.FIXED_POINT)
            .coordinateSystem(system)
            .geospatialFormat(format)
            .fixedPoint(36.5, -6.25, 12.0)
            .generateNextValue();
    }

    @Test
    public void cartesianOutputsOnlyTheirAxes() {
        assertEquals(List.of("x", "y"),
            new ArrayList<>(fixedValue(CoordinateSystem.CARTESIAN_2D, GeospatialFormat.DECIMAL_DEGREES).keySet()));
        assertEquals(List.of("x", "y", "z"),
            new ArrayList<>(fixedValue(CoordinateSystem.CARTESIAN_3D, GeospatialFormat.DECIMAL_DEGREES).keySet()));
    }

    @Test
    public void geospatialDecimalDegreesOutputsNumbersAndAltitudeMetadata() {
        Map<?, ?> value = fixedValue(CoordinateSystem.GEOSPATIAL, GeospatialFormat.DECIMAL_DEGREES);

        assertEquals(List.of("latitude", "longitude", "altitude", "altitudeUnit", "altitudeReference"),
            new ArrayList<>(value.keySet()));
        assertEquals(36.5, value.get("latitude"));
        assertEquals(-6.25, value.get("longitude"));
        assertEquals("METERS", value.get("altitudeUnit"));
        assertEquals("MSL", value.get("altitudeReference"));
    }

    @Test
    public void geospatialDmsOutputsTextAndKeepsTheDecimalValues() {
        Map<?, ?> value = fixedValue(CoordinateSystem.GEOSPATIAL, GeospatialFormat.DEGREES_MINUTES_SECONDS);

        assertEquals(List.of("latitude", "longitude", "altitude", "latitudeDecimal", "longitudeDecimal",
            "altitudeUnit", "altitudeReference"), new ArrayList<>(value.keySet()));
        assertEquals("36° 30' 0.00\" N", value.get("latitude"));
        assertEquals("6° 15' 0.00\" W", value.get("longitude"));
        assertEquals(36.5, value.get("latitudeDecimal"));
        assertEquals(-6.25, value.get("longitudeDecimal"));
    }

    @Test
    public void graphRouteFallsBackToTheNodeIdWhenTheNameIsBlank() {
        PointVariableConfig config = new PointVariableConfig()
            .pattern(GenerationPattern.GRAPH_ROUTE)
            .coordinateSystem(CoordinateSystem.CARTESIAN_2D)
            .addGraphNode(new GraphNode("A", null, 0, 0, 0))
            .addGraphNode(new GraphNode("B", "  ", 10, 0, 0))
            .addGraphEdge(new GraphEdge("e1", "A", "B", true))
            .graphNavigationMode(GraphNavigationMode.SEQUENCE)
            .graphSequence(List.of("A", "B"))
            .graphInterpolationSteps(2);

        Map<?, ?> start = (Map<?, ?>) config.generateNextValue();
        assertEquals("A", start.get("nodeName"));
        assertEquals("A", start.get("targetNodeName"));

        Map<?, ?> halfway = (Map<?, ?>) config.generateNextValue();
        assertEquals(5.0, halfway.get("x"));
        assertEquals("B", halfway.get("targetNodeId"));
        assertEquals("B", halfway.get("targetNodeName"));
        assertEquals(1, halfway.get("stepInEdge"));
        assertEquals(2, halfway.get("totalEdgeSteps"));
        assertEquals(false, halfway.get("isPaused"));
    }

    @Test
    public void graphRouteWithoutNodesReturnsTheFixedPointWithoutRouteFields() {
        Map<?, ?> value = (Map<?, ?>) new PointVariableConfig()
            .pattern(GenerationPattern.GRAPH_ROUTE)
            .coordinateSystem(CoordinateSystem.CARTESIAN_2D)
            .fixedPoint(3, 4, 0)
            .generateNextValue();

        assertEquals(Map.of("x", 3.0, "y", 4.0), value);
    }

    @Test
    public void sequenceModeWithoutASequenceStaysOnTheFirstNode() {
        PointVariableConfig config = new PointVariableConfig()
            .pattern(GenerationPattern.GRAPH_ROUTE)
            .coordinateSystem(CoordinateSystem.CARTESIAN_2D)
            .addGraphNode(new GraphNode("A", "Start", 1, 2, 0))
            .addGraphNode(new GraphNode("B", "End", 10, 0, 0))
            .addGraphEdge(new GraphEdge("e1", "A", "B", true))
            .graphNavigationMode(GraphNavigationMode.SEQUENCE);

        for (int i = 0; i < 3; i++) {
            Map<?, ?> value = (Map<?, ?>) config.generateNextValue();
            assertEquals(1.0, value.get("x"));
            assertEquals("A", value.get("nodeId"));
            assertEquals("Start", value.get("nodeName"));
        }
    }
}
