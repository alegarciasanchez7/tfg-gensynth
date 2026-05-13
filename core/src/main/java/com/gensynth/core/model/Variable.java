package com.gensynth.core.model;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.Map;
import java.util.Objects;

/**
 * Represents a Variable in the gen-synth system.
 *
 * Variables can be scoped at different levels:
 * - LOCAL: per-flow variables
 * - GROUP: shared within a group
 * - GLOBAL: system-wide variables
 *
 * Each variable has a name, type, default value, and optional configuration.
 * Variables are persistent and synchronized between UI and Core.
 */
public class Variable {
    private static final Logger logger = LoggerFactory.getLogger(Variable.class);
    private final String id;
    private final String name;
    private final String scope; // "LOCAL", "GROUP", "GLOBAL"
    private final String type;  // "numeric", "string", "boolean", "date", "point", "list"
    private final String flowId;
    private final String groupId;
    private final Object defaultValue;
    private final Map<String, Object> config;
    private final Instant createdAt;
    private Instant updatedAt;

    /**
     * Constructor for Variable.
     *
     * @param id Unique identifier (UUID format)
     * @param name Human-readable name
     * @param scope Variable scope (LOCAL, GROUP, GLOBAL)
     * @param type Variable type
     * @param defaultValue Default value for this variable
     * @param config Optional configuration map
     * @param flowId Target flow ID (required if scope is LOCAL)
     * @param groupId Target group ID (required if scope is GROUP)
     */
    public Variable(String id, String name, String scope, String type, Object defaultValue, Map<String, Object> config, String flowId, String groupId) {
        this.id = Objects.requireNonNull(id, "id cannot be null");
        this.name = Objects.requireNonNull(name, "name cannot be null");
        this.scope = Objects.requireNonNull(scope, "scope cannot be null").toUpperCase();
        this.type = Objects.requireNonNull(type, "type cannot be null");
        this.defaultValue = Objects.requireNonNull(defaultValue, "defaultValue cannot be null");
        this.config = config != null ? config : Map.of();
        this.flowId = flowId;
        this.groupId = groupId;
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();

        validateScope();
        validateType();
    }

    private void validateScope() {
        if (!scope.matches("LOCAL|GROUP|GLOBAL")) {
            throw new IllegalArgumentException("Invalid scope: " + scope + ". Must be LOCAL, GROUP, or GLOBAL");
        }
        if ("LOCAL".equals(scope) && (flowId == null || flowId.isBlank())) {
            throw new IllegalArgumentException("LOCAL scope variable requires a flowId");
        }
        if ("GROUP".equals(scope) && (groupId == null || groupId.isBlank())) {
            throw new IllegalArgumentException("GROUP scope variable requires a groupId");
        }
    }

    private void validateType() {
        if (!type.matches("numeric|string|boolean|date|point|list")) {
            throw new IllegalArgumentException("Invalid type: " + type + ". Must be one of: numeric, string, boolean, date, point, list");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Getters
    // ─────────────────────────────────────────────────────────────

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getScope() {
        return scope;
    }

    public String getType() {
        return type;
    }

    public String getFlowId() {
        return flowId;
    }

    public String getGroupId() {
        return groupId;
    }

    public Object getDefaultValue() {
        return defaultValue;
    }

    public Map<String, Object> getConfig() {
        return config;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    // ─────────────────────────────────────────────────────────────
    // Serialization
    // ─────────────────────────────────────────────────────────────

    /**
     * Converts this Variable to a payload map suitable for JSON serialization.
     *
     * @return Map representation of this Variable
     */
    public Map<String, Object> toPayload() {
        Map<String, Object> payload = new java.util.LinkedHashMap<>();
        payload.put("id", id);
        payload.put("name", name);
        payload.put("type", type);
        payload.put("scope", scope.toLowerCase());
        payload.put("flowId", flowId);
        payload.put("groupId", groupId);
        payload.put("defaultValue", defaultValue);
        payload.put("config", config);
        payload.put("createdAt", createdAt.toString());
        payload.put("updatedAt", updatedAt.toString());
        return payload;
    }

    /**
     * Creates a Variable from a payload map (used during deserialization).
     *
     * @param payload Map containing variable data
     * @return Variable instance
     */
    public static Variable fromPayload(Map<String, Object> payload) {
        String id = (String) payload.getOrDefault("id", java.util.UUID.randomUUID().toString());
        String name = (String) payload.getOrDefault("name", "Unnamed Variable");
        String scope = (String) payload.getOrDefault("scope", "GLOBAL");
        String type = (String) payload.getOrDefault("type", "string");
        String flowId = (String) payload.get("flowId");
        String groupId = (String) payload.get("groupId");
        Object defaultValue = payload.getOrDefault("defaultValue", "");
        @SuppressWarnings("unchecked")
        Map<String, Object> config = (Map<String, Object>) payload.getOrDefault("config", Map.of());

        // Robustness: If scope is LOCAL but flowId is missing, downgrade to GLOBAL to avoid crashing on import
        if ("local".equalsIgnoreCase(scope) && (flowId == null || flowId.isBlank())) {
            logger.warn("Variable '{}' (id: {}) has LOCAL scope but missing flowId. Downgrading to GLOBAL.", name, id);
            scope = "GLOBAL";
        }
        // Robustness: If scope is GROUP but groupId is missing, downgrade to GLOBAL
        if ("group".equalsIgnoreCase(scope) && (groupId == null || groupId.isBlank())) {
            logger.warn("Variable '{}' (id: {}) has GROUP scope but missing groupId. Downgrading to GLOBAL.", name, id);
            scope = "GLOBAL";
        }

        return new Variable(id, name, scope.toUpperCase(), type, defaultValue, config, flowId, groupId);
    }

    @Override
    public String toString() {
        return "Variable{" +
            "id='" + id + '\'' +
            ", name='" + name + '\'' +
            ", scope='" + scope + '\'' +
            ", flowId='" + flowId + '\'' +
            ", groupId='" + groupId + '\'' +
            ", type='" + type + '\'' +
            ", defaultValue=" + defaultValue +
            ", createdAt=" + createdAt +
            ", updatedAt=" + updatedAt +
            '}';
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Variable)) return false;
        Variable variable = (Variable) o;
        return Objects.equals(id, variable.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
