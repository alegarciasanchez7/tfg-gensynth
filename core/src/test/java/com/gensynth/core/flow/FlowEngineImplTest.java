package com.gensynth.core.flow;

import com.gensynth.core.config.AppConfig;
import org.junit.Before;
import org.junit.Test;
import static org.junit.Assert.*;

/**
 * Comprehensive tests for FlowEngine implementation.
 * Tests cover: initialization, group + flow execution, virtual threads, state management.
 * 
 * Architecture: Group → Flow → Variable
 * - Group: Container for multiple flows with shared configuration
 * - Flow: Set of variables sent together
 * - Variable: Individual data point generator
 */
public class FlowEngineImplTest {

    private FlowEngineImpl flowEngine;
    private AppConfig config;

    @Before
    public void setUp() {
        config = new AppConfig();
        flowEngine = new FlowEngineImpl(config);
    }

    /**
     * Helper method to create a Group with a Flow containing a single variable.
     */
    private Group createTestGroup(String groupId, String flowId, String varName, Object varValue) {
        Group group = new Group(groupId);
        Flow flow = new Flow(flowId);
        flow.addVariable(new SimpleVariable(varName, varValue));
        group.addFlow(flow);
        return group;
    }

    /**
     * Helper method to create a Group with a Flow containing multiple variables.
     */
    private Group createTestGroupWithVariables(String groupId, String flowId, Object... varNamesAndValues) {
        Group group = new Group(groupId);
        Flow flow = new Flow(flowId);
        for (int i = 0; i < varNamesAndValues.length; i += 2) {
            flow.addVariable(new SimpleVariable((String) varNamesAndValues[i], varNamesAndValues[i + 1]));
        }
        group.addFlow(flow);
        return group;
    }

    // ========== Initialization Tests ==========

    @Test
    public void testFlowEngineInitialization() throws Exception {
        flowEngine.onInitialize();
        // Just verify it doesn't throw an exception
        // Virtual thread executor and pipeline are created automatically
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

    // ========== Group Management Tests ==========

    @Test
    public void testAddGroup() throws Exception {
        flowEngine.onInitialize();
        Group group = createTestGroup("group-1", "flow-1", "temperature", 20.0);
        
        flowEngine.addGroup(group);
        assertEquals(1, flowEngine.getGroupCount());
        assertTrue(flowEngine.getGroup("group-1").isPresent());
    }

    @Test(expected = IllegalArgumentException.class)
    public void testAddNullGroup() {
        flowEngine.addGroup(null);
    }

    @Test
    public void testRemoveGroup() throws Exception {
        flowEngine.onInitialize();
        Group group = createTestGroup("group-1", "flow-1", "temperature", 20.0);
        
        flowEngine.addGroup(group);
        assertEquals(1, flowEngine.getGroupCount());
        
        flowEngine.removeGroup("group-1");
        assertEquals(0, flowEngine.getGroupCount());
    }

    // ========== Group Execution Tests ==========

    @Test(expected = IllegalStateException.class)
    public void testExecuteGroupBeforeInitialize() {
        flowEngine.executeFlow("group-1");
    }

    @Test(expected = IllegalStateException.class)
    public void testExecuteGroupNotFound() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();
        
        // Group not registered
        flowEngine.executeFlow("non-existent-group");
    }

    @Test
    public void testExecuteGroupAfterInitialize() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();
        
        Group group = createTestGroup("group-1", "flow-1", "temperature", 20.0);
        flowEngine.addGroup(group);
        
