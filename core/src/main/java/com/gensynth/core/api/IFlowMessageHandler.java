package com.gensynth.core.api;

import com.gensynth.core.ws.runtime.FlowRuntime;
import com.gensynth.core.ws.runtime.GroupRuntime;

/**
 * Generates and publishes single flow messages on behalf of a {@link IGroupDispatcher}.
 */
public interface IFlowMessageHandler {

    /**
     * Generates the next message of a flow from its template.
     *
     * @param group the group that owns the flow
     * @param flow  the flow
     * @return the payload, or null if generation failed (already reported)
     */
    String generate(GroupRuntime group, FlowRuntime flow);

    /**
     * Publishes a generated message through the flow's connector, unless the flow's event loss
     * drops it (then it is only counted as dropped). Never throws: failures are recorded on the flow.
     *
     * @param group     the group that owns the flow
     * @param flow      the flow
     * @param payload   the generated message
     * @param groupTick simulation ticks since the group started on the tick that generated the
     *                  message (0 = the group's first tick), used by the outage rule
     */
    void publish(GroupRuntime group, FlowRuntime flow, String payload, long groupTick);

    /**
     * Notifies that a flow could not take a due tick because it is still busy
     * (the flow, or the group queue, is slower than the tick rate).
     *
     * @param group the group that owns the flow
     * @param flow  the flow
     */
    void onTickSkipped(GroupRuntime group, FlowRuntime flow);
}
