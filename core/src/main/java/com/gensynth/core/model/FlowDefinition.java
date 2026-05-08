package com.gensynth.core.model;

import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Represents a Flow Definition (configuration) in the gen-synth system.
 *
 * A Flow is a template for data generation with specific configuration:
 * - Name and description
 * - Technology connector type (rabbitmq, kafka, etc.)
 * - Connection parameters (host, port, topic)
 * - Generation parameters (interval, burst)
 * - Template for payload generation
 * - Connector-specific configuration
 *
 * FlowDefinition captures the persistent configuration, while runtime state
 * (running/stopped, metrics) is maintained separately in FlowRuntime.
 */
public class FlowDefinition {
    private final String flowId;
    private final String groupId;
    private String name;
    private String technology; // "rabbitmq", "kafka", etc.
    private String host;
    private int port;
    private String topic;
    private int interval;
    private int burst;
    private String template;
    private String format; // "json", "xml", "csv", "plain"
    private String connectorId;
    private final Map<String, Object> connectorConfig;
    private final Instant createdAt;
    private Instant updatedAt;

    /**
     * Constructor for FlowDefinition.
     *
     * @param flowId Unique identifier (UUID format)
     * @param groupId Reference to parent group
     * @param name Human-readable name
     * @param technology Connector technology
     * @param host Connection host
     * @param port Connection port
     * @param topic Topic/queue name
     * @param interval Publish interval in milliseconds
     * @param burst Number of events per burst
     * @param template Event template with placeholders
     * @param connectorId Connector plugin ID
     * @param connectorConfig Connector-specific configuration
     */
    public FlowDefinition(
        String flowId,
        String groupId,
        String name,
        String technology,
        String host,
        int port,
        String topic,
        int interval,
        int burst,
        String template,
        String format,
        String connectorId,
        Map<String, Object> connectorConfig
    ) {
        this.flowId = Objects.requireNonNull(flowId, "flowId cannot be null");
        this.groupId = Objects.requireNonNull(groupId, "groupId cannot be null");
        this.name = Objects.requireNonNull(name, "name cannot be null");
        this.technology = Objects.requireNonNull(technology, "technology cannot be null");
        this.host = Objects.requireNonNull(host, "host cannot be null");
        this.port = port;
        this.topic = Objects.requireNonNull(topic, "topic cannot be null");
        this.interval = Math.max(50, interval); // Minimum 50ms
        this.burst = Math.max(1, burst);
        this.template = Objects.requireNonNull(template, "template cannot be null");
        this.format = format != null ? format : "json";
        this.connectorId = connectorId;
        this.connectorConfig = connectorConfig != null ? new HashMap<>(connectorConfig) : new HashMap<>();
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    // ─────────────────────────────────────────────────────────────
    // Getters
    // ─────────────────────────────────────────────────────────────

    public String getFlowId() {
        return flowId;
    }

    public String getGroupId() {
        return groupId;
    }

    public String getName() {
        return name;
    }

    public String getTechnology() {
        return technology;
    }

    public String getHost() {
        return host;
    }

    public int getPort() {
        return port;
    }

    public String getTopic() {
        return topic;
    }

    public int getInterval() {
        return interval;
    }

    public int getBurst() {
        return burst;
    }

    public String getTemplate() {
        return template;
    }

    public String getFormat() {
        return format;
    }

    public String getConnectorId() {
        return connectorId;
    }

    public Map<String, Object> getConnectorConfig() {
        return new HashMap<>(connectorConfig);
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

    public void setTechnology(String technology) {
        this.technology = Objects.requireNonNull(technology, "technology cannot be null");
        this.updatedAt = Instant.now();
    }

    public void setHost(String host) {
        this.host = Objects.requireNonNull(host, "host cannot be null");
        this.updatedAt = Instant.now();
    }

    public void setPort(int port) {
        this.port = port;
        this.updatedAt = Instant.now();
    }

    public void setTopic(String topic) {
        this.topic = Objects.requireNonNull(topic, "topic cannot be null");
        this.updatedAt = Instant.now();
    }

    public void setInterval(int interval) {
        this.interval = Math.max(50, interval);
        this.updatedAt = Instant.now();
    }

    public void setBurst(int burst) {
        this.burst = Math.max(1, burst);
        this.updatedAt = Instant.now();
    }

    public void setTemplate(String template) {
        this.template = Objects.requireNonNull(template, "template cannot be null");
        this.updatedAt = Instant.now();
    }

    public void setFormat(String format) {
        this.format = format;
        this.updatedAt = Instant.now();
    }

    public void setConnectorId(String connectorId) {
        this.connectorId = connectorId;
        this.updatedAt = Instant.now();
    }

    public void setConnectorConfig(Map<String, Object> config) {
        this.connectorConfig.clear();
        if (config != null) {
            this.connectorConfig.putAll(config);
        }
        this.updatedAt = Instant.now();
    }

    // ─────────────────────────────────────────────────────────────
    // Serialization
    // ─────────────────────────────────────────────────────────────

    /**
     * Converts this FlowDefinition to a payload map suitable for JSON serialization.
     *
     * @return Map representation of this FlowDefinition
     */
    public Map<String, Object> toPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", flowId);
        payload.put("groupId", groupId);
        payload.put("name", name);
        payload.put("technology", technology);
        payload.put("host", host);
        payload.put("port", port);
        payload.put("topic", topic);
        payload.put("interval", interval);
        payload.put("burst", burst);
        payload.put("template", template);
        payload.put("format", format);
        payload.put("connectorId", connectorId);
        payload.put("connectorConfig", connectorConfig);
        payload.put("createdAt", createdAt.toString());
        payload.put("updatedAt", updatedAt.toString());
        return payload;
    }

    /**
     * Creates a FlowDefinition from a payload map (used during deserialization).
     *
     * @param payload Map containing flow data
     * @return FlowDefinition instance
     */
    public static FlowDefinition fromPayload(Map<String, Object> payload) {
        String flowId = (String) payload.get("id");
        String groupId = (String) payload.get("groupId");
        String name = (String) payload.get("name");
        String technology = (String) payload.get("technology");
        String host = (String) payload.get("host");
        int port = ((Number) payload.get("port")).intValue();
        String topic = (String) payload.get("topic");
        int interval = ((Number) payload.get("interval")).intValue();
        int burst = ((Number) payload.get("burst")).intValue();
        String template = (String) payload.get("template");
        String format = (String) payload.get("format");
        String connectorId = (String) payload.get("connectorId");
        @SuppressWarnings("unchecked")
        Map<String, Object> connectorConfig = (Map<String, Object>) payload.get("connectorConfig");

        return new FlowDefinition(flowId, groupId, name, technology, host, port, topic, interval, burst, template, format, connectorId, connectorConfig);
    }

    @Override
    public String toString() {
        return "FlowDefinition{" +
            "flowId='" + flowId + '\'' +
            ", groupId='" + groupId + '\'' +
            ", name='" + name + '\'' +
            ", technology='" + technology + '\'' +
            ", host='" + host + '\'' +
            ", port=" + port +
            ", topic='" + topic + '\'' +
            ", interval=" + interval +
            ", burst=" + burst +
            ", createdAt=" + createdAt +
            ", updatedAt=" + updatedAt +
            '}';
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof FlowDefinition)) return false;
        FlowDefinition that = (FlowDefinition) o;
        return Objects.equals(flowId, that.flowId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(flowId);
    }
}
