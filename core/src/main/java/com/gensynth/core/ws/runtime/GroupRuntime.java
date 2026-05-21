package com.gensynth.core.ws.runtime;

import com.gensynth.core.model.FlowDefinition;
import com.gensynth.core.model.GroupDefinition;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Represents the runtime state of a simulation group.
 */
public class GroupRuntime {
    public final String id;
    public String name;
    public String status;
    public String description;
    public int threads;
    public String outputMode;
    public boolean enabled;
    public final List<FlowRuntime> flows = new ArrayList<>();

    public GroupRuntime(String id, String name, String status, String description, int threads, String outputMode, boolean enabled) {
        this.id = id;
        this.name = name;
        this.status = status;
        this.description = description;
        this.threads = threads;
        this.outputMode = outputMode;
        this.enabled = enabled;
    }

    public static GroupRuntime fromDefinition(GroupDefinition definition) {
        GroupRuntime runtime = new GroupRuntime(
            definition.getGroupId(),
            definition.getName(),
            "stopped",
            definition.getDescription(),
            definition.getThreads(),
            definition.getOutputMode(),
            definition.isEnabled()
        );

        for (FlowDefinition flowDefinition : definition.getAllFlows().values()) {
            runtime.flows.add(FlowRuntime.fromDefinition(flowDefinition));
        }

        return runtime;
    }

    public GroupDefinition toDefinition() {
        GroupDefinition definition = new GroupDefinition(id, name, description, threads, outputMode);
        definition.setEnabled(enabled);
        for (FlowRuntime flow : flows) {
            definition.addFlow(flow.toDefinition(id));
        }
        return definition;
    }

    public Map<String, Object> toPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", id);
        payload.put("name", name);
        payload.put("status", status);
        payload.put("throughput", flows.stream().mapToInt(flow -> flow.throughput).sum());
        payload.put("description", description);
        payload.put("threads", threads);
        payload.put("outputMode", outputMode);
        payload.put("enabled", enabled);

        List<Map<String, Object>> flowPayload = new ArrayList<>();
        for (FlowRuntime flow : flows) {
            flowPayload.add(flow.toPayload());
        }
        payload.put("flows", flowPayload);
        return payload;
    }
}
