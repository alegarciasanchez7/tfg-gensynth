package com.gensynth.core.flow.variables;

import com.gensynth.core.flow.variables.config.GraphEdge;
import com.gensynth.core.flow.variables.config.GraphNode;
import com.gensynth.core.flow.variables.config.PointVariableConfig;
import com.gensynth.core.flow.variables.config.PointVariableConfig.Point3D;
import org.junit.Test;

import java.util.List;

import static org.junit.Assert.*;

/**
 * Basic unit test suite for Graph Route configurations and node/edge connections.
 */
public class GraphRouteTest {

    @Test
    public void testGraphNodeAndEdgeProperties() {
        GraphNode n1 = new GraphNode("node-1", "P1", 10.0, 20.0, 0.0);
        GraphNode n2 = new GraphNode("node-2", "P2", 30.0, 40.0, 5.0);

        assertEquals("node-1", n1.getId());
        assertEquals("P1", n1.getName());
        assertEquals(10.0, n1.getX(), 0.0001);
        assertEquals(20.0, n1.getY(), 0.0001);
        assertEquals(0.0, n1.getZ(), 0.0001);
        assertEquals(new Point3D(10.0, 20.0, 0.0), n1.toPoint3D());

        assertEquals("node-2", n2.getId());
        assertEquals("P2", n2.getName());
        assertEquals(30.0, n2.getX(), 0.0001);
        assertEquals(40.0, n2.getY(), 0.0001);
        assertEquals(5.0, n2.getZ(), 0.0001);
        assertEquals(new Point3D(30.0, 40.0, 5.0), n2.toPoint3D());

        GraphEdge edge = new GraphEdge("edge-1", "node-1", "node-2", true);
        assertTrue(edge.isBidirectional());
        assertTrue(edge.connectsNode("node-1"));
        assertTrue(edge.connectsNode("node-2"));
        assertFalse(edge.connectsNode("node-3"));
        assertEquals("node-2", edge.getNeighborId("node-1"));
        assertEquals("node-1", edge.getNeighborId("node-2"));
    }

    @Test
    public void testPointVariableConfigGraphValidation() {
        PointVariableConfig config = new PointVariableConfig();
        config.pattern(GenerationPattern.GRAPH_ROUTE);

        List<String> errors = config.validate();
        assertTrue("Initial config should be valid", errors.isEmpty());

        config.graphStopProbability(-0.5);
        assertFalse(config.validate().isEmpty());
        config.graphStopProbability(0.5);

        config.graphStopTicks(-1);
        assertFalse(config.validate().isEmpty());
        config.graphStopTicks(2);

        config.graphInterpolationSteps(0);
        assertFalse(config.validate().isEmpty());
        config.graphInterpolationSteps(1);

        assertTrue(config.validate().isEmpty());
    }
}

