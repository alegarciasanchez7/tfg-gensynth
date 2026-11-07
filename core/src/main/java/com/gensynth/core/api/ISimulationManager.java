package com.gensynth.core.api;

import com.gensynth.core.model.ProjectReport;
import com.gensynth.core.model.SimulationSnapshot;
import com.gensynth.core.model.TickSettings;

import java.nio.file.Path;
import java.util.List;

/**
 * Runs project files headlessly for the command line. Each project file gets a session id the
 * first time it starts, assigned in start order from 1, and keeps it while the manager lives:
 * starting it again after it stopped reuses its id.
 */
public interface ISimulationManager {

    /**
     * Loads a project file and starts all its groups. A file that already ran in this session
     * keeps its id, and the new run starts its counters from zero.
     *
     * @param configFile the {@code .gsynth} project file
     * @return the started simulation
     * @throws IllegalArgumentException if the file does not exist or is not a valid project
     * @throws IllegalStateException    if the file is already running, or the project cannot
     *                                  start (e.g. cyclic variable references); the exception
     *                                  lists every reason found
     */
    SimulationSnapshot start(Path configFile);

    /**
     * Reads a project file and checks it without running it: nothing is started and no
     * connection is opened.
     *
     * @param configFile the {@code .gsynth} project file
     * @return the project with what would stop it from starting
     * @throws IllegalArgumentException if the file does not exist or is not a valid project
     */
    ProjectReport inspect(Path configFile);

    /**
     * Changes the tick of a running simulation live, without restarting it. The project file
     * is not modified.
     *
     * @param id   the session id
     * @param tick the new tick settings
     * @return the simulation with its new tick
     * @throws IllegalArgumentException if no simulation has that id
     * @throws IllegalStateException    if the simulation is stopped
     */
    SimulationSnapshot changeTick(int id, TickSettings tick);

    /**
     * Stops a running simulation and closes its connectors.
     *
     * @param id the session id
     * @return the stopped simulation with its final counters
     * @throws IllegalArgumentException if no simulation has that id
     * @throws IllegalStateException    if the simulation is already stopped
     */
    SimulationSnapshot stop(int id);

    /**
     * Stops every running simulation.
     *
     * @return the simulations that were stopped, in id order (empty if none was running)
     */
    List<SimulationSnapshot> stopAll();

    /**
     * @return every simulation of the session, running or stopped, in id order
     */
    List<SimulationSnapshot> list();

    /**
     * Stops every running simulation and releases the engines. Safe to call more than once.
     */
    void shutdown();
}
