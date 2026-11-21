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
        Variable variable = new Variable("id", "num", "LOCAL", "numeric", 0.0, Map.of("min", 10.0, "max", 10.0), "flow-1", null);
        Object value = generator.generateValue(variable);
        
        assertTrue(value instanceof Double);
        assertEquals(10.0, (Double) value, 0.001);
    }

    @Test
    public void testStringGeneration() {
        Variable variable = new Variable("id", "str", "LOCAL", "string", "default", null, "flow-1", null);
        Object value = generator.generateValue(variable);
        
        assertTrue(value instanceof String);
        assertFalse(((String) value).isEmpty());
    }

    @Test
    public void testBooleanGeneration() {
        Variable variable = new Variable("id", "bool", "LOCAL", "boolean", false, null, "flow-1", null);
        Object value = generator.generateValue(variable);
        
        assertTrue(value instanceof Boolean);
    }

    @Test
    public void testDateGeneration() {
        Variable variable = new Variable("id", "dt", "LOCAL", "date", 0L, null, "flow-1", null);
        Object value = generator.generateValue(variable);
        
        assertTrue(value instanceof java.time.Instant);
    }

    @Test
    public void testPointGeneration() {
        Variable variable = new Variable("id", "pt", "LOCAL", "point", Map.of(), null, "flow-1", null);
        Object value = generator.generateValue(variable);
        
        assertTrue(value instanceof Map);
        Map<?, ?> map = (Map<?, ?>) value;
        assertTrue(map.containsKey("x"));
        assertTrue(map.containsKey("y"));
    }

    @Test
    public void testListGeneration() {
        Variable variable = new Variable("id", "lst", "LOCAL", "list", "default", Map.of("items", List.of("A", "B")), "flow-1", null);
        Object value = generator.generateValue(variable);
        
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

    @Test
    public void sharedValueIsGeneratedOncePerTick() {
        Variable shared = new Variable("g", "g", "GROUP", "numeric", 0.0, Map.of("min", 0.0, "max", 100.0), null, "g1");
        java.util.concurrent.atomic.AtomicInteger calls = new java.util.concurrent.atomic.AtomicInteger();
        java.util.function.Supplier<Object> next = calls::incrementAndGet;

        assertEquals(1, generator.sharedValue(shared, 1, next));
        assertEquals(1, generator.sharedValue(shared, 1, next));
        assertEquals(2, generator.sharedValue(shared, 2, next));
        assertEquals("an older tick gets the latest value", 2, generator.sharedValue(shared, 1, next));
        assertEquals(3, generator.sharedValue(shared, DataGenerator.NO_TICK, next));
        assertEquals(3, calls.get());

        generator.clearCache();
        assertEquals("a cleared cache generates again", 4, generator.sharedValue(shared, 2, next));
    }

    @Test
    public void flowsAskingOnTheSameTickAtOnceGenerateOnce() throws Exception {
        Variable shared = new Variable("g", "g", "GLOBAL", "numeric", 0.0, Map.of("min", 0.0, "max", 100.0), null, null);
        java.util.concurrent.atomic.AtomicInteger calls = new java.util.concurrent.atomic.AtomicInteger();
        int threads = 8;
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(threads);
        java.util.concurrent.CountDownLatch start = new java.util.concurrent.CountDownLatch(1);
        List<java.util.concurrent.Future<Object>> futures = new java.util.ArrayList<>();
        for (int t = 0; t < threads; t++) {
            futures.add(pool.submit(() -> {
                start.await();
                return generator.sharedValue(shared, 7, calls::incrementAndGet);
            }));
        }
        start.countDown();
        for (java.util.concurrent.Future<Object> future : futures) {
            assertEquals(1, future.get(30, java.util.concurrent.TimeUnit.SECONDS));
        }
        pool.shutdown();
        assertEquals(1, calls.get());
    }
}
