package com.gensynth.core.cli;

import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;

import static org.junit.Assert.*;

public class CliShellTest {

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    private Path workingDir;
    private Path home;
    private SimulationManager manager;

    @Before
    public void setUp() throws Exception {
        workingDir = temp.newFolder("work").toPath();
        home = temp.newFolder("home").toPath();
        Path outputs = temp.newFolder("outputs").toPath();
        manager = new SimulationManager(new ConnectorCatalogService(), () -> outputs.resolve("OUTPUT").toString());
    }

    @After
    public void tearDown() {
        manager.shutdown();
    }

    private String run(String input) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        PrintStream out = new PrintStream(bytes, true, StandardCharsets.UTF_8);
        new CliShell(manager, new BufferedReader(new StringReader(input)), out, workingDir, home, "9.9.9").run();
        return bytes.toString(StandardCharsets.UTF_8);
    }

    @Test
    public void startListStopAndExit() throws Exception {
        TestProjects.fileProject(workingDir.resolve("a.gsynth"));
        TestProjects.fileProject(workingDir.resolve("b.gsynth"));

        String output = run("""
            start a.gsynth
            start b.gsynth
            start a.gsynth
            list
            stop 1
            start a.gsynth
            stop all
            exit
            """);

        assertTrue(output, output.startsWith("GenSynth 9.9.9 command line."));
        assertTrue(output, output.contains("[1] Started 'a.gsynth' (1 groups, 1 flows)"));
        assertTrue(output, output.contains("[2] Started 'b.gsynth' (1 groups, 1 flows)"));
        assertTrue(output, output.contains("Error: 'a.gsynth' is already running with id 1"));
        assertTrue(output, output.contains("ID   STATUS   UPTIME"));
        assertTrue(output, output.contains("[1] Stopped 'a.gsynth' after "));
        assertTrue(output, output.contains("[3] Started 'a.gsynth'"));
        assertTrue(output, output.contains("[2] Stopped 'b.gsynth'"));
        assertTrue(output, output.contains("[3] Stopped 'a.gsynth'"));
        assertTrue(output, output.trim().endsWith("Bye."));
    }

    @Test
    public void exitAndEndOfInputStopRunningSimulations() throws Exception {
        TestProjects.fileProject(workingDir.resolve("a.gsynth"));

        String output = run("start a.gsynth\n");

        assertTrue(output, output.contains("[1] Stopped 'a.gsynth'"));
        assertTrue(output, output.trim().endsWith("Bye."));
        assertTrue(manager.stopAll().isEmpty());
    }

    @Test
    public void reportsUsageAndUnknownCommands() throws Exception {
        String output = run("""
            hello
            start
            stop
            stop one
            stop 4
            list extra
            start "unclosed
            start missing.gsynth
            help
            list
            stop all
            exit
            """);

        assertTrue(output, output.contains("Error: Unknown command 'hello'"));
        assertTrue(output, output.contains("Error: Usage: start <file.gsynth>"));
        assertTrue(output, output.contains("Error: Usage: stop <id> | stop all"));
        assertTrue(output, output.contains("Error: Invalid id 'one'"));
        assertTrue(output, output.contains("Error: There is no simulation with id 4"));
        assertTrue(output, output.contains("Error: Usage: list"));
        assertTrue(output, output.contains("Error: Missing closing quote"));
        assertTrue(output, output.contains("Error: File not found: " + workingDir.resolve("missing.gsynth")));
        assertTrue(output, output.contains("stop all              Stop every running simulation"));
        assertTrue(output, output.contains("No simulations yet."));
        assertTrue(output, output.contains("No simulation is running."));
    }

    @Test
    public void quotedPathsAndHomeAreResolved() throws Exception {
        TestProjects.fileProject(workingDir.resolve("my project.gsynth"));
        TestProjects.fileProject(home.resolve("projects").resolve("home.gsynth"));

        String output = run("start \"my project.gsynth\"\nstart ~/projects/home.gsynth\nexit\n");

        assertTrue(output, output.contains("[1] Started 'my project.gsynth'"));
        assertTrue(output, output.contains("[2] Started 'home.gsynth'"));
    }

    @Test
    public void tokenizeSplitsOnWhitespaceAndKeepsQuotedText() {
        assertEquals(List.of(), CliShell.tokenize("   "));
        assertEquals(List.of("stop", "all"), CliShell.tokenize("  stop   all "));
        assertEquals(List.of("start", "C:\\My Files\\a.gsynth"), CliShell.tokenize("start 'C:\\My Files\\a.gsynth'"));
        assertEquals(List.of("start", "a b.gsynth"), CliShell.tokenize("start a\" \"b.gsynth"));
        assertThrows(IllegalArgumentException.class, () -> CliShell.tokenize("start \"a"));
    }

    @Test
    public void formatDurationUsesHoursMinutesAndSeconds() {
        assertEquals("00:00:00", CliShell.formatDuration(0));
        assertEquals("01:01:05", CliShell.formatDuration(3_665_000));
    }
}
