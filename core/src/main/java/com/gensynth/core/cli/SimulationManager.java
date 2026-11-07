package com.gensynth.core.cli;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.api.ISimulationManager;
import com.gensynth.core.config.AppPaths;
import com.gensynth.core.config.DevicePreferences;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.model.ProjectReport;
import com.gensynth.core.model.SimulationSnapshot;
import com.gensynth.core.model.TickSettings;
import com.gensynth.core.persistence.ProjectFileFormat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Keeps the simulations of one command line session. Each project file gets an id the first time
 * it starts (1, 2, 3... in that order) and keeps it for the whole session: starting it again
 * after it stopped is a new run with the same id, its counters back at zero. A failed start does
 * not use an id, and a project file can only run once at a time.
 */
public class SimulationManager implements ISimulationManager {

    /**
     * Opens the output folder of a new simulation.
     */
    @FunctionalInterface
    public interface OutputFolders {

        /**
         * @param warnings receives what the user should know about the folder (for example, that
         *                 the chosen one cannot be written and the default one is used instead)
         * @return base path of the session folder; the simulation id is appended to it
         */
        String newSession(Consumer<String> warnings);
    }

    private final ConnectorCatalogService connectorCatalog;
    private final OutputFolders outputFolders;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private final Map<Integer, HeadlessSimulation> simulations = new LinkedHashMap<>();
    private int nextId = 1;

    /**
     * Uses the installed connector plugins and the output folder chosen in the desktop
     * application (Settings → Save &amp; Storage), or the default one of {@link AppPaths}.
     */
    public SimulationManager() {
        this(new ConnectorCatalogService(AppPaths.current().pluginsDir(), AppPaths.current().sharedLibsDir()),
             preferredOutputFolders(AppPaths.current().stateDir().resolve(DevicePreferences.FILE_NAME),
                 AppPaths.current().outputsHome()));
    }

    /**
     * @param connectorCatalog connector catalog shared by every simulation (plugins load once)
     * @param outputDirFactory builds the base output folder of a new session; the simulation id
     *                         is appended so two simulations never share a folder
     */
    public SimulationManager(ConnectorCatalogService connectorCatalog, Supplier<String> outputDirFactory) {
        this(connectorCatalog, warnings -> outputDirFactory.get());
    }

    /**
     * @param connectorCatalog connector catalog shared by every simulation (plugins load once)
     * @param outputFolders    opens the output folder of each new simulation
     */
    public SimulationManager(ConnectorCatalogService connectorCatalog, OutputFolders outputFolders) {
        this.connectorCatalog = connectorCatalog;
        this.outputFolders = outputFolders;
    }

    /**
     * Output folders in the folder chosen in the desktop application, as its own sessions do.
     * The preferences file is read on every start, so a folder changed in the desktop
     * application applies without reopening the command line.
     *
     * @param preferencesFile the preferences file of the desktop application
     * @param defaultFolder   folder used when none was chosen or the chosen one cannot be written
     * @return the output folders
     */
    static OutputFolders preferredOutputFolders(Path preferencesFile, Path defaultFolder) {
        return warnings -> AppPaths.newSessionOutputDir(
            new DevicePreferences(preferencesFile).sessionsFolder(defaultFolder, warnings));
    }

    @Override
    public synchronized SimulationSnapshot start(Path configFile) {
        Path file = resolveProjectFile(configFile);
        Integer knownId = null;
        for (Map.Entry<Integer, HeadlessSimulation> entry : simulations.entrySet()) {
            if (entry.getValue().configFile().equals(file)) {
                if (entry.getValue().isRunning()) {
                    throw new IllegalStateException("'" + file.getFileName() + "' is already running with id "
                        + entry.getKey());
                }
                knownId = entry.getKey();
            }
        }
        JsonNode project = readProject(file);

        // A file started before keeps its id; a new one gets the next free id
        int id = knownId != null ? knownId : nextId;
        List<String> warnings = new ArrayList<>();
        String outputDir = outputFolders.newSession(warnings::add) + "_sim" + id;
        HeadlessSimulation simulation = new HeadlessSimulation(
            id, file, project, outputDir, warnings, connectorCatalog);
        simulation.start();
        if (knownId == null) {
            nextId++;
        }
        // Replacing the entry keeps its place in the list
        simulations.put(id, simulation);
        return simulation.snapshot();
    }

    @Override
    public ProjectReport inspect(Path configFile) {
        Path file = resolveProjectFile(configFile);
        JsonNode project = readProject(file);
        Map<String, String> connectors = new HashMap<>();
        for (JsonNode group : project.path("groups")) {
            for (JsonNode flow : group.path("flows")) {
                // Same default as FlowDefinition.fromPayload
                String technology = flow.path("technology").asText("rabbitmq");
                connectorCatalog.findLatestConnector(technology).ifPresent(descriptor ->
                    connectors.put(technology, descriptor.getDisplayName() + " " + descriptor.getPluginVersion()));
            }
        }
        return new ProjectReport(file, project, HeadlessSimulation.check(project, connectorCatalog), connectors);
    }

    @Override
    public synchronized SimulationSnapshot stop(int id) {
        HeadlessSimulation simulation = running(id);
        simulation.stop();
        return simulation.snapshot();
    }

    @Override
    public synchronized SimulationSnapshot changeTick(int id, TickSettings tick) {
        HeadlessSimulation simulation = running(id);
        simulation.changeTick(tick);
        return simulation.snapshot();
    }

    private HeadlessSimulation running(int id) {
        HeadlessSimulation simulation = simulations.get(id);
        if (simulation == null) {
            throw new IllegalArgumentException("There is no simulation with id " + id);
        }
        if (!simulation.isRunning()) {
            throw new IllegalStateException("Simulation " + id + " is already stopped");
        }
        return simulation;
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

    /**
     * Reads a project file, with the same checks and messages as {@link #start}.
     *
     * @param configFile the {@code .gsynth} project file
     * @return the parsed and validated project
     * @throws IllegalArgumentException if the file does not exist or is not a valid project
     */
    static JsonNode readProjectFile(Path configFile) {
        return readProject(resolveProjectFile(configFile));
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

    private static JsonNode readProject(Path file) {
        try {
            return ProjectFileFormat.read(file, OBJECT_MAPPER);
        } catch (IOException e) {
            throw new IllegalArgumentException("Cannot read " + file + ": " + e.getMessage(), e);
        }
    }
}
