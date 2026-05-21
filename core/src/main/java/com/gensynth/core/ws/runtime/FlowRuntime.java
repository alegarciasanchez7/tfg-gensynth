package com.gensynth.core.ws.runtime;

import com.gensynth.core.model.FlowDefinition;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Represents the runtime state of a data flow.
 */
public class FlowRuntime {
    public final String id;
    public String name;
    public String technology;
    public String connectionStatus;
    public int throughput;
    public int latency;
    public boolean hasError;
    public String errorMessage;
    public int interval;
    public int burst;
    public String topic;
    public String host;
    public int port;
    public String template;
    public String format;
    public boolean enabled;
    public Map<String, Object> connectorConfig;

    public FlowRuntime(
        String id,
        String name,
        String technology,
        String connectionStatus,
        int throughput,
        int latency,
        boolean hasError,
        String errorMessage,
        int interval,
        int burst,
        String topic,
        String host,
        int port,
        String template,
        String format,
        boolean enabled,
        Map<String, Object> connectorConfig
    ) {
        this.id = id;
        this.name = name;
        this.technology = technology;
        this.connectionStatus = connectionStatus;
        this.throughput = throughput;
        this.latency = latency;
        this.hasError = hasError;
        this.errorMessage = errorMessage;
        this.interval = interval;
        this.burst = burst;
        this.topic = topic;
        this.host = host;
        this.port = port;
        this.template = template;
        this.format = format != null ? format : "json";
        this.enabled = enabled;
        this.connectorConfig = connectorConfig != null ? new LinkedHashMap<>(connectorConfig) : new LinkedHashMap<>();
    }

    public static FlowRuntime fromDefinition(FlowDefinition definition) {
        String id = definition.getFlowId();
        String name = definition.getName();
        String technology = definition.getTechnology();
        String status = "disconnected";
        int throughput = 0;
        int latency = 0;
        boolean hasError = false;
        String errorMessage = null;
        int interval = definition.getInterval();
        int burst = definition.getBurst();
        String topic = definition.getTopic();
        String host = definition.getHost();
        int port = definition.getPort();
        String template = definition.getTemplate();
        String format = definition.getFormat();
        boolean enabled = definition.isEnabled();
        Map<String, Object> config = definition.getConnectorConfig();

        return new FlowRuntime(id, name, technology, status, throughput, latency, hasError, errorMessage, interval, burst, topic, host, port, template, format, enabled, config);
    }

    public FlowDefinition toDefinition(String groupId) {
        FlowDefinition def = new FlowDefinition(
            id,
            groupId,
            name,
            technology,
            host,
            port,
            topic,
            interval,
            burst,
            template,
            format,
            technology,
            connectorConfig
        );
        def.setEnabled(enabled);
        return def;
    }

    public Map<String, Object> toPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", id);
        payload.put("name", name);
        payload.put("technology", technology);
        payload.put("connectionStatus", connectionStatus);
        payload.put("throughput", throughput);
        payload.put("latency", latency);
        payload.put("hasError", hasError);
        if (errorMessage != null) {
            payload.put("errorMessage", errorMessage);
        }
        payload.put("interval", interval);
        payload.put("burst", burst);
        payload.put("topic", topic);
        payload.put("host", host);
        payload.put("port", port);
        payload.put("template", template);
        payload.put("format", format);
        payload.put("enabled", enabled);
        payload.put("connectorConfig", connectorConfig);
        return payload;
    }
}
