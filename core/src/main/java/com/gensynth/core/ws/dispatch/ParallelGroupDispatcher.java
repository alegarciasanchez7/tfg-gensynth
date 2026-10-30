package com.gensynth.core.ws.dispatch;

import com.gensynth.core.api.IFlowMessageHandler;
import com.gensynth.core.api.IGroupDispatcher;
import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;

import java.util.List;

/**
 * Parallel output mode: every flow of the group is an independent process with its own
 * thread. On a due tick the flow generates and sends its message on that thread, without
 * waiting for the other flows.
 *
 * Backpressure: a flow has at most one message in progress. If it is still busy when its
 * next tick arrives, that tick is skipped for the flow (nothing is generated), so a slow
 * connector can never build an unbounded backlog.
 */
public class ParallelGroupDispatcher implements IGroupDispatcher {

    private final GroupRuntime group;
    private final IFlowMessageHandler handler;
    private final FlowWorkers workers;
    private volatile boolean closed;

    /**
     * Creates one worker thread per flow.
     *
     * @param group   the group being dispatched
     * @param flows   flows that can send (those with a started connector)
     * @param handler generates and publishes the messages
     */
    public ParallelGroupDispatcher(GroupRuntime group, List<FlowRuntime> flows, IFlowMessageHandler handler) {
        this.group = group;
        this.handler = handler;
        this.workers = new FlowWorkers(group, flows);
    }

    @Override
    public boolean dispatch(List<FlowRuntime> dueFlows, long groupTick) {
        if (closed) {
            return false;
        }
        boolean handedOff = false;
        for (FlowRuntime flow : dueFlows) {
            switch (workers.tryRun(flow, () -> sendOne(flow, groupTick))) {
                case STARTED -> handedOff = true;
                case BUSY -> handler.onTickSkipped(group, flow);
                case UNAVAILABLE -> { }
            }
        }
        return handedOff;
    }

    private void sendOne(FlowRuntime flow, long groupTick) {
        if (closed) {
            return;
        }
        String payload = handler.generate(group, flow);
        if (payload != null && !closed) {
            handler.publish(group, flow, payload, groupTick);
        }
    }

    @Override
    public void shutdown() {
        closed = true;
        workers.shutdown();
    }
}
