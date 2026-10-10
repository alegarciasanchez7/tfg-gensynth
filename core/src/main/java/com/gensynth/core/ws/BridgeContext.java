package com.gensynth.core.ws;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.api.IPluginInstaller;
import com.gensynth.core.api.ITickClock;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.flow.TemplateEngine;
import com.gensynth.core.model.ProjectSettings;
import com.gensynth.core.model.Variable;
import com.gensynth.core.persistence.StateRepository;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.java_websocket.WebSocket;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Shared context that encapsulates the state and dependencies of the UiBridgeWebSocketServer.
 * Allows CommandHandlers to access and mutate simulation state without direct coupling
 * to the network layers of the server.
 */
public class BridgeContext {
    private final UiBridgeWebSocketServer server;

    public BridgeContext(UiBridgeWebSocketServer server) {
        this.server = server;
    }

    public UiBridgeWebSocketServer getServer() {
        return server;
    }

    public Map<String, GroupRuntime> getGroupsById() {
        return server.groupsById;
    }

    public Map<String, Variable> getVariablesById() {
        return server.variablesById;
    }

    /**
     * @return open connector sessions by flow id (only for flows of running groups)
     */
    public Map<String, com.gensynth.plugin.api.ConnectorSession> getConnectorByFlowId() {
        return server.connectorByFlowId;
    }

    public Set<WebSocket> getMetricSubscribers() {
        return server.metricSubscribers;
    }

    public Object getStateLock() {
        return server.stateLock;
    }

    public ScheduledExecutorService getScheduler() {
        return server.scheduler;
    }

    public TemplateEngine getTemplateEngine() {
        return server.templateEngine;
    }

    public ConnectorCatalogService getConnectorCatalogService() {
        return server.connectorCatalogService;
    }

    public StateRepository getStateRepository() {
        return server.stateRepository;
    }

    public IPluginInstaller getPluginInstaller() {
        return server.pluginInstaller;
    }

    public AtomicLong getTotalMessages() {
        return server.totalMessages;
    }

    /**
     * @return the global message sequence used by the {{n}} template tag
     */
    public AtomicLong getMessageSequence() {
        return server.messageSequence;
    }

    public AtomicLong getTotalErrors() {
        return server.totalErrors;
    }

    public AtomicLong getMessagesLastWindow() {
        return server.messagesLastWindow;
    }

    public AtomicLong getBytesSentLastWindow() {
        return server.bytesSentLastWindow;
    }

    public ObjectMapper getObjectMapper() {
        return server.getObjectMapper();
    }

    public boolean isSystemRunning() {
        return server.systemRunning;
    }

    /**
     * Sets whether the system is running and starts or stops the global tick clock accordingly.
     * Every start/stop/import path goes through here, so the clock runs exactly while the
     * system is running.
     *
     * @param systemRunning true if at least one group is running
     */
    public void setSystemRunning(boolean systemRunning) {
        server.systemRunning = systemRunning;
        if (systemRunning) {
            server.tickClock.start();
        } else {
            server.tickClock.stop();
        }
    }

    /**
     * @return the global simulation tick clock
     */
    public ITickClock getTickClock() {
        return server.tickClock;
    }

    /**
     * @return the last measured tick rate (ticks per second)
     */
    public double getTicksPerSecond() {
        return server.ticksPerSecond;
    }

    /**
     * @param ticksPerSecond the measured tick rate (ticks per second)
     */
    public void setTicksPerSecond(double ticksPerSecond) {
        server.ticksPerSecond = ticksPerSecond;
    }

    /**
     * Returns the current project settings. The tick clock is the single source of truth.
     *
     * @return the current project settings
     */
    public ProjectSettings getProjectSettings() {
        return new ProjectSettings(server.tickClock.getSettings());
    }

    /**
     * Applies project settings to the runtime (reschedules the tick clock live if running).
     *
     * @param settings the settings to apply
     */
    public void applyProjectSettings(ProjectSettings settings) {
        server.tickClock.applySettings(settings.getTick());
    }

    public long getSystemStartedAt() {
        return server.systemStartedAt;
    }

    public void setSystemStartedAt(long systemStartedAt) {
        server.systemStartedAt = systemStartedAt;
    }

    public String getCurrentOutputDir() {
        return server.currentOutputDir;
    }

    public void setCurrentOutputDir(String currentOutputDir) {
        server.currentOutputDir = currentOutputDir;
    }

    public double getMessagesPerSecond() {
        return server.messagesPerSecond;
    }

    public void setMessagesPerSecond(double messagesPerSecond) {
        server.messagesPerSecond = messagesPerSecond;
    }

    public double getNetworkUpPerSecond() {
        return server.networkUpPerSecond;
    }

    public void setNetworkUpPerSecond(double networkUpPerSecond) {
        server.networkUpPerSecond = networkUpPerSecond;
    }

    public WebSocket getDesktopSocket() {
        return server.getDesktopSocket();
    }
}
