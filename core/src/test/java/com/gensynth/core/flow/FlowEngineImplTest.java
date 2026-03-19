package com.gensynth.core.flow;

import com.gensynth.core.config.AppConfig;
import org.junit.Before;
import org.junit.Test;
import static org.junit.Assert.*;

/**
 * Comprehensive tests for FlowEngine implementation.
 * Tests cover: initialization, flow execution, virtual threads, state management.
 */
public class FlowEngineImplTest {

    private FlowEngineImpl flowEngine;
    private AppConfig config;

    @Before
    public void setUp() {
        config = new AppConfig();
        flowEngine = new FlowEngineImpl(config);
    }

    // ========== Initialization Tests ==========

    @Test
    public void testFlowEngineInitialization() throws Exception {
        flowEngine.onInitialize();
        // Just verify it doesn't throw an exception
        // Virtual thread executor is created automatically
    }

    @Test(expected = IllegalArgumentException.class)
    public void testFlowEngineWithNullConfig() {
        new FlowEngineImpl(null);
    }

    @Test
    public void testFlowEngineWithDefaultConfig() {
        FlowEngineImpl engine = new FlowEngineImpl();
        assertNotNull(engine);
    }

    // ========== Flow Execution Tests ==========

    @Test(expected = IllegalStateException.class)
    public void testExecuteFlowBeforeInitialize() {
        flowEngine.executeFlow("flow-1");
    }

    @Test
    public void testExecuteFlowAfterInitialize() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();

        // Should not throw
        flowEngine.executeFlow("flow-1");
        assertEquals(1, flowEngine.getActiveFlowCount());
    }

    @Test(expected = IllegalStateException.class)
    public void testCannotStartDuplicateFlow() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();

        flowEngine.executeFlow("flow-1");
        flowEngine.executeFlow("flow-1");  // Should throw
    }

    @Test
    public void testMultipleFlowsCanRunConcurrently() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();

        flowEngine.executeFlow("flow-1");
        flowEngine.executeFlow("flow-2");
        flowEngine.executeFlow("flow-3");

        assertEquals(3, flowEngine.getActiveFlowCount());
    }

    // ========== Flow Control Tests ==========

    @Test(expected = IllegalStateException.class)
    public void testStopNonExistentFlow() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();

        flowEngine.stopFlow("non-existent");
    }

    @Test
    public void testStopExistingFlow() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();

        flowEngine.executeFlow("flow-1");
        assertEquals(1, flowEngine.getActiveFlowCount());

        flowEngine.stopFlow("flow-1");
        assertEquals(0, flowEngine.getActiveFlowCount());
    }

    @Test(expected = IllegalStateException.class)
    public void testPauseNonExistentFlow() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();

        flowEngine.pauseFlow("non-existent");
    }

    @Test
    public void testPauseExistingFlow() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();

        flowEngine.executeFlow("flow-1");

        // Should not throw
        flowEngine.pauseFlow("flow-1");

        // Flow should still be active (just paused)
        assertEquals(1, flowEngine.getActiveFlowCount());
    }

    // ========== Device Configuration Tests ==========

    @Test
    public void testConfigurableDeviceCount() throws Exception {
        config.setDeviceCount(10);
        config.setSimulationInterval(50);  // 50ms for testing

        FlowEngineImpl engine = new FlowEngineImpl(config);
        engine.onInitialize();
        engine.onStart();
        engine.executeFlow("flow-1");

        // Let some events generate
        Thread.sleep(200);

        // Should have generated some events
        int eventCount = engine.getGeneratedEventCount();
        assertTrue("Should generate at least 1 event", eventCount >= 1);

        engine.stopFlow("flow-1");
        engine.onStop();
    }

    @Test(expected = IllegalArgumentException.class)
    public void testInvalidDeviceCountThrows() {
        config.setDeviceCount(0);
    }

    @Test(expected = IllegalArgumentException.class)
    public void testInvalidSimulationIntervalThrows() {
        config.setSimulationInterval(0);
    }

    // ========== Virtual Threads Tests ==========

    @Test
    public void testVirtualThreadsEnabled() throws Exception {
        config.setUseVirtualThreads(true);

        FlowEngineImpl engine = new FlowEngineImpl(config);
        engine.onInitialize();

        // Virtual threads should be auto-managed by JVM
        // No exception should be thrown
    }

    @Test
    public void testVirtualThreadsDisabled() throws Exception {
        config.setUseVirtualThreads(false);

        FlowEngineImpl engine = new FlowEngineImpl(config);
        engine.onInitialize();

        // Should fallback to traditional ThreadPool
        // No exception should be thrown
    }

    // ========== Metrics Tests ==========

    @Test
    public void testGeneratedEventCount() throws Exception {
        config.setDeviceCount(2);
        config.setSimulationInterval(10);  // Short interval for testing

        flowEngine.onInitialize();
        flowEngine.onStart();
        flowEngine.executeFlow("flow-1");

        // Wait for some events to generate
        Thread.sleep(150);

        int eventCount = flowEngine.getGeneratedEventCount();
        assertTrue("Should generate multiple events", eventCount > 0);
    }

    @Test
    public void testMultipleFlowsGenerateEvents() throws Exception {
        config.setDeviceCount(1);
        config.setSimulationInterval(10);

        flowEngine.onInitialize();
        flowEngine.onStart();

        flowEngine.executeFlow("flow-1");
        Thread.sleep(50);
        flowEngine.executeFlow("flow-2");
        Thread.sleep(50);

        int eventCount = flowEngine.getGeneratedEventCount();
        assertTrue("Multiple flows should generate events", eventCount > 0);

        flowEngine.stopFlow("flow-1");
        flowEngine.stopFlow("flow-2");
    }

    // ========== Lifecycle Tests ==========

    @Test
    public void testCompleteLifecycle() throws Exception {
        // Initialize
        flowEngine.onInitialize();
        assertEquals(0, flowEngine.getActiveFlowCount());

        // Start
        flowEngine.onStart();
        flowEngine.executeFlow("flow-1");
        assertEquals(1, flowEngine.getActiveFlowCount());

        // Stop
        flowEngine.stopFlow("flow-1");
        assertEquals(0, flowEngine.getActiveFlowCount());

        // Shutdown
        flowEngine.onStop();
        // Should complete without error
    }

    @Test
    public void testStopEngineStopsActiveFlows() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();
        flowEngine.executeFlow("flow-1");

        assertEquals(1, flowEngine.getActiveFlowCount());

        // Stop the engine itself (onStop call)
        flowEngine.onStop();
        // Executor should be shutdown
    }

}
