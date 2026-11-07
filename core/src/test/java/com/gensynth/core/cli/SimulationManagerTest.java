package com.gensynth.core.cli;

import com.gensynth.core.config.DevicePreferences;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.model.ProjectReport;
import com.gensynth.core.model.SimulationSnapshot;
import com.gensynth.core.model.StartProblem;
import com.gensynth.core.model.TickSettings;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
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
    public void aFileKeepsItsIdAndStartsAgainFromZero() throws Exception {
        Path a = project("a.gsynth");
        manager.start(a);
        manager.start(project("b.gsynth"));
        waitForMessages(1, 5);

        SimulationSnapshot stopped = manager.stop(1);
        assertEquals(SimulationSnapshot.Status.STOPPED, stopped.status());
        assertEquals("a stopped simulation keeps its id", List.of(1, 2),
            manager.list().stream().map(SimulationSnapshot::id).toList());

        // The same file starts again with the same id, as a new run with its counters at zero
        SimulationSnapshot again = manager.start(a);
        assertEquals(1, again.id());
        assertTrue("messages: " + again.messagesSent(), again.messagesSent() < stopped.messagesSent());
        assertEquals(outputs.resolve("OUTPUT") + "_sim1", again.outputDir());

        List<SimulationSnapshot> all = manager.list();
        assertEquals(List.of(1, 2), all.stream().map(SimulationSnapshot::id).toList());
        assertTrue(all.stream().allMatch(s -> s.status() == SimulationSnapshot.Status.RUNNING));
        // A new file gets the next id
        assertEquals(3, manager.start(project("c.gsynth")).id());
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
        // The rate of the last second is measured by the background tasks of the engine
        long deadline = System.currentTimeMillis() + 5000;
        while (manager.list().get(0).messagesPerSecond() <= 0 && System.currentTimeMillis() < deadline) {
            Thread.sleep(50);
        }
        assertTrue(manager.list().get(0).messagesPerSecond() > 0);
        assertTrue(manager.list().get(0).ticksPerSecond() > 0);
        SimulationSnapshot stopped = manager.stop(1);
        assertEquals(0, stopped.messagesPerSecond(), 0);
        assertTrue("messages counted: " + stopped.messagesSent(), stopped.messagesSent() >= 5);
        assertEquals(0, stopped.errors());
        assertTrue(stopped.connectorProblems().isEmpty());

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
        // Found before starting, and not reported again when its session fails to open
        assertEquals(1, started.connectorProblems().size());
        StartProblem problem = started.connectorProblems().get(0);
        assertEquals(StartProblem.Kind.CONNECTOR_NOT_INSTALLED, problem.kind());
        assertEquals("Sensors", problem.group());
        assertEquals("Temperature", problem.flow());
        assertTrue(problem.message(), problem.message().contains("'nope' is not installed"));
    }

    @Test
    public void aProjectThatCannotStartListsEveryReasonAndUsesNoId() throws Exception {
        Path broken = TestProjects.brokenProject(temp.getRoot().toPath().resolve("broken.gsynth"));

        ProjectStartException error = assertThrows(ProjectStartException.class, () -> manager.start(broken));

        assertEquals("broken.gsynth", error.getFileName());
        List<StartProblem> problems = error.getProblems();
        assertEquals(2, problems.size());
        StartProblem cycle = problems.get(0);
        assertEquals(StartProblem.Kind.CYCLE, cycle.kind());
        assertEquals("Sensors", cycle.group());
        assertTrue(cycle.cycle().toString(), cycle.cycle().containsAll(List.of("a", "b")));
        StartProblem invalid = problems.get(1);
        assertEquals(StartProblem.Kind.INVALID_VARIABLE, invalid.kind());
        assertEquals("Alarms", invalid.group());
        assertTrue(invalid.message(), invalid.message().contains("'threshold'"));
        assertTrue(invalid.message(), invalid.message().contains("min must be <= max"));

        assertTrue(manager.list().isEmpty());
        assertEquals(1, manager.start(project("ok.gsynth")).id());
    }

    @Test
    public void inspectChecksAProjectWithoutStartingIt() throws Exception {
        Path broken = TestProjects.brokenProject(temp.getRoot().toPath().resolve("broken.gsynth"));

        ProjectReport report = manager.inspect(broken);

        assertEquals("broken.gsynth", report.file().getFileName().toString());
        assertEquals(List.of(StartProblem.Kind.CYCLE, StartProblem.Kind.CONNECTOR_NOT_INSTALLED,
            StartProblem.Kind.INVALID_VARIABLE), report.problems().stream().map(StartProblem::kind).toList());
        assertEquals("File Output 1.0.0", report.connectors().get("file"));
        assertTrue("nope is not installed", report.connectors().get("nope") == null);
        assertTrue("nothing is started", manager.list().isEmpty());
        assertThrows(IllegalArgumentException.class, () -> manager.inspect(temp.getRoot().toPath().resolve("missing.gsynth")));
    }

    @Test
    public void changeTickAppliesLiveWithoutRestarting() throws Exception {
        manager.start(project("a.gsynth"));
        TickSettings slower = new TickSettings(TickSettings.Mode.FIXED_RATE, 200, TickSettings.Unit.MILLISECONDS);

        SimulationSnapshot changed = manager.changeTick(1, slower);

        assertEquals(slower.describe(), changed.tick().describe());
        assertEquals(SimulationSnapshot.Status.RUNNING, changed.status());
        // 20 ms (50 ticks/s) -> 200 ms (5 ticks/s), measured over the last second
        long deadline = System.currentTimeMillis() + 5000;
        while (manager.list().get(0).ticksPerSecond() > 8 && System.currentTimeMillis() < deadline) {
            Thread.sleep(100);
        }
        assertTrue("ticks/s: " + manager.list().get(0).ticksPerSecond(), manager.list().get(0).ticksPerSecond() <= 8);

        assertThrows(IllegalArgumentException.class, () -> manager.changeTick(9, slower));
        manager.stop(1);
        assertThrows(IllegalStateException.class, () -> manager.changeTick(1, slower));
    }

    @Test
    public void outputFoldersFollowTheFolderChosenInTheDesktopApplication() throws Exception {
        Path stateDir = temp.newFolder("state").toPath();
        Path defaultFolder = temp.newFolder("default").toPath();
        Path chosen = temp.getRoot().toPath().resolve("chosen");
        SimulationManager.OutputFolders folders = SimulationManager.preferredOutputFolders(
            stateDir.resolve(DevicePreferences.FILE_NAME), defaultFolder);
        List<String> warnings = new ArrayList<>();

        assertEquals(defaultFolder.toAbsolutePath(), Paths.get(folders.newSession(warnings::add)).getParent());

        // Chosen in the desktop application while the command line is open: the next start uses it
        DevicePreferences.inFolder(stateDir.toString()).setOutputFolder(chosen);
        assertEquals(chosen.toAbsolutePath(), Paths.get(folders.newSession(warnings::add)).getParent());
        assertTrue(warnings.isEmpty());

        Path file = Files.writeString(temp.getRoot().toPath().resolve("a-file.txt"), "x");
        DevicePreferences.inFolder(stateDir.toString()).setOutputFolder(file.resolve("results"));
        assertEquals(defaultFolder.toAbsolutePath(), Paths.get(folders.newSession(warnings::add)).getParent());
        assertEquals(1, warnings.size());
    }

    @Test
    public void outputWarningsAreReportedWhenTheSimulationStarts() throws Exception {
        Path base = outputs.resolve("OUTPUT");
        SimulationManager withWarning = new SimulationManager(new ConnectorCatalogService(), warnings -> {
            warnings.accept("The chosen folder cannot be written");
            return base.toString();
        });
        try {
            SimulationSnapshot started = withWarning.start(project("a.gsynth"));

            assertEquals(List.of("The chosen folder cannot be written"), started.warnings());
            assertEquals(base + "_sim1", started.outputDir());
        } finally {
            withWarning.shutdown();
        }
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
