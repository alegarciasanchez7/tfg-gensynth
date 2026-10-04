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
        Variable var = new Variable("id", "num", "LOCAL", "numeric", 0.0, Map.of("min", 10.0, "max", 10.0), "flow-1", null);
        Object value = generator.generateValue(var);
        
        assertTrue(value instanceof Double);
        assertEquals(10.0, (Double) value, 0.001);
    }

    @Test
    public void testStringGeneration() {
        Variable var = new Variable("id", "str", "LOCAL", "string", "default", null, "flow-1", null);
        Object value = generator.generateValue(var);
        
        assertTrue(value instanceof String);
        assertFalse(((String) value).isEmpty());
    }

    @Test
    public void testBooleanGeneration() {
        Variable var = new Variable("id", "bool", "LOCAL", "boolean", false, null, "flow-1", null);
        Object value = generator.generateValue(var);
        
        assertTrue(value instanceof Boolean);
    }

    @Test
    public void testDateGeneration() {
        Variable var = new Variable("id", "dt", "LOCAL", "date", 0L, null, "flow-1", null);
        Object value = generator.generateValue(var);
        
        assertTrue(value instanceof java.time.Instant);
    }

    @Test
    public void testPointGeneration() {
        Variable var = new Variable("id", "pt", "LOCAL", "point", Map.of(), null, "flow-1", null);
        Object value = generator.generateValue(var);
        
        assertTrue(value instanceof Map);
        Map<?, ?> map = (Map<?, ?>) value;
        assertTrue(map.containsKey("x"));
        assertTrue(map.containsKey("y"));
    }

    @Test
    public void testListGeneration() {
        Variable var = new Variable("id", "lst", "LOCAL", "list", "default", Map.of("items", List.of("A", "B")), "flow-1", null);
        Object value = generator.generateValue(var);
        
        assertTrue(value instanceof String);
        assertTrue(List.of("A", "B").contains((String) value));
    }

    @Test
    public void sharedVariableIsSafeAcrossConcurrentFlows() throws Exception {
        // A GLOBAL variable cached once and used by flows generating on different threads
        Variable shared = new Variable("shared", "shared", "GLOBAL", "numeric", 0.0, Map.of("min", 0.0, "max", 100.0), null, null);
        int threads = 8;
        int perThread = 1000;
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(threads);
        java.util.concurrent.CountDownLatch start = new java.util.concurrent.CountDownLatch(1);
        List<java.util.concurrent.Future<?>> futures = new java.util.ArrayList<>();
        for (int t = 0; t < threads; t++) {
            futures.add(pool.submit(() -> {
                start.await();
                for (int i = 0; i < perThread; i++) {
                    generator.generateValue(shared, new java.util.HashMap<>());
                }
                return null;
            }));
        }
        start.countDown();
        for (java.util.concurrent.Future<?> future : futures) {
            future.get(30, java.util.concurrent.TimeUnit.SECONDS);
        }
        pool.shutdown();

        java.util.Map<String, Object> context = new java.util.HashMap<>();
        generator.generateValue(shared, context);
        com.gensynth.core.flow.variables.ConfigurableVariable cv =
            (com.gensynth.core.flow.variables.ConfigurableVariable) context.get("shared_config");
        assertEquals("no generation may be lost", threads * perThread + 1L, cv.getConfiguration().getTickCounter());
    }
}
