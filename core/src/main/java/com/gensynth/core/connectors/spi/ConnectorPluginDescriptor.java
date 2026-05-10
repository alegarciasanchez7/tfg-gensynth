package com.gensynth.core.connectors.spi;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Metadata contract exposed to management/UI layers.
 */
public final class ConnectorPluginDescriptor {

    private final String pluginId;
    private final String displayName;
    private final String pluginVersion;
    private final String coreApiVersion;
    private final Map<String, Object> configSchema;
    private boolean external;

    public ConnectorPluginDescriptor(
        String pluginId,
        String displayName,
        String pluginVersion,
        String coreApiVersion,
        Map<String, Object> configSchema
    ) {
        this.pluginId = requireNonBlank(pluginId, "pluginId");
        this.displayName = requireNonBlank(displayName, "displayName");
        this.pluginVersion = requireNonBlank(pluginVersion, "pluginVersion");
        this.coreApiVersion = requireNonBlank(coreApiVersion, "coreApiVersion");
        this.configSchema = Collections.unmodifiableMap(new LinkedHashMap<>(
            Objects.requireNonNull(configSchema, "configSchema cannot be null")
        ));
    }

    public String getPluginId() {
        return pluginId;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getPluginVersion() {
        return pluginVersion;
    }

    public String getCoreApiVersion() {
        return coreApiVersion;
    }

    public Map<String, Object> getConfigSchema() {
        return configSchema;
    }

    public boolean isExternal() {
        return external;
    }

    public void setExternal(boolean external) {
        this.external = external;
    }

    public String key() {
        return pluginId + "@" + pluginVersion;
    }

    private static String requireNonBlank(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " cannot be null or blank");
        }
        return value;
    }
}
