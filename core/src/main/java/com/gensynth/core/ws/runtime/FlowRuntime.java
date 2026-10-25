package com.gensynth.core.ws.runtime;

import com.gensynth.core.model.FlowDefinition;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Represents the runtime state of a data flow.
 *
 * Status and metric fields are written by the flow's sender thread and read by the
 * metrics and bridge threads, so they are volatile or atomic.
 */
public class FlowRuntime {
    public final String id;
    public String name;
    public String technology;
    public volatile String connectionStatus;
    /** Measured messages per second (see {@link ThroughputMeter}). */
    public volatile double throughput;
    public volatile int latency;
    public volatile boolean hasError;
    public volatile String errorMessage;
    /**
     * Legacy publish interval in milliseconds. Ignored by the engine since message generation
     * is driven by the global tick clock; kept so existing project files round-trip.
     */
    public int interval;
    /** Legacy number of messages per send; ignored by the engine (one message per send). */
    public int burst;
    /** Number of global ticks between two messages of this flow (at least 1). */
    public final AtomicInteger everyTicks = new AtomicInteger(1);
    /** Percentage (0-100) of generated messages dropped at random instead of sent. */
    public volatile double lossPercent;
    /** Length in ticks of the periodic outage cycle (0 = no outages). */
    public final AtomicInteger outageEveryTicks = new AtomicInteger();
    /** Ticks at the end of every outage cycle in which every message is dropped (0 = no outages). */
    public final AtomicInteger outageDurationTicks = new AtomicInteger();
    public String topic;
    public String host;
    public int port;
    public String template;
    public String format;
    public boolean enabled;
    public Map<String, Object> connectorConfig;
    /** Messages generated since the group was started (runtime only, never persisted). */
    public final AtomicLong generated = new AtomicLong();
    /** Messages whose publish completed without error since the group was started. */
    public final AtomicLong sent = new AtomicLong();
    /** Messages that could not be sent since the group was started (generation or publish error). */
    public final AtomicLong failed = new AtomicLong();
    /** Messages generated but deliberately not sent (event loss) since the group was started. */
    public final AtomicLong dropped = new AtomicLong();
    /** Send rate meter of this flow. */
    public final ThroughputMeter meter = new ThroughputMeter();

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

        FlowRuntime runtime = new FlowRuntime(id, name, technology, status, throughput, latency, hasError, errorMessage, interval, burst, topic, host, port, template, format, enabled, config);
        runtime.everyTicks.set(definition.getEveryTicks());
        runtime.lossPercent = definition.getLossPercent();
        runtime.outageEveryTicks.set(definition.getOutageEveryTicks());
        runtime.outageDurationTicks.set(definition.getOutageDurationTicks());
        return runtime;
    }

    /**
     * Copies the send settings ({@code everyTicks} and the event loss fields) from another flow,
     * e.g. when cloning.
     *
     * @param source flow whose settings are copied
     */
    public void copySendSettingsFrom(FlowRuntime source) {
        this.everyTicks.set(source.everyTicks.get());
        this.lossPercent = source.lossPercent;
        this.outageEveryTicks.set(source.outageEveryTicks.get());
        this.outageDurationTicks.set(source.outageDurationTicks.get());
    }

    /**
     * Whether the flow is inside a periodic outage on the given group tick. The outage covers the
     * last {@code d = min(outageDurationTicks, outageEveryTicks)} ticks of every
     * {@code outageEveryTicks}-tick period; either value at 0 disables outages.
     *
     * @param groupTick simulation ticks since the group started (0 = first tick of the group)
     * @return true if every message of this tick is lost
     */
    public boolean isInOutage(long groupTick) {
        long period = outageEveryTicks.get();
        long duration = Math.min(outageDurationTicks.get(), period);
        if (period <= 0 || duration <= 0) {
            return false;
        }
        return Math.floorMod(groupTick, period) >= period - duration;
    }

    /**
     * Whether a generated message must be dropped instead of sent.
     *
     * @param groupTick simulation ticks since the group started
     * @param roll      random value in [0, 100)
     * @return true if the tick is in an outage or the roll falls below {@link #lossPercent}
     */
    public boolean shouldDrop(long groupTick, double roll) {
        return isInOutage(groupTick) || roll < lossPercent;
    }

    /**
     * Whether this flow sends a message on the given tick. The first tick of the group
     * ({@code tickNumber == startTick}) always sends.
     *
     * @param tickNumber current global tick
     * @param startTick  first tick seen by the group since it started
     * @return true if the flow is due on this tick
     */
    public boolean isDueOn(long tickNumber, long startTick) {
        return Math.floorMod(tickNumber - startTick, (long) Math.max(1, everyTicks.get())) == 0;
    }

    /**
     * Records a successful send.
     *
     * @param nowNanos {@link System#nanoTime()} of the send
     */
    public void recordSent(long nowNanos) {
        sent.incrementAndGet();
        meter.recordSend(nowNanos);
    }

    /**
     * Resets the message counters and the rate meter (when the group starts from stopped).
     */
    public void resetCounters() {
        generated.set(0);
        sent.set(0);
        failed.set(0);
        dropped.set(0);
        meter.reset();
        throughput = 0;
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
        def.setEveryTicks(everyTicks.get());
        def.setLossPercent(lossPercent);
        def.setOutageEveryTicks(outageEveryTicks.get());
        def.setOutageDurationTicks(outageDurationTicks.get());
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
        payload.put("everyTicks", everyTicks.get());
        payload.put("lossPercent", lossPercent);
        payload.put("outageEveryTicks", outageEveryTicks.get());
        payload.put("outageDurationTicks", outageDurationTicks.get());
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
