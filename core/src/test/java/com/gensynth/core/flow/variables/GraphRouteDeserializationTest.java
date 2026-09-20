package com.gensynth.core.flow.variables;

import com.gensynth.core.flow.DataGenerator;
import com.gensynth.core.flow.variables.config.PointVariableConfig;
import com.gensynth.core.model.Variable;
import org.junit.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/**
 * Unit tests verifying Graph Route deserialization from JSON configuration maps
 * and generation of coordinates by DataGenerator.
 */
public class GraphRouteDeserializationTest {

    @Test
    public void testGraphRouteDeserializationWithFullNodesAndEdges() {
        Map<String, Object> configMap = new HashMap<>();
        configMap.put("pattern", "GRAPH_ROUTE");
        configMap.put("coordinateSystem", "GEOSPATIAL");

        List<Map<String, Object>> nodes = new ArrayList<>();
        Map<String, Object> n1 = new HashMap<>();
        n1.put("id", "n1");
        n1.put("name", "Node 1");
        n1.put("lat", 36.5386);
        n1.put("lon", -6.2020);
        n1.put("alt", 10.0);
        nodes.add(n1);

        Map<String, Object> n2 = new HashMap<>();
        n2.put("id", "n2");
        n2.put("name", "Node 2");
        n2.put("lat", 36.5390);
        n2.put("lon", -6.2015);
        n2.put("alt", 15.0);
        nodes.add(n2);

        configMap.put("graphNodes", nodes);

        List<Map<String, Object>> edges = new ArrayList<>();
        Map<String, Object> e1 = new HashMap<>();
        e1.put("id", "e1");
        e1.put("fromNodeId", "n1");
        e1.put("toNodeId", "n2");
        e1.put("bidirectional", true);
        edges.add(e1);

        configMap.put("graphEdges", edges);

        VariableConfiguration config = VariableFactory.createFromMap("position", "POINT", configMap);
        assertTrue(config instanceof PointVariableConfig);

        Variable var = new Variable("var-pos-1", "position", "GLOBAL", "point", "default", configMap, null, null);

        DataGenerator generator = new DataGenerator();
        Object value = generator.generateValue(var);

        assertTrue("Generated value should be a Map", value instanceof Map<?, ?>);
        Map<?, ?> resultMap = (Map<?, ?>) value;
        assertTrue(resultMap.containsKey("latitude"));
        assertTrue(resultMap.containsKey("longitude"));

        double lat = ((Number) resultMap.get("latitude")).doubleValue();
        double lon = ((Number) resultMap.get("longitude")).doubleValue();

        assertTrue("Latitude should match one of the graph node latitudes", lat == 36.5386 || lat == 36.5390);
        assertTrue("Longitude should match one of the graph node longitudes", lon == -6.2020 || lon == -6.2015);
    }

    @Test
    public void testGraphRouteDeserializationWithCoordinatesOnlyNoIdOrName() {
        Map<String, Object> configMap = new HashMap<>();
        configMap.put("pattern", "GRAPH_ROUTE");
        configMap.put("coordinateSystem", "GEOSPATIAL");

        // Nodes defined ONLY with coordinates (no id or name)
        List<Map<String, Object>> nodes = new ArrayList<>();
        Map<String, Object> n1 = new HashMap<>();
        n1.put("latitude", 37.7749);
        n1.put("longitude", -122.4194);
        nodes.add(n1);

        Map<String, Object> n2 = new HashMap<>();
        n2.put("latitude", 37.7755);
        n2.put("longitude", -122.4180);
        nodes.add(n2);

        configMap.put("nodes", nodes);

        Variable var = new Variable("var-pos-coords-only", "position", "GLOBAL", "point", "default", configMap, null, null);

        DataGenerator generator = new DataGenerator();
        Object value = generator.generateValue(var);

        assertTrue("Generated value should be a Map", value instanceof Map<?, ?>);
        Map<?, ?> resultMap = (Map<?, ?>) value;
        assertTrue(resultMap.containsKey("latitude"));
        assertTrue(resultMap.containsKey("longitude"));

        double lat = ((Number) resultMap.get("latitude")).doubleValue();
        double lon = ((Number) resultMap.get("longitude")).doubleValue();

        assertEquals(37.7749, lat, 0.0001);
        assertEquals(-122.4194, lon, 0.0001);
    }
}

