package com.gensynth.core.model;

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
    private final String id;
    private final String name;
    private final String scope; // "LOCAL", "GROUP", "GLOBAL"
    private final String type;  // "numeric", "string", "boolean", "date", "point", "list"
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
     */
    public Variable(String id, String name, String scope, String type, Object defaultValue, Map<String, Object> config) {
        this.id = Objects.requireNonNull(id, "id cannot be null");
        this.name = Objects.requireNonNull(name, "name cannot be null");
        this.scope = Objects.requireNonNull(scope, "scope cannot be null");
        this.type = Objects.requireNonNull(type, "type cannot be null");
        this.defaultValue = Objects.requireNonNull(defaultValue, "defaultValue cannot be null");
        this.config = config != null ? config : Map.of();
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();

        validateScope();
        validateType();
    }

    private void validateScope() {
        if (!scope.matches("LOCAL|GROUP|GLOBAL")) {
            throw new IllegalArgumentException("Invalid scope: " + scope + ". Must be LOCAL, GROUP, or GLOBAL");
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
        return Map.of(
            "id", id,
            "name", name,
            "type", type,
            "scope", scope,
            "defaultValue", defaultValue,
            "config", config,
            "createdAt", createdAt.toString(),
            "updatedAt", updatedAt.toString()
        );
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
        Object defaultValue = payload.getOrDefault("defaultValue", "");
        @SuppressWarnings("unchecked")
        Map<String, Object> config = (Map<String, Object>) payload.getOrDefault("config", Map.of());

        return new Variable(id, name, scope, type, defaultValue, config);
    }

    @Override
    public String toString() {
        return "Variable{" +
            "id='" + id + '\'' +
            ", name='" + name + '\'' +
            ", scope='" + scope + '\'' +
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
