package com.gensynth.core.ws;

import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.model.Variable;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
import com.gensynth.core.persistence.StateRepository;
import com.gensynth.core.ws.handler.StateCommandHandler;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;

import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import static com.gensynth.core.TestWaits.eventually;
import static org.junit.Assert.assertEquals;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * UPDATE_VARIABLE schedules one write of the state for several edits in a row (issue #37),
 * and nothing that is scheduled is lost: a full write, a reload of the state and the shutdown
 * write it first.
 */
public class StatePersistenceSchedulingTest {

    /** Longer than the delay of a scheduled write, to check that no second write follows. */
    private static final Duration AFTER_DELAY = Duration.ofMillis(StateCommandHandler.PERSIST_DELAY_MILLIS * 3);

    private StateRepository repository;
    private UiBridgeWebSocketServer server;

    @Before
    public void setUp() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-persist-schedule-");
        repository = spy(new JsonStateRepositoryImpl(tempDir.toString()));
        server = new UiBridgeWebSocketServer(new InetSocketAddress("localhost", 0),
                new ConnectorCatalogService(), repository, new PluginInstallerImpl(tempDir));
        server.onMessage(null, command("CREATE_VARIABLE", "cmd-create",
                "\"variableId\":\"v1\",\"name\":\"speed\",\"type\":\"numeric\",\"scope\":\"global\","
                        + "\"config\":{\"min\":0,\"max\":10}"));
        clearInvocations(repository);
    }

    @After
    public void tearDown() {
        server.shutdown();
    }

    @Test
    public void editsInARowAreWrittenOnceAfterTheDelay() throws Exception {
        updateName("speed_a", 1);
        updateName("speed_b", 2);
        updateName("speed_c", 3);

        verify(repository, never()).saveVariables(anyList());

        eventually().untilAsserted(() -> verify(repository, times(1)).saveVariables(anyList()));
        // The write read the state when it ran: it has the last edit
        assertEquals("speed_c", savedVariableName());
        eventually().during(AFTER_DELAY).untilAsserted(() -> verify(repository, times(1)).saveVariables(anyList()));
    }

    @Test
    public void flushWritesThePendingEditsNowAndOnlyOnce() throws Exception {
        updateName("speed_flushed", 1);

        server.stateCommandHandler.flushPendingState();

        verify(repository, times(1)).saveVariables(anyList());
        assertEquals("speed_flushed", savedVariableName());
        eventually().during(AFTER_DELAY).untilAsserted(() -> verify(repository, times(1)).saveVariables(anyList()));
    }

    @Test
    public void flushWithoutPendingEditsWritesNothing() throws Exception {
        server.stateCommandHandler.flushPendingState();

        verify(repository, never()).saveVariables(anyList());
    }

    @Test
    public void aFullWriteCancelsTheScheduledOne() throws Exception {
        updateName("speed_then_created", 1);

        // CREATE_VARIABLE writes the whole state right away, the pending edit included
        server.onMessage(null, command("CREATE_VARIABLE", "cmd-create-2",
                "\"variableId\":\"v2\",\"name\":\"other\",\"type\":\"numeric\",\"scope\":\"global\","
                        + "\"config\":{\"min\":0,\"max\":1}"));

        verify(repository, times(1)).saveVariables(anyList());
        eventually().during(AFTER_DELAY).untilAsserted(() -> verify(repository, times(1)).saveVariables(anyList()));
    }

    @Test
    public void reloadingTheStateKeepsTheEditNotWrittenYet() throws Exception {
        updateName("speed_before_reload", 1);

        server.onMessage(null, command("LOAD_STATE", "cmd-load", ""));

        // The first write, before reading the repository back, is the scheduled one
        assertEquals("speed_before_reload", savedVariableName(0));
        assertEquals("speed_before_reload", server.variablesById.get("v1").getName());
    }

    @Test
    public void shutdownWritesThePendingEdits() throws Exception {
        updateName("speed_at_exit", 1);

        server.shutdown();

        verify(repository, atLeastOnce()).saveVariables(anyList());
        assertEquals("speed_at_exit", savedVariableName());
    }

    private void updateName(String name, int edit) {
        server.onMessage(null, command("UPDATE_VARIABLE", "cmd-update-" + edit,
                "\"variableId\":\"v1\",\"name\":\"" + name + "\",\"type\":\"numeric\",\"scope\":\"global\","
                        + "\"config\":{\"min\":0,\"max\":" + (10 + edit) + "}"));
    }

    /** The name of the variable in the last list of variables written to the repository. */
    private String savedVariableName() throws Exception {
        return savedVariableName(-1);
    }

    /**
     * @param write which write: 0 the first one, -1 the last one
     * @return the name of the variable in that list of variables written to the repository
     */
    private String savedVariableName(int write) throws Exception {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Variable>> saved = ArgumentCaptor.forClass(List.class);
        verify(repository, atLeastOnce()).saveVariables(saved.capture());
        List<List<Variable>> writes = saved.getAllValues();
        List<Variable> written = writes.get(write < 0 ? writes.size() - 1 : write);
        return written.stream().filter(v -> "v1".equals(v.getId())).findFirst().orElseThrow().getName();
    }

    private static String command(String type, String commandId, String payloadFields) {
        return "{\"type\":\"" + type + "\",\"commandId\":\"" + commandId
                + "\",\"protocolVersion\":\"1.0.0\",\"payload\":{" + payloadFields + "}}";
    }
}
