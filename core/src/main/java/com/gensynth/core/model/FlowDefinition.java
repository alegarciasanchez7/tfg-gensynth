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
 * - Generation parameters (one message every {@code everyTicks} global ticks;
 *   interval and burst are legacy and ignored by the engine)
 * - Template for payload generation
 * - Event loss (a random loss percentage and periodic outages; 0 = off)
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
    private int everyTicks = 1;
    private double lossPercent;
    private int outageEveryTicks;
    private int outageDurationTicks;
    private String template;
    private String format; // "json", "xml", "csv", "plain"
    private boolean enabled;
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
     * @param interval Legacy publish interval in milliseconds; ignored by the engine (the global
     *                 tick clock drives sending), kept for file compatibility
     * @param burst Legacy number of events per send; ignored by the engine
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
        this.enabled = true;
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

    /**
     * @return number of global ticks between two messages of this flow (at least 1)
     */
    public int getEveryTicks() {
        return everyTicks;
    }

    /**
     * @return percentage (0-100) of generated messages that are dropped at random instead of sent
     */
    public double getLossPercent() {
        return lossPercent;
    }

    /**
     * @return length in ticks of the periodic outage cycle (0 = no outages)
     */
    public int getOutageEveryTicks() {
        return outageEveryTicks;
    }

    /**
     * @return number of ticks at the end of every outage cycle in which every message is dropped
     */
    public int getOutageDurationTicks() {
        return outageDurationTicks;
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

    public boolean isEnabled() {
        return enabled;
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

    /**
     * Sets how many global ticks pass between two messages of this flow.
     *
     * @param everyTicks ticks between messages; values below 1 are clamped to 1
     */
    public void setEveryTicks(int everyTicks) {
        this.everyTicks = Math.max(1, everyTicks);
        this.updatedAt = Instant.now();
    }

    /**
     * Sets the percentage of generated messages that are dropped at random.
     *
     * @param lossPercent percentage; clamped to [0, 100], NaN becomes 0
     */
    public void setLossPercent(double lossPercent) {
        this.lossPercent = clampPercent(lossPercent);
        this.updatedAt = Instant.now();
    }

    /**
     * Sets the length of the periodic outage cycle.
     *
     * @param outageEveryTicks cycle length in ticks; 0 disables outages, negative values become 0
     */
    public void setOutageEveryTicks(int outageEveryTicks) {
        this.outageEveryTicks = Math.max(0, outageEveryTicks);
        this.updatedAt = Instant.now();
    }

    /**
     * Sets how many ticks at the end of every outage cycle drop all messages.
     *
     * @param outageDurationTicks outage length in ticks; 0 disables outages, negative values become 0
     */
    public void setOutageDurationTicks(int outageDurationTicks) {
        this.outageDurationTicks = Math.max(0, outageDurationTicks);
        this.updatedAt = Instant.now();
    }

    /**
     * Clamps a loss percentage to [0, 100].
     *
     * @param value raw percentage
     * @return the clamped value, or 0 when the value is NaN
     */
    public static double clampPercent(double value) {
        if (Double.isNaN(value)) {
            return 0;
        }
        return Math.min(100, Math.max(0, value));
    }

    public void setTemplate(String template) {
        this.template = Objects.requireNonNull(template, "template cannot be null");
        this.updatedAt = Instant.now();
    }

    public void setFormat(String format) {
        this.format = format;
        this.updatedAt = Instant.now();
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
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
        payload.put("everyTicks", everyTicks);
        payload.put("lossPercent", lossPercent);
        payload.put("outageEveryTicks", outageEveryTicks);
        payload.put("outageDurationTicks", outageDurationTicks);
        payload.put("template", template);
        payload.put("format", format);
        payload.put("enabled", enabled);
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
        String flowId = (String) payload.getOrDefault("id", java.util.UUID.randomUUID().toString());
        String groupId = (String) payload.get("groupId");
        String name = (String) payload.getOrDefault("name", "Unnamed Flow");
        String technology = (String) payload.getOrDefault("technology", "rabbitmq");
        String host = (String) payload.getOrDefault("host", "localhost");
        
        Object portObj = payload.get("port");
        int port = (portObj instanceof Number) ? ((Number) portObj).intValue() : 5672;
        
        String topic = (String) payload.getOrDefault("topic", "");
        
        Object intervalObj = payload.get("interval");
        int interval = (intervalObj instanceof Number) ? ((Number) intervalObj).intValue() : 1000;
        
        Object burstObj = payload.get("burst");
        int burst = (burstObj instanceof Number) ? ((Number) burstObj).intValue() : 1;
        
        String template = (String) payload.getOrDefault("template", "{\"eventId\":\"{{uuid}}\"}");
        String format = (String) payload.getOrDefault("format", "json");
        String connectorId = (String) payload.getOrDefault("connectorId", technology);
        
        @SuppressWarnings("unchecked")
        Map<String, Object> connectorConfig = (Map<String, Object>) payload.get("connectorConfig");

        FlowDefinition flow = new FlowDefinition(flowId, groupId, name, technology, host, port, topic, interval, burst, template, format, connectorId, connectorConfig);
        
        Object enabledObj = payload.get("enabled");
        if (enabledObj instanceof Boolean) {
            flow.setEnabled((Boolean) enabledObj);
        }

        Object everyTicksObj = payload.get("everyTicks");
        flow.setEveryTicks(everyTicksObj instanceof Number ? ((Number) everyTicksObj).intValue() : 1);

        // Event loss fields are optional: older project files load with event loss off
        Object lossObj = payload.get("lossPercent");
        flow.setLossPercent(lossObj instanceof Number ? ((Number) lossObj).doubleValue() : 0);
        Object outageEveryObj = payload.get("outageEveryTicks");
        flow.setOutageEveryTicks(outageEveryObj instanceof Number ? ((Number) outageEveryObj).intValue() : 0);
        Object outageDurationObj = payload.get("outageDurationTicks");
        flow.setOutageDurationTicks(outageDurationObj instanceof Number ? ((Number) outageDurationObj).intValue() : 0);
        
        return flow;
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
            ", everyTicks=" + everyTicks +
            ", lossPercent=" + lossPercent +
            ", outageEveryTicks=" + outageEveryTicks +
            ", outageDurationTicks=" + outageDurationTicks +
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
