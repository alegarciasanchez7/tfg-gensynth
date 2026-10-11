package com.gensynth.core.model;

import java.nio.file.Path;
import java.util.List;

/**
 * Point-in-time view of a simulation started from the command line.
 *
 * @param id              session id, assigned in start order from 1
 * @param configFile      the project file the simulation runs
 * @param outputDir       folder of the output files of the session (file connector)
 * @param status          whether the simulation is running or stopped
 * @param groups          number of groups in the project
 * @param flows           number of flows in the project
 * @param startedAt       start time, in epoch milliseconds
 * @param stoppedAt       stop time in epoch milliseconds, or 0 while running
 * @param messagesSent    messages sent so far
 * @param errors          errors counted so far (failed sends and connector errors)
 * @param connectorErrors flows whose connector failed to start, as {@code "<group> / <flow>: <error>"}
 * @param messagesPerSecond  messages sent during the last second (0 once stopped)
 * @param ticksPerSecond     ticks of the clock during the last second (0 once stopped)
 * @param networkUpPerSecond bytes sent during the last second (0 once stopped)
 */
public record SimulationSnapshot(
    int id,
    Path configFile,
    String outputDir,
    Status status,
    int groups,
    int flows,
    long startedAt,
    long stoppedAt,
    long messagesSent,
    long errors,
    List<String> connectorErrors,
    double messagesPerSecond,
    double ticksPerSecond,
    double networkUpPerSecond
) {

    /** Lifecycle state of a command line simulation. */
    public enum Status { RUNNING, STOPPED }

    /**
     * @param now current time in epoch milliseconds
     * @return how long the simulation has run (until now, or until it stopped)
     */
    public long uptimeMillis(long now) {
        return (status == Status.RUNNING ? now : stoppedAt) - startedAt;
    }
}
