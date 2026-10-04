package com.gensynth.plugin.api;

import java.util.Map;

/**
 * An open connection of one flow. Created by {@link ConnectorPlugin#connect} when the flow's
 * group starts and closed when it stops.
 *
 * Threading: each flow has its own session, and GenSynth never calls {@link #send} on the same
 * session from two threads at the same time, so a session does not need to be thread-safe.
 */
public interface ConnectorSession extends AutoCloseable {

    /**
     * Sends one message.
     *
     * Delivery contract: return only when the technology has accepted the message (and confirmed
     * it, when the technology supports confirmations); throw if it was rejected or could not be
     * sent. GenSynth counts a normal return as "sent" and an exception as "failed".
     *
     * @param payload the message generated from the flow's message format
     * @param headers metadata such as {@code content-type}; use it if the technology supports headers
     * @throws Exception if the message could not be sent
     */
    void send(byte[] payload, Map<String, String> headers) throws Exception;

    /**
     * @return false if the connection is known to be broken
     */
    default boolean isHealthy() {
        return true;
    }

    /**
     * Releases the connection. Called when the flow's group stops; must not throw for an
     * already closed connection.
     *
     * @throws Exception if the connection cannot be released cleanly (only logged)
     */
    @Override
    void close() throws Exception;
}
