package com.gensynth.core.flow;

import com.gensynth.core.model.Variable;
import org.junit.Before;
import org.junit.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/**
 * Unit tests verifying template engine sub-property extraction for Point variables
 * (e.g., {{local.position.latitude}}, {{local.position.nodeName}}, {{position.x}}).
 */
public class PointSubPropertyTemplateTest {

    private TemplateEngine templateEngine;
    private Map<String, Variable> variables;

    @Before
    public void setUp() {
        templateEngine = new TemplateEngine();
        variables = new HashMap<>();

        // 1. Geospatial Graph Route Point Variable
        Map<String, Object> geoConfig = new HashMap<>();
        geoConfig.put("pattern", "GRAPH_ROUTE");
        geoConfig.put("coordinateSystem", "GEOSPATIAL");
        geoConfig.put("geospatialFormat", "DECIMAL_DEGREES");

        List<Map<String, Object>> nodes = new ArrayList<>();
        Map<String, Object> n1 = new HashMap<>();
        n1.put("id", "node-hospital");
        n1.put("name", "Hospital Central");
        n1.put("latitude", 36.5386);
        n1.put("longitude", -6.2020);
        n1.put("altitude", 12.5);
        nodes.add(n1);

        geoConfig.put("graphNodes", nodes);

        Variable posVar = new Variable("var-pos", "position", "LOCAL", "point", "default", geoConfig, "flow-1", "group-1");
        variables.put(posVar.getId(), posVar);

        // 2. Cartesian 2D Point Variable
        Map<String, Object> cartConfig = new HashMap<>();
        cartConfig.put("pattern", "FIXED_POINT");
        cartConfig.put("coordinateSystem", "CARTESIAN_2D");

        Map<String, Object> fixedPt = new HashMap<>();
        fixedPt.put("x", 42.5);
        fixedPt.put("y", 88.0);
        cartConfig.put("fixedPoint", fixedPt);

        Variable cartVar = new Variable("var-cart", "cartesianPoint", "LOCAL", "point", "default", cartConfig, "flow-1", "group-1");
        variables.put(cartVar.getId(), cartVar);
    }

    @Test
    public void testPointSubPropertyLatitudeLongitudeAndNodeName() {
        String template = "Resident is at {{local.position.nodeName}} (Lat: {{local.position.latitude}}, Lon: {{local.position.longitude}})";
        String result = templateEngine.evaluate(template, 1L, variables, "flow-1", "group-1");

        assertTrue("Result should contain nodeName", result.contains("Resident is at Hospital Central"));
        assertTrue("Result should contain latitude 36.5386", result.contains("Lat: 36.5386"));
        assertTrue("Result should contain longitude -6.202", result.contains("Lon: -6.202"));
    }

    @Test
    public void testPointSubPropertyCartesianXAndYWithoutScopePrefix() {
        String template = "Point X={{cartesianPoint.x}}, Y={{cartesianPoint.y}}";
        String result = templateEngine.evaluate(template, 1L, variables, "flow-1", "group-1");

        assertEquals("Point X=42.5, Y=88.0", result);
    }

    @Test
    public void testPointSubPropertyAliasesForNodeNameAndNodeId() {
        String template = "Node={{local.position.node}}, ID={{local.position.nodeId}}";
        String result = templateEngine.evaluate(template, 1L, variables, "flow-1", "group-1");

        assertEquals("Node=Hospital Central, ID=node-hospital", result);
    }

    @Test
    public void testFullPointEvaluationVersusSubPropertyEvaluation() {
        // Sub-property nodeName only returns the string name "Hospital Central"
        String singlePropTemplate = "\"position\": \"{{local.position.nodeName}}\"";
        String singlePropResult = templateEngine.evaluate(singlePropTemplate, 1L, variables, "flow-1", "group-1");
        assertEquals("\"position\": \"Hospital Central\"", singlePropResult);

        // Full point variable reference without sub-property returns valid JSON map
        String fullPointTemplate = "\"position\": {{local.position}}";
        String fullPointResult = templateEngine.evaluate(fullPointTemplate, 1L, variables, "flow-1", "group-1");
        assertTrue(fullPointResult.contains("\"nodeName\": \"Hospital Central\""));
        assertTrue(fullPointResult.contains("\"latitude\": 36.5386"));
        assertTrue(fullPointResult.contains("\"longitude\": -6.202"));
    }
}
