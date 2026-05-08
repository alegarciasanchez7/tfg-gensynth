package com.gensynth.core.connectors.file;

import com.gensynth.core.connectors.spi.ConnectorPlugin;
import com.gensynth.core.connectors.spi.ConnectorPluginDescriptor;
import com.gensynth.core.connectors.spi.ConnectorPluginProvider;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * ServiceLoader provider for File connector plugin.
 * Outputs events to .txt (pipe-delimited) or .json (JSON Lines) files.
 */
public class FileConnectorPluginProvider implements ConnectorPluginProvider {

    private static final ConnectorPluginDescriptor DESCRIPTOR = new ConnectorPluginDescriptor(
        "file",
        "File Output (JSON/TXT/XML/CSV)",
        "1.0.0",
        "1.x",
        buildConfigSchema()
    );

    @Override
    public ConnectorPluginDescriptor descriptor() {
        return DESCRIPTOR;
    }

    @Override
    public ConnectorPlugin create() {
        return new FileConnectorPlugin();
    }

    private static Map<String, Object> buildConfigSchema() {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("required", Arrays.asList("outputDir"));
        schema.put("properties", buildProperties());
        return schema;
    }

    private static Map<String, Object> buildProperties() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("outputDir", stringField(
            "Output Directory",
            "./outputs",
            "Absolute path where event files will be written"
        ));
        properties.put("format", enumField(
            "Output Format",
            "json",
            Arrays.asList("json", "txt", "xml", "csv")
        ));
        properties.put("fileName", stringField(
            "File Name (optional)",
            "",
            "Base filename without extension (auto-generated if empty)"
        ));
        return properties;
    }

    private static Map<String, Object> stringField(String title, String defaultValue, String description) {
        Map<String, Object> field = new LinkedHashMap<>();
        field.put("type", "string");
        field.put("title", title);
        field.put("default", defaultValue);
        field.put("description", description);
        return field;
    }

    private static Map<String, Object> enumField(String title, String defaultValue, java.util.List<String> values) {
        Map<String, Object> field = new LinkedHashMap<>();
        field.put("type", "string");
        field.put("title", title);
        field.put("default", defaultValue);
        field.put("enum", values);
        field.put("description", "Choose output format");
        return field;
    }
}
