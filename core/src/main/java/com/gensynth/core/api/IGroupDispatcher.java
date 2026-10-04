package com.gensynth.core.api;

import com.gensynth.core.ws.runtime.FlowRuntime;

import java.util.List;

/**
 * Generates and sends the messages of one running group, following its output mode.
 * A dispatcher is created when the group starts and shut down when it stops or pauses.
 */
public interface IGroupDispatcher {

    /**
     * Handles one global tick for the flows of the group that are due on it.
     * Called only from the clock thread; it must never block on network I/O.
     *
     * @param dueFlows flows that must send a message on this tick, in group order
     * @return true if at least one message was generated
     */
    boolean dispatch(List<FlowRuntime> dueFlows);

    /**
     * Stops accepting work and drops pending messages. Non-blocking: a publish already in
     * progress finishes on its own thread, which then exits.
     */
    void shutdown();
}
