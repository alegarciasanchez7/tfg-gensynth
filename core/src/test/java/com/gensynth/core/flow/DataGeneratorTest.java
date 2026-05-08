package com.gensynth.core.flow;

import com.gensynth.core.model.Variable;
import org.junit.Before;
import org.junit.Test;

import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

public class DataGeneratorTest {

    private DataGenerator generator;

    @Before
    public void setUp() {
        generator = new DataGenerator();
    }

    @Test
    public void testNumericGeneration() {
        Variable var = new Variable("id", "num", "LOCAL", "numeric", 0.0, Map.of("min", 10.0, "max", 10.0));
        Object value = generator.generateValue(var);
        
        assertTrue(value instanceof Double);
        assertEquals(10.0, (Double) value, 0.001);
    }

    @Test
    public void testStringGeneration() {
        Variable var = new Variable("id", "str", "LOCAL", "string", "default", null);
        Object value = generator.generateValue(var);
        
        assertTrue(value instanceof String);
        assertFalse(((String) value).isEmpty());
    }

    @Test
    public void testBooleanGeneration() {
        Variable var = new Variable("id", "bool", "LOCAL", "boolean", false, null);
        Object value = generator.generateValue(var);
        
        assertTrue(value instanceof Boolean);
    }

    @Test
    public void testDateGeneration() {
        Variable var = new Variable("id", "dt", "LOCAL", "date", 0L, null);
        Object value = generator.generateValue(var);
        
        assertTrue(value instanceof Long);
        assertTrue((Long) value > 0);
    }

    @Test
    public void testPointGeneration() {
        Variable var = new Variable("id", "pt", "LOCAL", "point", Map.of(), null);
        Object value = generator.generateValue(var);
        
        assertTrue(value instanceof Map);
        Map<?, ?> map = (Map<?, ?>) value;
        assertTrue(map.containsKey("x"));
        assertTrue(map.containsKey("y"));
        assertTrue(map.containsKey("z"));
    }

    @Test
    public void testListGeneration() {
        Variable var = new Variable("id", "lst", "LOCAL", "list", List.of(), null);
        Object value = generator.generateValue(var);
        
        assertTrue(value instanceof List);
        assertFalse(((List<?>) value).isEmpty());
    }
}
