package com.gensynth.core.api;

import com.gensynth.core.model.SimulationSnapshot;

import java.nio.file.Path;
import java.util.List;

/**
 * Runs project files headlessly for the command line. Each started project gets a session id,
 * assigned in start order from 1; ids are never reused while the manager lives, so a stopped
 * simulation keeps its id.
 */
public interface ISimulationManager {

    /**
     * Loads a project file and starts all its groups.
     *
     * @param configFile the {@code .gsynth} project file
     * @return the started simulation
     * @throws IllegalArgumentException if the file does not exist or is not a valid project
     * @throws IllegalStateException    if the file is already running, or the project cannot
     *                                  start (e.g. cyclic variable references)
     */
    SimulationSnapshot start(Path configFile);

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
