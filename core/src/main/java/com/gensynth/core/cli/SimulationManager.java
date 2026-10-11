package com.gensynth.core.cli;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.api.ISimulationManager;
import com.gensynth.core.config.AppPaths;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.model.SimulationSnapshot;
import com.gensynth.core.persistence.ProjectFileFormat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Keeps the simulations of one command line session. Ids start at 1 and follow the start
 * order; a failed start does not use an id, and a stopped simulation keeps its id until the
 * session ends. A project file can only run once at a time.
 */
public class SimulationManager implements ISimulationManager {

    private final ConnectorCatalogService connectorCatalog;
    private final Supplier<String> outputDirFactory;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<Integer, HeadlessSimulation> simulations = new LinkedHashMap<>();
    private int nextId = 1;

    /**
     * Uses the installed connector plugins and the session output folders of {@link AppPaths}.
     */
    public SimulationManager() {
        this(new ConnectorCatalogService(AppPaths.current().pluginsDir(), AppPaths.current().sharedLibsDir()),
             () -> AppPaths.current().newSessionOutputDir());
    }

    /**
     * @param connectorCatalog connector catalog shared by every simulation (plugins load once)
     * @param outputDirFactory builds the base output folder of a new session; the simulation id
     *                         is appended so two simulations never share a folder
     */
    public SimulationManager(ConnectorCatalogService connectorCatalog, Supplier<String> outputDirFactory) {
        this.connectorCatalog = connectorCatalog;
        this.outputDirFactory = outputDirFactory;
    }

    @Override
    public synchronized SimulationSnapshot start(Path configFile) {
        Path file = resolveProjectFile(configFile);
        for (Map.Entry<Integer, HeadlessSimulation> entry : simulations.entrySet()) {
            if (entry.getValue().isRunning() && entry.getValue().configFile().equals(file)) {
                throw new IllegalStateException("'" + file.getFileName() + "' is already running with id "
                    + entry.getKey());
            }
        }
        JsonNode project = readProject(file);

        int id = nextId;
        HeadlessSimulation simulation = new HeadlessSimulation(
            id, file, project, outputDirFactory.get() + "_sim" + id, connectorCatalog);
        simulation.start();
        nextId++;
        simulations.put(id, simulation);
        return simulation.snapshot();
    }

    @Override
    public synchronized SimulationSnapshot stop(int id) {
        HeadlessSimulation simulation = simulations.get(id);
        if (simulation == null) {
            throw new IllegalArgumentException("There is no simulation with id " + id);
        }
        if (!simulation.isRunning()) {
            throw new IllegalStateException("Simulation " + id + " is already stopped");
        }
        simulation.stop();
        return simulation.snapshot();
    }

    @Override
    public synchronized List<SimulationSnapshot> stopAll() {
        List<SimulationSnapshot> stopped = new ArrayList<>();
        for (HeadlessSimulation simulation : simulations.values()) {
            if (simulation.isRunning()) {
                simulation.stop();
                stopped.add(simulation.snapshot());
            }
        }
        return stopped;
    }

    @Override
    public synchronized List<SimulationSnapshot> list() {
        List<SimulationSnapshot> snapshots = new ArrayList<>();
        for (HeadlessSimulation simulation : simulations.values()) {
            snapshots.add(simulation.snapshot());
        }
        return snapshots;
    }

    @Override
    public synchronized void shutdown() {
        stopAll();
    }

    private static Path resolveProjectFile(Path configFile) {
        if (!Files.isRegularFile(configFile)) {
            throw new IllegalArgumentException("File not found: " + configFile);
        }
        try {
            return configFile.toRealPath();
        } catch (IOException e) {
            throw new IllegalArgumentException("Cannot read " + configFile + ": " + e.getMessage(), e);
        }
    }

    private JsonNode readProject(Path file) {
        try {
            return ProjectFileFormat.read(file, objectMapper);
        } catch (IOException e) {
            throw new IllegalArgumentException("Cannot read " + file + ": " + e.getMessage(), e);
        }
    }
}
