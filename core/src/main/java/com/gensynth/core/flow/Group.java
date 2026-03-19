package com.gensynth.core.flow;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Represents a Group containing multiple Flows.
 *
 * A Group is a container for multiple Flows with shared configuration.
 * Each flow in a group can have different variables.
 *
 * Features:
 * - Contains multiple Flows
 * - Tracks metrics: total events sent, errors, throughput
 * - Can be enabled/disabled (controls if its flows send data)
 * - Configurable frequency and other parameters
 *
 * Example:
 * ```java
 * Group group = new Group("group_1");
 *
 * Flow flow1 = new Flow("flow_1");
 * flow1.addVariable(new SimpleVariable("temperature", 20.0));
 * group.addFlow(flow1);
 *
 * Flow flow2 = new Flow("flow_2");
 * flow2.addVariable(new SimpleVariable("pressure", 1013.0));
 * flow2.addVariable(new SimpleVariable("humidity", 50.0));
 * group.addFlow(flow2);
 *
 * // Group now contains 2 flows with different variables
 * ```
 */
public class Group {

    private final String groupId;
    private String groupName;
    private volatile boolean enabled = true;

    // Flows in this group (flowId -> Flow)
    private final Map<String, Flow> flows = new ConcurrentHashMap<>();

    // Metrics
    private final AtomicLong totalEventsSent = new AtomicLong(0);
    private final AtomicLong totalErrors = new AtomicLong(0);

    // Timestamps for rate calculation
    private volatile long lastEventTime = System.currentTimeMillis();
    private volatile double eventsPerSecond = 0.0;

    /**
     * Constructor for Group.
     *
     * @param groupId Unique identifier for this group
     */
    public Group(String groupId) {
        if (groupId == null || groupId.isEmpty()) {
            throw new IllegalArgumentException("groupId cannot be null or empty");
        }
        this.groupId = groupId;
        this.groupName = groupId;  // Default name = ID
    }

    /**
     * Constructor for Group with name.
     *
     * @param groupId Unique identifier
     * @param groupName Display name
     */
    public Group(String groupId, String groupName) {
        if (groupId == null || groupId.isEmpty()) {
            throw new IllegalArgumentException("groupId cannot be null or empty");
        }
        this.groupId = groupId;
        this.groupName = (groupName != null && !groupName.isEmpty()) ? groupName : groupId;
    }

    /**
     * Add a flow to this group.
     *
     * @param flow The flow to add
     * @throws IllegalArgumentException if flow is null or already exists
     */
    public void addFlow(Flow flow) {
        if (flow == null) {
            throw new IllegalArgumentException("flow cannot be null");
        }
        String flowId = flow.getFlowId();
        if (flows.containsKey(flowId)) {
            throw new IllegalArgumentException(
                String.format("Flow %s already exists in group %s",
                    flowId, groupId));
        }
        flows.put(flowId, flow);
    }

    /**
     * Remove a flow from this group.
     *
     * @param flowId The ID of the flow to remove
     * @return true if removed, false if not found
     */
    public boolean removeFlow(String flowId) {
        return flows.remove(flowId) != null;
    }

    /**
     * Get a flow by ID.
     *
     * @return Optional containing the flow, or empty if not found
     */
    public Optional<Flow> getFlow(String flowId) {
        return Optional.ofNullable(flows.get(flowId));
    }

    /**
     * Get all flows in this group.
     */
    public Collection<Flow> getFlows() {
        return Collections.unmodifiableCollection(flows.values());
    }

    /**
     * Get flow count.
     */
    public int getFlowCount() {
        return flows.size();
    }

    /**
     * Get all flow IDs.
     */
    public Set<String> getFlowIds() {
        return Collections.unmodifiableSet(flows.keySet());
    }

    // ============ Getters/Setters ============

    public String getGroupId() {
        return groupId;
    }

    public String getGroupName() {
        return groupName;
    }

    public void setGroupName(String groupName) {
        if (groupName != null && !groupName.isEmpty()) {
            this.groupName = groupName;
        }
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    // ============ Metrics ============

    /**
     * Record that events were sent.
     *
     * @param eventCount Number of events sent
     */
    public void recordEventsSent(long eventCount) {
        totalEventsSent.addAndGet(eventCount);
        updateThroughput();
    }

    /**
     * Record an error.
     */
    public void recordError() {
        totalErrors.incrementAndGet();
    }

    /**
     * Get total events sent from this group.
     */
    public long getTotalEventsSent() {
        return totalEventsSent.get();
    }

    /**
     * Get total errors.
     */
    public long getTotalErrors() {
        return totalErrors.get();
    }

    /**
     * Get current events per second.
     */
    public double getEventsPerSecond() {
        return eventsPerSecond;
    }

    /**
     * Reset all metrics.
     */
    public void resetMetrics() {
        totalEventsSent.set(0);
        totalErrors.set(0);
        eventsPerSecond = 0.0;
        lastEventTime = System.currentTimeMillis();
    }

    /**
     * Update throughput calculation.
     */
    private void updateThroughput() {
        long now = System.currentTimeMillis();
        long timeDeltaMs = now - lastEventTime;

        if (timeDeltaMs > 1000) {  // Calculate every second
            long eventCount = totalEventsSent.get();
            eventsPerSecond = (double) eventCount / (timeDeltaMs / 1000.0);
            lastEventTime = now;
        }
    }

    @Override
    public String toString() {
        return String.format(
            "Group{id=%s, name=%s, flows=%d, enabled=%s, sent=%d, errors=%d, eps=%.2f}",
            groupId, groupName, flows.size(), enabled, totalEventsSent.get(),
            totalErrors.get(), eventsPerSecond);
    }
}