        // Should not throw
        flowEngine.executeFlow("group-1");
        assertEquals(1, flowEngine.getActiveGroupCount());
    }

    @Test(expected = IllegalStateException.class)
    public void testCannotStartDuplicateGroup() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();

        Group group = createTestGroup("group-1", "flow-1", "temperature", 20.0);
        flowEngine.addGroup(group);
        
        flowEngine.executeFlow("group-1");
        flowEngine.executeFlow("group-1");  // Should throw - already running
    }

    @Test
    public void testMultipleGroupsCanRunConcurrently() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();

        Group group1 = createTestGroup("group-1", "flow-1", "temperature", 20.0);
        Group group2 = createTestGroup("group-2", "flow-2", "pressure", 1013.0);
        Group group3 = createTestGroup("group-3", "flow-3", "humidity", 50.0);
        
        flowEngine.addGroup(group1);
        flowEngine.addGroup(group2);
        flowEngine.addGroup(group3);

        flowEngine.executeFlow("group-1");
        flowEngine.executeFlow("group-2");
        flowEngine.executeFlow("group-3");

        assertEquals(3, flowEngine.getActiveGroupCount());
    }

    // ========== Group Control Tests ==========

    @Test(expected = IllegalStateException.class)
    public void testStopNonExistentGroup() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();

        flowEngine.stopFlow("non-existent-group");
    }

    @Test
    public void testStopExistingGroup() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();

        Group group = createTestGroup("group-1", "flow-1", "temperature", 20.0);
        flowEngine.addGroup(group);
        flowEngine.executeFlow("group-1");
        assertEquals(1, flowEngine.getActiveGroupCount());

        flowEngine.stopFlow("group-1");
        assertEquals(0, flowEngine.getActiveGroupCount());
    }

    @Test(expected = IllegalStateException.class)
    public void testPauseNonExistentGroup() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();

        flowEngine.pauseFlow("non-existent-group");
    }

    @Test
    public void testPauseExistingGroup() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();

        Group group = createTestGroup("group-1", "flow-1", "temperature", 20.0);
        flowEngine.addGroup(group);
        flowEngine.executeFlow("group-1");

        // Should not throw
        flowEngine.pauseFlow("group-1");

        // Group should still be active (just paused)
        assertEquals(1, flowEngine.getActiveGroupCount());
    }

    @Test
    public void testResumeGroupAfterPause() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();

        Group group = createTestGroup("group-1", "flow-1", "temperature", 20.0);
        flowEngine.addGroup(group);
        flowEngine.executeFlow("group-1");
        
        flowEngine.pauseFlow("group-1");
        flowEngine.resumeGroup("group-1");

        // Group should still be active
        assertEquals(1, flowEngine.getActiveGroupCount());
    }

    // ========== Flexible Variable Configuration Tests ==========
    // Demonstrates that each Flow can have ANY combination of variables

    @Test
    public void testFlowWithSingleVariable() throws Exception {
        config.setSimulationInterval(50);

        Group group = new Group("group-1");
        Flow flow = new Flow("flow-1");
        flow.addVariable(new SimpleVariable("temperature", 20.0));
        group.addFlow(flow);

        flowEngine.onInitialize();
        flowEngine.onStart();
        flowEngine.addGroup(group);
        flowEngine.executeFlow("group-1");

        Thread.sleep(100);

        long eventCount = flowEngine.getGeneratedEventCount();
        assertTrue("Should generate events with single variable", eventCount >= 1);
        
        flowEngine.stopFlow("group-1");
        flowEngine.onStop();
    }

    @Test
    public void testFlowWithMultipleVariables() throws Exception {
        config.setSimulationInterval(50);

        Group group = new Group("group-1");
        Flow flow = new Flow("flow-1");
        flow.addVariable(new SimpleVariable("temperature", 20.0));
        flow.addVariable(new SimpleVariable("pressure", 1013.25));
        flow.addVariable(new SimpleVariable("humidity", 50.0));
        group.addFlow(flow);

        flowEngine.onInitialize();
        flowEngine.onStart();
        flowEngine.addGroup(group);
        flowEngine.executeFlow("group-1");

        Thread.sleep(100);

        long eventCount = flowEngine.getGeneratedEventCount();
        // With 3 variables per flow, should generate 3 events per interval
        assertTrue("Should generate multiple events per variable", eventCount >= 3);
        
        flowEngine.stopFlow("group-1");
        flowEngine.onStop();
    }

    @Test
    public void testGroupWithMultipleFlowsDifferentVariables() throws Exception {
        config.setSimulationInterval(50);

        Group group = new Group("group-1");
        
        // Flow 1 with temperature only
        Flow flow1 = new Flow("flow-1");
        flow1.addVariable(new SimpleVariable("temperature", 20.0));
        group.addFlow(flow1);
        
        // Flow 2 with pressure and humidity
        Flow flow2 = new Flow("flow-2");
        flow2.addVariable(new SimpleVariable("pressure", 1013.25));
        flow2.addVariable(new SimpleVariable("humidity", 50.0));
        group.addFlow(flow2);
        
        // Flow 3 with acceleration and velocity
        Flow flow3 = new Flow("flow-3");
        flow3.addVariable(new SimpleVariable("acceleration", 9.8));
        flow3.addVariable(new SimpleVariable("velocity", 0.0));
        group.addFlow(flow3);

        flowEngine.onInitialize();
        flowEngine.onStart();
        flowEngine.addGroup(group);
        flowEngine.executeFlow("group-1");

        Thread.sleep(150);

        long eventCount = flowEngine.getGeneratedEventCount();
        // flow1=1, flow2=2, flow3=2 variables = 5 events per interval
        assertTrue("Should generate events from all flows with different variables", eventCount >= 5);
        
        flowEngine.stopFlow("group-1");
        flowEngine.onStop();
    }

    @Test
    public void testMultipleGroupsWithDifferentVariableConfigurations() throws Exception {
        config.setSimulationInterval(50);

        // Group A: Temperature only
        Group groupA = new Group("group-a");
        Flow flowA = new Flow("flow-a");
        flowA.addVariable(new SimpleVariable("temperature", 20.0));
        groupA.addFlow(flowA);

        // Group B: All environmental variables
        Group groupB = new Group("group-b");
        Flow flowB = new Flow("flow-b");
        flowB.addVariable(new SimpleVariable("temperature", 20.0));
        flowB.addVariable(new SimpleVariable("pressure", 1013.25));
        flowB.addVariable(new SimpleVariable("humidity", 50.0));
        groupB.addFlow(flowB);

        flowEngine.onInitialize();
        flowEngine.onStart();
        flowEngine.addGroup(groupA);
        flowEngine.addGroup(groupB);
        
        flowEngine.executeFlow("group-a");
        flowEngine.executeFlow("group-b");

        Thread.sleep(100);

        long eventCount = flowEngine.getGeneratedEventCount();
        // groupA=1, groupB=3 variables = 4 events per interval minimum
        assertTrue("Should handle multiple groups with different configurations", eventCount >= 4);
        
        flowEngine.stopFlow("group-a");
        flowEngine.stopFlow("group-b");
        flowEngine.onStop();
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

    // ========== Configuration Validation Tests ==========

    @Test(expected = IllegalArgumentException.class)
    public void testInvalidDeviceCountThrows() {
        config.setDeviceCount(0);
    }

    @Test(expected = IllegalArgumentException.class)
    public void testInvalidSimulationIntervalThrows() {
        config.setSimulationInterval(0);
    }

    // ========== Metrics Tests ==========

    @Test
    public void testGeneratedEventCount() throws Exception {
        config.setSimulationInterval(10);  // Short interval for testing

        Group group = createTestGroup("group-1", "flow-1", "temperature", 20.0);
        flowEngine.onInitialize();
        flowEngine.onStart();
        flowEngine.addGroup(group);
        flowEngine.executeFlow("group-1");

        // Wait for some events to generate
        Thread.sleep(150);

        long eventCount = flowEngine.getGeneratedEventCount();
        assertTrue("Should generate multiple events", eventCount > 0);
        
        flowEngine.stopFlow("group-1");
        flowEngine.onStop();
    }

    @Test
    public void testMultipleGroupsGenerateEvents() throws Exception {
        config.setSimulationInterval(10);

        Group group1 = createTestGroup("group-1", "flow-1", "temperature", 20.0);
        Group group2 = createTestGroup("group-2", "flow-2", "pressure", 1013.0);

        flowEngine.onInitialize();
        flowEngine.onStart();
        flowEngine.addGroup(group1);
        flowEngine.addGroup(group2);

        flowEngine.executeFlow("group-1");
        Thread.sleep(50);
        flowEngine.executeFlow("group-2");
        Thread.sleep(50);

        long eventCount = flowEngine.getGeneratedEventCount();
        assertTrue("Multiple groups should generate events", eventCount > 0);

        flowEngine.stopFlow("group-1");
        flowEngine.stopFlow("group-2");
        flowEngine.onStop();
    }

    @Test
    public void testGroupMetricsTracking() throws Exception {
        config.setSimulationInterval(50);

        Group group = createTestGroup("group-1", "flow-1", "temperature", 20.0);
        flowEngine.onInitialize();
        flowEngine.onStart();
        flowEngine.addGroup(group);
        flowEngine.executeFlow("group-1");

        Thread.sleep(100);

        // Group should track metrics
        assertTrue(group.getTotalEventsSent() > 0);
        assertEquals(0, group.getTotalErrors());
        
        flowEngine.stopFlow("group-1");
        flowEngine.onStop();
    }

    @Test
    public void testPipelineEventBuffering() throws Exception {
        config.setSimulationInterval(10);

        Group group = createTestGroupWithVariables("group-1", "flow-1", 
            "temp", 20.0, "pressure", 1013.0, "humidity", 50.0);
        
        flowEngine.onInitialize();
        flowEngine.onStart();
        flowEngine.addGroup(group);
        flowEngine.executeFlow("group-1");

        Thread.sleep(100);

        // Events should have been submitted to pipeline
        long eventCount = flowEngine.getGeneratedEventCount();
        assertTrue("Pipeline should buffer events", eventCount >= 3);
        
        flowEngine.stopFlow("group-1");
        flowEngine.onStop();
    }

    // ========== Lifecycle Tests ==========

    @Test
    public void testCompleteLifecycle() throws Exception {
        // Initialize
        flowEngine.onInitialize();
        assertEquals(0, flowEngine.getActiveGroupCount());

        // Start
        flowEngine.onStart();
        
        Group group = createTestGroup("group-1", "flow-1", "temperature", 20.0);
        flowEngine.addGroup(group);
        flowEngine.executeFlow("group-1");
        assertEquals(1, flowEngine.getActiveGroupCount());

        // Stop
        flowEngine.stopFlow("group-1");
        assertEquals(0, flowEngine.getActiveGroupCount());

        // Shutdown
        flowEngine.onStop();
        // Should complete without error
    }

    @Test
    public void testStopEngineStopsActiveGroups() throws Exception {
        flowEngine.onInitialize();
        flowEngine.onStart();
        
        Group group = createTestGroup("group-1", "flow-1", "temperature", 20.0);
        flowEngine.addGroup(group);
        flowEngine.executeFlow("group-1");

        assertEquals(1, flowEngine.getActiveGroupCount());

        // Stop the engine itself (onStop call)
        flowEngine.onStop();
        // Executor should be shutdown
    }

    @Test
    public void testGroupDisableStopsEventGeneration() throws Exception {
        config.setSimulationInterval(20);
        
        Group group = createTestGroup("group-1", "flow-1", "temperature", 20.0);
        flowEngine.onInitialize();
        flowEngine.onStart();
        flowEngine.addGroup(group);
        flowEngine.executeFlow("group-1");

        Thread.sleep(80);
        long eventsBeforeDisable = flowEngine.getGeneratedEventCount();

        // Disable the group
        group.setEnabled(false);
        Thread.sleep(100);
        long eventsAfterDisable = flowEngine.getGeneratedEventCount();

        // Should not generate new events when disabled
        assertEquals(eventsBeforeDisable, eventsAfterDisable);
        
        flowEngine.stopFlow("group-1");
        flowEngine.onStop();
    }

}
