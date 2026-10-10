package com.gensynth.core.connectors.runtime;

import com.gensynth.plugin.api.ConnectorField;
import com.gensynth.plugin.api.ConnectorInfo;
import com.gensynth.plugin.api.PluginApi;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Catalog entry of a loaded connector plugin, as sent to the UI (serialized through its getters).
 */
public final class ConnectorDescriptor {

    private final ConnectorInfo info;
    private final List<ConnectorField> fields;
    private final boolean external;

    /**
     * @param info     plugin identity
     * @param fields   plugin fields, in display order
     * @param external true if loaded from the plugins directory
     */
    public ConnectorDescriptor(ConnectorInfo info, List<ConnectorField> fields, boolean external) {
        this.info = info;
        this.fields = List.copyOf(fields);
        this.external = external;
    }

    /** @return plugin id */
    public String getPluginId() { return info.id(); }

    /** @return display name */
    public String getDisplayName() { return info.displayName(); }

    /** @return plugin version */
    public String getPluginVersion() { return info.version(); }

    /** @return plugin description */
    public String getDescription() { return info.description(); }

    /** @return version of the plugin API provided by this core */
    public String getApiVersion() { return PluginApi.VERSION; }

    /** @return true if the plugin was installed in the plugins directory */
    public boolean isExternal() { return external; }

    /** @return the fields serialized for the UI, in display order */
    public List<Map<String, Object>> getFields() {
        List<Map<String, Object>> payload = new ArrayList<>(fields.size());
        for (ConnectorField field : fields) {
            payload.add(toPayload(field));
        }
        return payload;
    }

    /** @return the plugin fields, in display order (not serialized) */
    public List<ConnectorField> fieldDefinitions() {
        return fields;
    }

    /** @return "id@version" */
    public String key() {
        return info.id() + "@" + info.version();
    }

    private static Map<String, Object> toPayload(ConnectorField field) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("key", field.getKey());
        payload.put("type", field.getType().name());
        payload.put("label", field.getLabel());
        payload.put("tooltip", field.getTooltip());
        payload.put("required", field.isRequired());
        payload.put("defaultValue", field.getDefaultValue());
        payload.put("placeholder", field.getPlaceholder());
        if (field.getMin() != null) payload.put("min", field.getMin());
        if (field.getMax() != null) payload.put("max", field.getMax());
        List<Map<String, Object>> options = new ArrayList<>();
        for (ConnectorField.Option option : field.getOptions()) {
            options.add(Map.of("value", option.value(), "label", option.label()));
        }
        payload.put("options", options);
        return payload;
    }
}
