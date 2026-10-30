package com.gensynth.core.ws.runtime;

import com.gensynth.core.api.IGroupDispatcher;
import com.gensynth.core.model.FlowDefinition;
import com.gensynth.core.model.GroupDefinition;
import com.gensynth.core.model.OutputMode;
import com.gensynth.core.model.SequentialOrder;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Represents the runtime state of a simulation group.
 */
public class GroupRuntime {
    public final String id;
    public String name;
    public String status;
    public String description;
    /** Legacy number of threads; ignored by the engine. */
    public int threads;
    /** Output mode wire value ("parallel" or "sequential"); applied when the group starts. */
    public String outputMode;
    /** Sequential order wire value ("flow", "random" or "generated"); applied when the group starts. */
    public String sequentialOrder = SequentialOrder.FLOW.wireValue();
    public boolean enabled;
    public final List<FlowRuntime> flows = new ArrayList<>();
    /** Sends the messages of the group while it runs; null while stopped or paused. Guarded by the state lock. */
    public IGroupDispatcher dispatcher;
    /** First tick seen since the group started (0 = not seen yet). Guarded by the state lock. */
    public long startTick;

    public GroupRuntime(String id, String name, String status, String description, int threads, String outputMode, boolean enabled) {
        this.id = id;
        this.name = name;
        this.status = status;
        this.description = description;
        this.threads = threads;
        this.outputMode = OutputMode.fromValue(outputMode).wireValue();
        this.enabled = enabled;
    }

    /**
     * Names of the flows of this group, in order.
     *
     * @param exceptFlowId id of a flow to leave out (the flow being renamed), or {@code null}
     * @return the flow names
     */
    public List<String> flowNames(String exceptFlowId) {
        List<String> names = new ArrayList<>();
        for (FlowRuntime flow : flows) {
            if (exceptFlowId == null || !exceptFlowId.equals(flow.id)) {
                names.add(flow.name);
            }
        }
        return names;
    }

    /**
     * Changes the order of the flows: the listed flows go first, in the given order, and the
     * others keep their relative order after them. Unknown or repeated ids are ignored, so a
     * flow created meanwhile is never lost. The caller must hold the state lock.
     *
     * @param flowIds ids of the flows in their new order
     * @return true if the order changed
     */
    public boolean reorderFlows(List<String> flowIds) {
        Map<String, FlowRuntime> byId = new LinkedHashMap<>();
        for (FlowRuntime flow : flows) {
            byId.put(flow.id, flow);
        }
        Set<FlowRuntime> ordered = new LinkedHashSet<>();
        for (String flowId : flowIds) {
            FlowRuntime flow = byId.get(flowId);
            if (flow != null) {
                ordered.add(flow);
            }
        }
        ordered.addAll(flows);
        List<FlowRuntime> newOrder = new ArrayList<>(ordered);
        if (newOrder.equals(flows)) {
            return false;
        }
        flows.clear();
        flows.addAll(newOrder);
        return true;
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
        runtime.sequentialOrder = definition.getSequentialOrder();

        for (FlowDefinition flowDefinition : definition.getAllFlows().values()) {
            runtime.flows.add(FlowRuntime.fromDefinition(flowDefinition));
        }

        return runtime;
    }

    public GroupDefinition toDefinition() {
        GroupDefinition definition = new GroupDefinition(id, name, description, threads, outputMode);
        definition.setEnabled(enabled);
        definition.setSequentialOrder(sequentialOrder);
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
        payload.put("throughput", flows.stream().mapToDouble(flow -> flow.throughput).sum());
        payload.put("description", description);
        payload.put("threads", threads);
        payload.put("outputMode", outputMode);
        payload.put("sequentialOrder", sequentialOrder);
        payload.put("enabled", enabled);

        List<Map<String, Object>> flowPayload = new ArrayList<>();
        for (FlowRuntime flow : flows) {
            flowPayload.add(flow.toPayload());
        }
        payload.put("flows", flowPayload);
        return payload;
    }
}
