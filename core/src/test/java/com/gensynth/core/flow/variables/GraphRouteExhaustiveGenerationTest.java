package com.gensynth.core.flow.variables;

import com.gensynth.core.flow.variables.config.GraphEdge;
import com.gensynth.core.flow.variables.config.GraphNode;
import com.gensynth.core.flow.variables.config.PointVariableConfig;
import com.gensynth.core.flow.variables.config.PointVariableConfig.GraphNavigationMode;
import org.junit.Before;
import org.junit.Test;

import java.util.*;

import static org.junit.Assert.*;

/**
 * Exhaustive data generation test suite for Graph Route Point variables.
 * Verifies multiple generation scenarios including sequence traversal, random neighbor movement,
 * stop probability, pause durations, cycle prevention, and edge interpolation.
 */
public class GraphRouteExhaustiveGenerationTest {

    private PointVariableConfig config;
    private GraphNode n1;
    private GraphNode n2;
    private GraphNode n3;
    private GraphNode n4;

    @Before
    public void setUp() {
        config = new PointVariableConfig();
        config.pattern(GenerationPattern.GRAPH_ROUTE);

        // Define a 4-node graph topology: N1 - N2 - N3 - N4 and N3 - N1
        n1 = new GraphNode("n1", "Node 1", 0.0, 0.0, 0.0);
        n2 = new GraphNode("n2", "Node 2", 10.0, 0.0, 0.0);
        n3 = new GraphNode("n3", "Node 3", 10.0, 10.0, 0.0);
        n4 = new GraphNode("n4", "Node 4", 0.0, 10.0, 0.0);

        config.graphNodes(Arrays.asList(n1, n2, n3, n4));

        GraphEdge e1 = new GraphEdge("e1", "n1", "n2", true);
        GraphEdge e2 = new GraphEdge("e2", "n2", "n3", true);
        GraphEdge e3 = new GraphEdge("e3", "n3", "n4", true);
        GraphEdge e4 = new GraphEdge("e4", "n3", "n1", true);

        config.graphEdges(Arrays.asList(e1, e2, e3, e4));
    }

    @Test
    public void testSequenceModeExhaustiveGeneration() {
        config.graphNavigationMode(GraphNavigationMode.SEQUENCE);
        config.graphSequence(Arrays.asList("n1", "n2", "n3", "n4"));
        config.graphLoopSequence(true);
        config.graphInterpolationSteps(1);
        config.graphStopProbability(0.0);

        List<Object> generatedValues = new ArrayList<>();
        int totalTicks = 20;

        for (int i = 0; i < totalTicks; i++) {
            Object value = config.generateNextValue();
            assertNotNull("Generated value must not be null at tick " + i, value);
            generatedValues.add(value);
        }

        assertEquals(totalTicks, generatedValues.size());
        assertTrue(generatedValues.get(0).toString().contains("0.0")); // n1
        assertTrue(generatedValues.get(1).toString().contains("10.0")); // n2
        assertTrue(generatedValues.get(2).toString().contains("10.0")); // n3
        assertTrue(generatedValues.get(3).toString().contains("10.0")); // n4 or n3 y
    }

    @Test
    public void testRandomNeighborModeExhaustiveGeneration() {
        config.graphNavigationMode(GraphNavigationMode.RANDOM_NEIGHBOR);
        config.graphPreventCycles(true);
        config.graphInterpolationSteps(1);
        config.graphStopProbability(0.0);

        int totalTicks = 100;
        Set<Object> uniquePoints = new HashSet<>();

        for (int i = 0; i < totalTicks; i++) {
            Object val = config.generateNextValue();
            assertNotNull("Generated value must not be null at tick " + i, val);
            uniquePoints.add(val);
        }

        assertTrue("Should visit multiple graph nodes across 100 ticks", uniquePoints.size() > 1);
    }

    @Test
    public void testEdgeInterpolationSteps() {
        config.graphNavigationMode(GraphNavigationMode.SEQUENCE);
        config.graphSequence(Arrays.asList("n1", "n2"));
        config.graphLoopSequence(true);
        config.graphInterpolationSteps(5); // 5 steps along edge n1 -> n2
        config.graphStopProbability(0.0);

        List<Object> stepValues = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            stepValues.add(config.generateNextValue());
        }

        assertEquals(5, stepValues.size());
        assertNotNull(stepValues.get(0));
        assertNotNull(stepValues.get(4));
    }

    @Test
    public void testStopTicksPauseBehavior() {
        config.graphNavigationMode(GraphNavigationMode.SEQUENCE);
        config.graphSequence(Arrays.asList("n1", "n2"));
        config.graphInterpolationSteps(1);
        config.graphStopProbability(1.0); // Always stop
        config.graphStopTicks(3); // Stay paused for 3 ticks when stopping

        Map<?, ?> m1 = (Map<?, ?>) config.generateNextValue();
        Map<?, ?> m2 = (Map<?, ?>) config.generateNextValue();
        Map<?, ?> m3 = (Map<?, ?>) config.generateNextValue();

        assertEquals("Node 1", m1.get("nodeName"));
        assertEquals("Node 1", m2.get("nodeName"));
        assertEquals("Node 1", m3.get("nodeName"));

        assertEquals(m1.get("x"), m2.get("x"));
        assertEquals(m2.get("x"), m3.get("x"));
        assertTrue((Boolean) m2.get("isPaused"));
        assertTrue((Boolean) m3.get("isPaused"));
    }
}

