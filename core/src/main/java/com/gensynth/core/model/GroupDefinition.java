package com.gensynth.core.model;

import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Represents a Group Definition (configuration) in the gen-synth system.
 *
 * A Group is a logical container for multiple Flows with shared configuration:
 * - Name and description
 * - Number of threads for execution
 * - Output mode (parallel, sequential, etc.)
 * - Enabled/disabled state
 *
 * GroupDefinition captures the persistent configuration, while runtime state
 * (running/stopped, metrics) is maintained separately in GroupRuntime.
 */
public class GroupDefinition {
    private final String groupId;
    private String name;
    private String description;
    private boolean enabled;
    private int threads;
    private String outputMode;
    private final Map<String, FlowDefinition> flows;
    private final Instant createdAt;
    private Instant updatedAt;

    /**
     * Constructor for GroupDefinition.
     *
     * @param groupId Unique identifier (UUID format)
     * @param name Human-readable name
     * @param description Group description
     * @param threads Number of threads for execution
     * @param outputMode Execution mode (parallel, sequential, etc.)
     */
    public GroupDefinition(String groupId, String name, String description, int threads, String outputMode) {
        this.groupId = Objects.requireNonNull(groupId, "groupId cannot be null");
        this.name = Objects.requireNonNull(name, "name cannot be null");
        this.description = description != null ? description : "";
        this.enabled = true;
        this.threads = Math.max(1, threads);
        this.outputMode = Objects.requireNonNull(outputMode, "outputMode cannot be null");
        this.flows = new HashMap<>();
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    // ─────────────────────────────────────────────────────────────
    // Getters
    // ─────────────────────────────────────────────────────────────

    public String getGroupId() {
        return groupId;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public int getThreads() {
        return threads;
    }

    public String getOutputMode() {
        return outputMode;
    }

    public Map<String, FlowDefinition> getFlows() {
        return new HashMap<>(flows);
    }

    public int getFlowCount() {
        return flows.size();
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    // ─────────────────────────────────────────────────────────────
    // Setters (for updates)
    // ─────────────────────────────────────────────────────────────

    public void setName(String name) {
        this.name = Objects.requireNonNull(name, "name cannot be null");
        this.updatedAt = Instant.now();
    }

    public void setDescription(String description) {
        this.description = description != null ? description : "";
        this.updatedAt = Instant.now();
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
        this.updatedAt = Instant.now();
        // Propagate to all flows
        for (FlowDefinition flow : flows.values()) {
            flow.setEnabled(enabled);
        }
    }

    public void setThreads(int threads) {
        this.threads = Math.max(1, threads);
        this.updatedAt = Instant.now();
    }

    public void setOutputMode(String outputMode) {
        this.outputMode = Objects.requireNonNull(outputMode, "outputMode cannot be null");
        this.updatedAt = Instant.now();
    }

    // ─────────────────────────────────────────────────────────────
    // Flow Management
    // ─────────────────────────────────────────────────────────────

    /**
     * Adds a flow to this group.
     *
     * @param flow FlowDefinition to add
     * @throws IllegalArgumentException if flow already exists
     */
    public void addFlow(FlowDefinition flow) {
        Objects.requireNonNull(flow, "flow cannot be null");
        if (flows.containsKey(flow.getFlowId())) {
            throw new IllegalArgumentException("Flow with id " + flow.getFlowId() + " already exists in group " + groupId);
        }
        flows.put(flow.getFlowId(), flow);
        this.updatedAt = Instant.now();
    }

    /**
     * Removes a flow from this group.
     *
     * @param flowId ID of flow to remove
     * @return true if flow was removed, false if not found
     */
    public boolean removeFlow(String flowId) {
        boolean removed = flows.remove(flowId) != null;
        if (removed) {
            this.updatedAt = Instant.now();
        }
        return removed;
    }

    /**
     * Gets a flow by ID.
     *
     * @param flowId ID of flow to retrieve
     * @return FlowDefinition or null if not found
     */
    public FlowDefinition getFlow(String flowId) {
        return flows.get(flowId);
    }

    /**
     * Checks if a flow with the given ID exists in this group.
     *
     * @param flowId ID of flow to check
     * @return true if flow exists, false otherwise
     */
    public boolean hasFlow(String flowId) {
        return flows.containsKey(flowId);
    }

    /**
     * Gets all flows in this group.
     *
     * @return Map of flowId -> FlowDefinition
     */
    public Map<String, FlowDefinition> getAllFlows() {
        return new HashMap<>(flows);
    }

    // ─────────────────────────────────────────────────────────────
    // Serialization
    // ─────────────────────────────────────────────────────────────

    /**
     * Converts this GroupDefinition to a payload map suitable for JSON serialization.
     *
     * @return Map representation of this GroupDefinition
     */
    public Map<String, Object> toPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", groupId);
        payload.put("name", name);
        payload.put("description", description);
        payload.put("enabled", enabled);
        payload.put("threads", threads);
        payload.put("outputMode", outputMode);
        
        Map<String, Object> flowsPayload = new LinkedHashMap<>();
        for (Map.Entry<String, FlowDefinition> entry : flows.entrySet()) {
            flowsPayload.put(entry.getKey(), entry.getValue().toPayload());
        }
        payload.put("flows", flowsPayload);
        
        payload.put("createdAt", createdAt.toString());
        payload.put("updatedAt", updatedAt.toString());
        return payload;
    }

    /**
     * Creates a GroupDefinition from a payload map (used during deserialization).
     *
     * @param payload Map containing group data
     * @return GroupDefinition instance
     */
    public static GroupDefinition fromPayload(Map<String, Object> payload) {
        String groupId = (String) payload.get("id");
        String name = (String) payload.get("name");
        String description = (String) payload.get("description");
        int threads = ((Number) payload.get("threads")).intValue();
        String outputMode = (String) payload.get("outputMode");

        GroupDefinition group = new GroupDefinition(groupId, name, description, threads, outputMode);
        
        @SuppressWarnings("unchecked")
        Map<String, Object> flowsPayload = (Map<String, Object>) payload.get("flows");
        if (flowsPayload != null) {
            for (Map.Entry<String, Object> entry : flowsPayload.entrySet()) {
                @SuppressWarnings("unchecked")
                Map<String, Object> flowData = (Map<String, Object>) entry.getValue();
                FlowDefinition flow = FlowDefinition.fromPayload(flowData);
                group.flows.put(flow.getFlowId(), flow);
            }
        }

        Boolean enabled = (Boolean) payload.get("enabled");
        if (enabled != null) {
            group.setEnabled(enabled);
        }

        return group;
    }

    @Override
    public String toString() {
        return "GroupDefinition{" +
            "groupId='" + groupId + '\'' +
            ", name='" + name + '\'' +
            ", description='" + description + '\'' +
            ", enabled=" + enabled +
            ", threads=" + threads +
            ", outputMode='" + outputMode + '\'' +
            ", flowCount=" + flows.size() +
            ", createdAt=" + createdAt +
            ", updatedAt=" + updatedAt +
            '}';
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof GroupDefinition)) return false;
        GroupDefinition that = (GroupDefinition) o;
        return Objects.equals(groupId, that.groupId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(groupId);
    }
}
