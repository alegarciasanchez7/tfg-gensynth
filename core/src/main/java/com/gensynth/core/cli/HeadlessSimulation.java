package com.gensynth.core.cli;

import com.fasterxml.jackson.databind.JsonNode;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.model.SimulationSnapshot;
import com.gensynth.core.model.StartProblem;
import com.gensynth.core.model.TickSettings;
import com.gensynth.core.persistence.NoOpStateRepository;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * One project running headlessly: a private engine that never opens a network port and never
 * touches the desktop autosave, so several simulations can run side by side.
 */
class HeadlessSimulation {

    private static final Logger logger = LoggerFactory.getLogger(HeadlessSimulation.class);

    private final int id;
    private final Path configFile;
    private final String outputDir;
    private final int groups;
    private final int flows;
    private final UiBridgeWebSocketServer engine;

    private final List<String> warnings;
    private List<StartProblem> connectorProblems = List.of();
    private long startedAt;
    private long stoppedAt;
    private boolean running;

    /**
     * @param id               session id
     * @param configFile       the project file (already resolved to its real path)
     * @param project          the parsed and validated project document
     * @param outputDir        folder of the session output files
     * @param warnings         what the user should know about the start (e.g. the output folder used)
     * @param connectorCatalog connector catalog shared by every simulation
     */
    HeadlessSimulation(int id, Path configFile, JsonNode project, String outputDir, List<String> warnings,
                       ConnectorCatalogService connectorCatalog) {
        this.id = id;
        this.configFile = configFile;
        this.outputDir = outputDir;
        this.warnings = List.copyOf(warnings);
        this.groups = project.path("groups").size();
        int flowCount = 0;
        for (JsonNode group : project.path("groups")) {
            flowCount += group.path("flows").size();
        }
        this.flows = flowCount;
        this.engine = loadEngine(project, connectorCatalog);
    }

    /**
     * Checks a project without running it: it is loaded in a temporary engine that is released
     * at once, so nothing starts and no connection is opened.
     *
     * @param project          the parsed and validated project document
     * @param connectorCatalog connector catalog shared by every simulation
     * @return what would stop the project from starting or leave a flow without sending
     * @throws IllegalArgumentException if the project cannot be loaded
     */
    static List<StartProblem> check(JsonNode project, ConnectorCatalogService connectorCatalog) {
        UiBridgeWebSocketServer engine = loadEngine(project, connectorCatalog);
        try {
            return engine.systemCommandHandler.checkProject();
        } finally {
            engine.shutdown();
        }
    }

    private static UiBridgeWebSocketServer loadEngine(JsonNode project, ConnectorCatalogService connectorCatalog) {
        UiBridgeWebSocketServer engine = UiBridgeWebSocketServer.createHeadless(connectorCatalog, new NoOpStateRepository());
        try {
            engine.stateCommandHandler.importProject(project, false);
        } catch (RuntimeException e) {
            engine.shutdown();
            throw new IllegalArgumentException("Invalid project file: " + e.getMessage(), e);
        }
        return engine;
    }

    /**
     * Starts every group of the project. On failure nothing is left running.
     * <p>
     * The project is checked first, so a failure lists every reason found (one per group) and
     * not only the first one. Connector problems do not stop the start: those flows just do not
     * send, as in the desktop application.
     *
     * @throws ProjectStartException if the project cannot start (e.g. cyclic variable references)
     * @throws IllegalStateException if it fails for another reason while starting
     */
    void start() {
        List<StartProblem> problems = engine.systemCommandHandler.checkProject();
        List<StartProblem> blocking = problems.stream().filter(StartProblem::blocking).toList();
        if (!blocking.isEmpty()) {
            engine.shutdown();
            throw new ProjectStartException(String.valueOf(configFile.getFileName()), blocking);
        }
        try {
            engine.systemCommandHandler.startSystemInternal(() -> outputDir);
        } catch (RuntimeException e) {
            engine.shutdown();
            throw new IllegalStateException(e.getMessage(), e);
        }
        // Captured now: stopping a group clears the connector errors of its flows
        connectorProblems = merge(problems, engine.getConnectorErrors());
        engine.startBackgroundTasks();
        startedAt = System.currentTimeMillis();
        running = true;
        logger.info("[CLI] Simulation {} started from {} (output: {})", id, configFile, outputDir);
        warnings.forEach(warning -> logger.warn("[CLI] Simulation {}: {}", id, warning));
    }

    /**
     * The problems found before starting explain a connector better than the error of the failed
     * session (e.g. "not installed" instead of "No connector found"); the failures that only
     * show when connecting (a broker that is down) are added.
     */
    private static List<StartProblem> merge(List<StartProblem> checked, List<StartProblem> failed) {
        List<StartProblem> merged = new ArrayList<>(checked);
        for (StartProblem failure : failed) {
            boolean known = checked.stream().anyMatch(p ->
                Objects.equals(p.group(), failure.group()) && Objects.equals(p.flow(), failure.flow()));
            if (!known) {
                merged.add(failure);
            }
        }
        return merged;
    }

    /**
     * Changes the tick of the running engine; the groups keep running.
     *
     * @param tick the new tick settings
     */
    void changeTick(TickSettings tick) {
        engine.settingsCommandHandler.applyTick(tick);
        logger.info("[CLI] Simulation {} tick set to {}", id, tick.describe());
    }

    /**
     * Stops every group, closes the connectors and releases the engine.
     */
    void stop() {
        engine.systemCommandHandler.stopSystemInternal();
        engine.shutdown();
        stoppedAt = System.currentTimeMillis();
        running = false;
        logger.info("[CLI] Simulation {} stopped ({} messages, {} errors)", id,
            engine.getTotalMessages(), engine.getTotalErrors());
    }

    boolean isRunning() {
        return running;
    }

    Path configFile() {
        return configFile;
    }

    SimulationSnapshot snapshot() {
        // The rates keep their last value once the engine is shut down
        return new SimulationSnapshot(
            id,
            configFile,
            outputDir,
            running ? SimulationSnapshot.Status.RUNNING : SimulationSnapshot.Status.STOPPED,
            groups,
            flows,
            startedAt,
            stoppedAt,
            engine.getTotalMessages(),
            engine.getTotalErrors(),
            connectorProblems,
            warnings,
            running ? engine.getMessagesPerSecond() : 0,
            running ? engine.getTicksPerSecond() : 0,
            running ? engine.getNetworkUpPerSecond() : 0,
            engine.getTickSettings()
        );
    }
}
