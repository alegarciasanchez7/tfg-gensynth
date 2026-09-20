package com.gensynth.core.flow.variables;

import com.gensynth.core.flow.variables.config.PointVariableConfig;
import org.junit.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

public class GraphRoutePauseAndStepsTest {

    @Test
    public void testDeserializationOfGraphPauseAndSteps() {
        Map<String, Object> configMap = new HashMap<>();
        configMap.put("pattern", "GRAPH_ROUTE");
        configMap.put("graphStopProbability", "0,9"); // String with comma
        configMap.put("graphStopTicks", "15");
        configMap.put("graphInterpolationSteps", "3");
        configMap.put("graphPreventCycles", "true");

        List<Map<String, Object>> nodes = new ArrayList<>();
        Map<String, Object> n1 = Map.of("id", "n1", "name", "Node 1", "x", 0.0, "y", 0.0, "z", 0.0);
        Map<String, Object> n2 = Map.of("id", "n2", "name", "Node 2", "x", 30.0, "y", 0.0, "z", 0.0);
        nodes.add(n1);
        nodes.add(n2);
        configMap.put("graphNodes", nodes);

        List<Map<String, Object>> edges = new ArrayList<>();
        edges.add(Map.of("id", "e1", "fromNodeId", "n1", "toNodeId", "n2", "bidirectional", true));
        configMap.put("graphEdges", edges);

        PointVariableConfig config = (PointVariableConfig) VariableFactory.createFromMap("testVar", "point", configMap);

        assertEquals(0.9, config.getGraphStopProbability(), 0.001);
        assertEquals(15, config.getGraphStopTicks());
        assertEquals(3, config.getGraphInterpolationSteps());
        assertTrue(config.isGraphPreventCycles());
    }

    @Test
    public void testPauseTicksExecutionAtNode() {
        Map<String, Object> configMap = new HashMap<>();
        configMap.put("pattern", "GRAPH_ROUTE");
        configMap.put("coordinateSystem", "CARTESIAN_2D");
        configMap.put("graphStopProbability", 1.0); // 100% pause
        configMap.put("graphStopTicks", 5);
        configMap.put("graphInterpolationSteps", 1);

        List<Map<String, Object>> nodes = new ArrayList<>();
        nodes.add(Map.of("id", "n1", "name", "Node 1", "x", 0.0, "y", 0.0));
        nodes.add(Map.of("id", "n2", "name", "Node 2", "x", 10.0, "y", 0.0));
        configMap.put("graphNodes", nodes);

        List<Map<String, Object>> edges = new ArrayList<>();
        edges.add(Map.of("id", "e1", "fromNodeId", "n1", "toNodeId", "n2", "bidirectional", true));
        configMap.put("graphEdges", edges);

        PointVariableConfig config = (PointVariableConfig) VariableFactory.createFromMap("pos", "point", configMap);

        // Tick 0: Initial spawn at Node 1
        Object val0 = config.generateNextValue();
        assertTrue(val0 instanceof Map);
        assertEquals("Node 1", ((Map<?, ?>) val0).get("nodeName"));

        // Next 5 ticks stay paused at Node 1 (pause duration = 5 ticks)
        for (int i = 0; i < 5; i++) {
            Map<?, ?> valMap = (Map<?, ?>) config.generateNextValue();
            assertEquals("Node 1", valMap.get("nodeName"));
        }

        // Following tick moves to Node 2
        Map<?, ?> valNext = (Map<?, ?>) config.generateNextValue();
        assertEquals("Node 2", valNext.get("nodeName"));
    }

    @Test
    public void testEdgeInterpolationSteps() {
        Map<String, Object> configMap = new HashMap<>();
        configMap.put("pattern", "GRAPH_ROUTE");
        configMap.put("coordinateSystem", "CARTESIAN_2D");
        configMap.put("graphStopProbability", 0.0); // No pauses
        configMap.put("graphInterpolationSteps", 2); // 2 steps per edge (0.5 fraction mid-way)

        List<Map<String, Object>> nodes = new ArrayList<>();
        nodes.add(Map.of("id", "n1", "name", "Node 1", "x", 0.0, "y", 0.0));
        nodes.add(Map.of("id", "n2", "name", "Node 2", "x", 10.0, "y", 0.0));
        configMap.put("graphNodes", nodes);

        List<Map<String, Object>> edges = new ArrayList<>();
        edges.add(Map.of("id", "e1", "fromNodeId", "n1", "toNodeId", "n2", "bidirectional", true));
        configMap.put("graphEdges", edges);

        PointVariableConfig config = (PointVariableConfig) VariableFactory.createFromMap("pos", "point", configMap);

        // Tick 0: Start at n1 (0,0)
        Map<?, ?> map0 = (Map<?, ?>) config.generateNextValue();
        assertEquals(0.0, ((Number) map0.get("x")).doubleValue(), 0.001);

        // Tick 1: Step 1 of 2 along edge -> fraction 0.5 -> x = 5.0
        Map<?, ?> map1 = (Map<?, ?>) config.generateNextValue();
        assertEquals(5.0, ((Number) map1.get("x")).doubleValue(), 0.001);

        // Tick 2: Step 2 of 2 -> reaches n2 -> x = 10.0
        Map<?, ?> map2 = (Map<?, ?>) config.generateNextValue();
        assertEquals(10.0, ((Number) map2.get("x")).doubleValue(), 0.001);
    }
}

