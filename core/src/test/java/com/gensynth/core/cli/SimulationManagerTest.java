package com.gensynth.core.cli;

import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.model.SimulationSnapshot;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import static org.junit.Assert.*;

public class SimulationManagerTest {

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    private Path outputs;
    private SimulationManager manager;

    @Before
    public void setUp() throws Exception {
        outputs = temp.newFolder("outputs").toPath();
        manager = new SimulationManager(new ConnectorCatalogService(), () -> outputs.resolve("OUTPUT").toString());
    }

    @After
    public void tearDown() {
        manager.shutdown();
    }

    private Path project(String name) throws Exception {
        return TestProjects.fileProject(temp.getRoot().toPath().resolve(name));
    }

    @Test
    public void idsFollowTheStartOrderFromOne() throws Exception {
        assertEquals(1, manager.start(project("a.gsynth")).id());
        assertEquals(2, manager.start(project("b.gsynth")).id());
        assertEquals(3, manager.start(project("c.gsynth")).id());
    }

    @Test
    public void stoppedSimulationKeepsItsIdAndIdsAreNotReused() throws Exception {
        Path a = project("a.gsynth");
        manager.start(a);
        manager.start(project("b.gsynth"));

        SimulationSnapshot stopped = manager.stop(1);
        assertEquals(SimulationSnapshot.Status.STOPPED, stopped.status());

        // The same file can run again once stopped, with a new id
        assertEquals(3, manager.start(a).id());

        List<SimulationSnapshot> all = manager.list();
        assertEquals(List.of(1, 2, 3), all.stream().map(SimulationSnapshot::id).toList());
        assertEquals(SimulationSnapshot.Status.STOPPED, all.get(0).status());
        assertEquals(SimulationSnapshot.Status.RUNNING, all.get(1).status());
        assertEquals(SimulationSnapshot.Status.RUNNING, all.get(2).status());
    }

    @Test
    public void invalidFilesDoNotUseAnId() throws Exception {
        Path missing = temp.getRoot().toPath().resolve("missing.gsynth");
        assertThrows(IllegalArgumentException.class, () -> manager.start(missing));

        Path wrongExtension = Files.writeString(temp.getRoot().toPath().resolve("project.json"), "{}");
        assertThrows(IllegalArgumentException.class, () -> manager.start(wrongExtension));

        Path notAProject = Files.writeString(temp.getRoot().toPath().resolve("other.gsynth"), "{\"hello\":1}");
        assertThrows(IllegalArgumentException.class, () -> manager.start(notAProject));

        Path cannotStart = TestProjects.invalidStartProject(temp.getRoot().toPath().resolve("broken.gsynth"));
        IllegalStateException error = assertThrows(IllegalStateException.class, () -> manager.start(cannotStart));
        assertTrue(error.getMessage(), error.getMessage().contains("FIXED_SUBSET"));

        assertTrue(manager.list().isEmpty());
        assertEquals(1, manager.start(project("ok.gsynth")).id());
    }

    @Test
    public void sameFileCannotRunTwiceAtOnce() throws Exception {
        Path a = project("a.gsynth");
        manager.start(a);

        // Also through a different spelling of the same path
        Path sameFile = a.getParent().resolve(".").resolve("a.gsynth");
        IllegalStateException error = assertThrows(IllegalStateException.class, () -> manager.start(sameFile));
        assertTrue(error.getMessage(), error.getMessage().contains("already running with id 1"));
        assertEquals(1, manager.list().size());
    }

    @Test
    public void stopRejectsUnknownAndStoppedIds() throws Exception {
        manager.start(project("a.gsynth"));
        assertThrows(IllegalArgumentException.class, () -> manager.stop(7));

        manager.stop(1);
        IllegalStateException error = assertThrows(IllegalStateException.class, () -> manager.stop(1));
        assertTrue(error.getMessage(), error.getMessage().contains("already stopped"));
    }

    @Test
    public void simulationsWriteToTheirOwnOutputFolderUntilStopped() throws Exception {
        manager.start(project("a.gsynth"));
        manager.start(project("b.gsynth"));
        Path fileOfFirst = outputs.resolve("OUTPUT_sim1").resolve("Sensors").resolve("Temperature.txt");
        Path fileOfSecond = outputs.resolve("OUTPUT_sim2").resolve("Sensors").resolve("Temperature.txt");

        waitForMessages(1, 5);
        waitForMessages(2, 5);
        SimulationSnapshot stopped = manager.stop(1);
        assertTrue("messages counted: " + stopped.messagesSent(), stopped.messagesSent() >= 5);
        assertEquals(0, stopped.errors());
        assertTrue(stopped.connectorErrors().isEmpty());

        assertTrue(Files.exists(fileOfFirst));
        assertTrue(Files.exists(fileOfSecond));
        long linesAfterStop = lines(fileOfFirst);
        assertTrue(linesAfterStop >= 5);

        // A stopped simulation sends nothing more, while the other one keeps going
        long secondBefore = manager.list().get(1).messagesSent();
        Thread.sleep(200);
        assertEquals(stopped.messagesSent(), manager.list().get(0).messagesSent());
        assertEquals(linesAfterStop, lines(fileOfFirst));
        assertTrue(manager.list().get(1).messagesSent() > secondBefore);
    }

    @Test
    public void connectorFailuresAreReportedWithoutStoppingTheStart() throws Exception {
        Path project = TestProjects.fileProject(temp.getRoot().toPath().resolve("unknown.gsynth"));
        Files.writeString(project, Files.readString(project).replace("\"technology\": \"file\"", "\"technology\": \"nope\""));

        SimulationSnapshot started = manager.start(project);
        assertEquals(SimulationSnapshot.Status.RUNNING, started.status());
        assertEquals(1, started.connectorErrors().size());
        assertTrue(started.connectorErrors().get(0), started.connectorErrors().get(0).startsWith("Sensors / Temperature: "));
    }

    @Test
    public void stopAllAndShutdownStopEveryRunningSimulation() throws Exception {
        manager.start(project("a.gsynth"));
        manager.start(project("b.gsynth"));
        manager.stop(1);

        List<SimulationSnapshot> stopped = manager.stopAll();
        assertEquals(List.of(2), stopped.stream().map(SimulationSnapshot::id).toList());
        assertTrue(manager.stopAll().isEmpty());

        manager.start(project("c.gsynth"));
        manager.shutdown();
        manager.shutdown();
        assertTrue(manager.list().stream().allMatch(s -> s.status() == SimulationSnapshot.Status.STOPPED));
    }

    private void waitForMessages(int id, long minMessages) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5000;
        while (manager.list().get(id - 1).messagesSent() < minMessages && System.currentTimeMillis() < deadline) {
            Thread.sleep(10);
        }
    }

    private static long lines(Path file) throws Exception {
        try (Stream<String> lines = Files.lines(file)) {
            return lines.count();
        }
    }
}
