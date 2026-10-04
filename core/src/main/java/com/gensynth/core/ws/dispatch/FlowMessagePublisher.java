package com.gensynth.core.ws.dispatch;

import com.gensynth.core.api.IFlowMessageHandler;
import com.gensynth.core.connectors.spi.ConnectorPlugin;
import com.gensynth.core.ws.BridgeContext;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Default {@link IFlowMessageHandler}: evaluates the flow template and publishes the result
 * through the flow's connector, updating the flow counters and the global metrics.
 *
 * Counters: {@code generated} after a successful generation, {@code sent} when
 * {@link ConnectorPlugin#publish} returns without error, {@code failed} when the template
 * cannot be evaluated or the publish throws.
 */
public class FlowMessagePublisher implements IFlowMessageHandler {

    private static final Logger logger = LoggerFactory.getLogger(FlowMessagePublisher.class);
    private static final Map<String, String> HEADERS = Map.of("content-type", "application/json");

    /** Minimum time between two "data" preview log entries of the same flow. */
    private static final long PREVIEW_LOG_THROTTLE_MS = 250;
    /** Minimum time between two error log entries of the same flow. */
    private static final long ERROR_LOG_THROTTLE_MS = 1_000;
    /** Minimum time between two "skipped tick" warnings of the same flow. */
    private static final long SKIP_LOG_THROTTLE_MS = 10_000;

    private final BridgeContext ctx;
    private final Map<String, Long> lastPreviewLogByFlowId = new ConcurrentHashMap<>();
    private final Map<String, Long> lastErrorLogByFlowId = new ConcurrentHashMap<>();
    private final Map<String, Long> lastSkipLogByFlowId = new ConcurrentHashMap<>();

    /**
     * @param ctx shared bridge context
     */
    public FlowMessagePublisher(BridgeContext ctx) {
        this.ctx = ctx;
    }

    @Override
    public String generate(GroupRuntime group, FlowRuntime flow) {
        try {
            // Global sequence: {{n}} is unique even across flows running in parallel
            long sequence = ctx.getMessageSequence().incrementAndGet();
            String payload = ctx.getTemplateEngine().evaluate(flow.template, sequence, ctx.getVariablesById(), flow.id, group.id);
            flow.generated.incrementAndGet();
            return payload;
        } catch (Exception ex) {
            flow.failed.incrementAndGet();
            markError(flow, "Message generation failed: " + ex.getMessage());
            return null;
        }
    }

    @Override
    public void publish(GroupRuntime group, FlowRuntime flow, String payload) {
        ConnectorPlugin connector = ctx.getConnectorByFlowId().get(flow.id);
        if (connector == null) {
            // The group was stopped: the message stays as generated but not sent
            return;
        }

        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
        long startedAt = System.nanoTime();
        try {
            connector.publish(flow.topic, bytes, HEADERS);
        } catch (Exception ex) {
            if (ctx.getConnectorByFlowId().get(flow.id) != connector) {
                // The group was stopped while publishing; not a real error
                return;
            }
            flow.failed.incrementAndGet();
            markError(flow, "Publish failed: " + ex.getMessage());
            return;
        }

        long now = System.nanoTime();
        flow.recordSent(now);
        flow.latency = (int) Math.max(1L, TimeUnit.NANOSECONDS.toMillis(now - startedAt));
        flow.connectionStatus = "connected";
        flow.hasError = false;
        flow.errorMessage = null;

        ctx.getTotalMessages().incrementAndGet();
        ctx.getMessagesLastWindow().incrementAndGet();
        ctx.getBytesSentLastWindow().addAndGet(bytes.length);

        if (shouldLog(lastPreviewLogByFlowId, flow.id, PREVIEW_LOG_THROTTLE_MS)) {
            String preview = payload.length() > 250 ? payload.substring(0, 250) + "..." : payload;
            ctx.getServer().sendLogToAll("data", flow.id, "[" + group.name + " - " + flow.name + "] ==> " + preview);
        }
    }

    @Override
    public void onTickSkipped(GroupRuntime group, FlowRuntime flow) {
        if (shouldLog(lastSkipLogByFlowId, flow.id, SKIP_LOG_THROTTLE_MS)) {
            logger.warn("[{} - {}] Sending is slower than the tick rate: ticks are being skipped", group.name, flow.name);
        }
    }

    private void markError(FlowRuntime flow, String message) {
        flow.connectionStatus = "error";
        flow.hasError = true;
        flow.errorMessage = message;
        ctx.getTotalErrors().incrementAndGet();
        if (shouldLog(lastErrorLogByFlowId, flow.id, ERROR_LOG_THROTTLE_MS)) {
            ctx.getServer().sendLogToAll("error", flow.id, message);
        }
    }

    /**
     * Throttles per-flow log entries so high tick rates do not flood the UI and the log file.
     */
    private static boolean shouldLog(Map<String, Long> lastLogByFlowId, String flowId, long throttleMs) {
        long now = System.currentTimeMillis();
        Long last = lastLogByFlowId.get(flowId);
        if (last != null && now - last < throttleMs) {
            return false;
        }
        lastLogByFlowId.put(flowId, now);
        return true;
    }
}
