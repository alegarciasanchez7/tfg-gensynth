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
     * Publishes a generated message through the flow's connector. Never throws: failures
     * are recorded on the flow.
     *
     * @param group   the group that owns the flow
     * @param flow    the flow
     * @param payload the generated message
     */
    void publish(GroupRuntime group, FlowRuntime flow, String payload);

    /**
     * Notifies that a flow could not take a due tick because it is still busy
     * (the flow, or the group queue, is slower than the tick rate).
     *
     * @param group the group that owns the flow
     * @param flow  the flow
     */
    void onTickSkipped(GroupRuntime group, FlowRuntime flow);
}
