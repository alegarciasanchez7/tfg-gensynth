package com.gensynth.core.ws;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.api.IPluginInstaller;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.flow.TemplateEngine;
import com.gensynth.core.model.Variable;
import com.gensynth.core.persistence.StateRepository;
import com.gensynth.core.ws.runtime.GroupRuntime;
import org.java_websocket.WebSocket;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
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

    public Map<String, com.gensynth.core.connectors.spi.ConnectorPlugin> getConnectorByFlowId() {
        return server.connectorByFlowId;
    }

    public Map<String, ScheduledFuture<?>> getPublisherTasksByFlowId() {
        return server.publisherTasksByFlowId;
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

    public void setSystemRunning(boolean systemRunning) {
        server.systemRunning = systemRunning;
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
