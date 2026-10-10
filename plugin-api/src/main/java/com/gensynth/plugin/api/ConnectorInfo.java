package com.gensynth.plugin.api;

import java.util.Objects;

/**
 * Identity of a connector plugin.
 *
 * @param id          stable technical id, e.g. "rabbitmq"; stored in project files, so never change it
 * @param displayName name shown in the connector selector, e.g. "RabbitMQ"
 * @param version     version of the plugin itself (not of the technology), e.g. "1.0.0"
 * @param description one sentence explaining what the connector does
 */
public record ConnectorInfo(String id, String displayName, String version, String description) {

    /**
     * Validates the identity.
     */
    public ConnectorInfo {
        requireText(id, "id");
        requireText(displayName, "displayName");
        requireText(version, "version");
        if (!id.matches("[a-z0-9][a-z0-9._-]*")) {
            throw new IllegalArgumentException("id must be lowercase letters, digits, '.', '_' or '-': " + id);
        }
        description = description == null ? "" : description;
    }

    private static void requireText(String value, String name) {
        if (Objects.requireNonNull(value, name + " cannot be null").isBlank()) {
            throw new IllegalArgumentException(name + " cannot be blank");
        }
    }
}
