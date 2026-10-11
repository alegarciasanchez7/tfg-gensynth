package com.gensynth.core.cli;

import com.fasterxml.jackson.databind.JsonNode;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.model.SimulationSnapshot;
import com.gensynth.core.persistence.NoOpStateRepository;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.util.List;

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

    private List<String> connectorErrors = List.of();
    private long startedAt;
    private long stoppedAt;
    private boolean running;

    /**
     * @param id               session id
     * @param configFile       the project file (already resolved to its real path)
     * @param project          the parsed and validated project document
     * @param outputDir        folder of the session output files
     * @param connectorCatalog connector catalog shared by every simulation
     */
    HeadlessSimulation(int id, Path configFile, JsonNode project, String outputDir,
                       ConnectorCatalogService connectorCatalog) {
        this.id = id;
        this.configFile = configFile;
        this.outputDir = outputDir;
        this.groups = project.path("groups").size();
        int flowCount = 0;
        for (JsonNode group : project.path("groups")) {
            flowCount += group.path("flows").size();
        }
        this.flows = flowCount;
        this.engine = UiBridgeWebSocketServer.createHeadless(connectorCatalog, new NoOpStateRepository());
        try {
            engine.stateCommandHandler.importProject(project, false);
        } catch (RuntimeException e) {
            engine.shutdown();
            throw new IllegalArgumentException("Invalid project file: " + e.getMessage(), e);
        }
    }

    /**
     * Starts every group of the project. On failure nothing is left running.
     *
     * @throws IllegalStateException if a group cannot start (e.g. cyclic variable references)
     */
    void start() {
        try {
            engine.systemCommandHandler.startSystemInternal(outputDir);
        } catch (RuntimeException e) {
            engine.shutdown();
            throw new IllegalStateException(e.getMessage(), e);
        }
        // Captured now: stopping a group clears the connector errors of its flows
        connectorErrors = engine.getConnectorErrors();
        engine.startBackgroundTasks();
        startedAt = System.currentTimeMillis();
        running = true;
        logger.info("[CLI] Simulation {} started from {} (output: {})", id, configFile, outputDir);
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
            connectorErrors,
            running ? engine.getMessagesPerSecond() : 0,
            running ? engine.getTicksPerSecond() : 0,
            running ? engine.getNetworkUpPerSecond() : 0
        );
    }
}
