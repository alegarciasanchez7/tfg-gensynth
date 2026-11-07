package com.gensynth.core.cli;

import com.gensynth.core.api.IDesktopLauncher;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import org.jline.terminal.Size;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
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
    private Path outputs;
    private SimulationManager manager;

    @Before
    public void setUp() throws Exception {
        workingDir = temp.newFolder("work").toPath();
        home = temp.newFolder("home").toPath();
        outputs = temp.newFolder("outputs").toPath();
        manager = new SimulationManager(new ConnectorCatalogService(), () -> outputs.resolve("OUTPUT").toString());
    }

    @After
    public void tearDown() {
        manager.shutdown();
    }

    private String run(String input) throws Exception {
        return run(input, null);
    }

    /** Runs the shell; with a terminal, in colors as when it is started from one. */
    private String run(String input, Terminal terminal) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        PrintStream out = new PrintStream(bytes, true, StandardCharsets.UTF_8);
        CliShell shell = new CliShell(manager, CliShell.plainInput(new BufferedReader(new StringReader(input)), out),
            out, workingDir, home, "9.9.9");
        if (terminal != null) {
            shell.useTerminal(CliTheme.forTerminal(terminal), lines -> lines.get().forEach(out::println));
        }
        shell.run();
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
        assertTrue(output, output.contains("Output folder: " + outputs.resolve("OUTPUT") + "_sim1"));
        assertTrue(output, output.contains("[2] Started 'b.gsynth' (1 groups, 1 flows)"));
        assertTrue(output, output.contains("Error: 'a.gsynth' is already running with id 1"));
        assertTrue(output, output.contains("ID   STATUS   UPTIME      MSG/S   MESSAGES  ERRORS  FILE"));
        assertTrue(output, output.contains("[1] Stopped 'a.gsynth' after "));
        // Started again with the same id
        assertEquals(output, 2, output.split("\\[1\\] Started 'a.gsynth'", -1).length - 1);
        assertTrue(output, output.contains("[2] Stopped 'b.gsynth'"));
        assertEquals(output, 2, output.split("\\[1\\] Stopped 'a.gsynth'", -1).length - 1);
        assertFalse(output, output.contains("[3]"));
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
        assertTrue(output, output.contains("stop <id> | stop all    Stop a simulation, or every running one"));
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
    public void plainOutputIsAsciiWithoutEscapeCodes() throws Exception {
        TestProjects.fileProject(workingDir.resolve("a.gsynth"));
        TestProjects.brokenProject(workingDir.resolve("broken.gsynth"));

        String output = run("""
            help
            see a.gsynth
            see broken.gsynth
            start broken.gsynth
            start a.gsynth
            tick 1
            metrics
            metrics 1
            list
            exit
            """);

        assertFalse(output, output.contains("\u001b["));
        assertTrue(output, output.chars().allMatch(c -> c < 128));
        assertEquals(output, 1, output.split("GenSynth 9.9.9 command line", -1).length - 1);
    }

    @Test
    public void terminalOutputIsColoredWithoutClearingTheScreen() throws Exception {
        TestProjects.fileProject(workingDir.resolve("a.gsynth"));
        ByteArrayOutputStream screen = new ByteArrayOutputStream();
        try (Terminal terminal = TerminalBuilder.builder().system(false).type("xterm-256color")
                .streams(new ByteArrayInputStream(new byte[0]), screen).size(new Size(100, 30)).build()) {
            String output = run("start a.gsynth\nstart missing.gsynth\nexit\n", terminal);

            assertTrue(output, output.startsWith("GenSynth 9.9.9 command line."));
            assertTrue(output, output.contains("\u001b["));
            assertTrue(output, output.contains("Started"));
            assertTrue(output, output.contains("Error:"));
            assertEquals("nothing is drawn through the terminal", "", screen.toString(StandardCharsets.UTF_8));
        }
    }

    @Test
    public void terminalsWithoutColorsGetPlainText() throws Exception {
        try (Terminal terminal = TerminalBuilder.builder().system(false).type("dumb")
                .streams(new ByteArrayInputStream(new byte[0]), new ByteArrayOutputStream()).build()) {
            assertFalse(CliTheme.forTerminal(terminal).isColored());
        }
    }

    @Test
    public void aFailedStartListsEveryReason() throws Exception {
        TestProjects.brokenProject(workingDir.resolve("broken.gsynth"));

        String output = run("start broken.gsynth\nexit\n");

        assertTrue(output, output.contains("Error: 'broken.gsynth' cannot start:"));
        assertTrue(output, output.contains("  - Group \"Sensors\": Variables refer to each other in a cycle: "));
        assertTrue(output, output.contains("  - Group \"Alarms\": Invalid configuration for variable 'threshold'"));
        assertFalse("connector problems do not stop the start", output.contains("'nope' is not installed"));
    }

    @Test
    public void seeShowsTheProjectAsATree() throws Exception {
        TestProjects.fileProject(workingDir.resolve("a.gsynth"));
        TestProjects.brokenProject(workingDir.resolve("broken.gsynth"));

        String output = run("see a.gsynth\nsee broken.gsynth\nsee\nexit\n");

        assertTrue(output, output.contains("+-- Tick: every 20 ms"));
        assertTrue(output, output.contains("`-- Group \"Sensors\" (parallel, 1 flow)"));
        assertTrue(output, output.contains("    `-- Flow \"Temperature\" -> File Output 1.0.0, every tick"));
        assertTrue(output, output.contains("No problems found: it can start."));
        assertTrue(output, output.contains("`-- Problems (3)"));
        assertTrue(output, output.contains("Group \"Sensors\" / flow \"Humidity\": Connector 'nope' is not installed"));
        assertTrue(output, output.contains("Error: Usage: see <file.gsynth>"));
        assertTrue("see starts nothing", manager.list().isEmpty());
    }

    @Test
    public void tickShowsAndChangesTheTickOfRunningSimulations() throws Exception {
        TestProjects.fileProject(workingDir.resolve("a.gsynth"));
        TestProjects.fileProject(workingDir.resolve("b.gsynth"));

        String output = run("""
            tick all 1s
            start a.gsynth
            start b.gsynth
            tick 1
            tick 1 500ms
            tick all fast
            tick 2 2x
            tick 2 1441m
            tick 7 1s
            stop 1
            tick 1 1s
            exit
            """);

        assertTrue(output, output.contains("No simulation is running."));
        assertTrue(output, output.contains("[1] Tick: 20 ms ("));
        assertTrue(output, output.contains("[1] Tick set to 500 ms (was 20 ms)"));
        assertTrue(output, output.contains("[1] Tick set to as fast as possible (was 500 ms)"));
        assertTrue(output, output.contains("[2] Tick set to as fast as possible (was 20 ms)"));
        assertTrue(output, output.contains("Error: Invalid tick '2x'"));
        assertTrue(output, output.contains("Error: Tick period cannot exceed 24 hours"));
        assertTrue(output, output.contains("Error: There is no simulation with id 7"));
        assertTrue(output, output.contains("Error: Simulation 1 is already stopped"));
    }

    @Test
    public void metricsWithoutATerminalPrintsTheLineOnce() throws Exception {
        TestProjects.fileProject(workingDir.resolve("a.gsynth"));

        String output = run("metrics\nstart a.gsynth\nmetrics\nmetrics 1\nmetrics 4\nmetrics all\nexit\n");

        assertTrue(output, output.contains("No simulation running | CPU "));
        assertTrue(output, output.contains("1 running | CPU "));
        assertTrue(output, output.contains("[1] a.gsynth | 00:00:"));
        assertTrue(output, output.contains(" | tick 20 ms ("));
        assertFalse("the hint is only shown with a live line", output.contains("press any key"));
        assertTrue(output, output.contains("Error: There is no simulation with id 4"));
        assertTrue(output, output.contains("[1] a.gsynth | 00:00:"));
        assertTrue(output, output.contains("Total: 1 running | CPU "));
    }

    @Test
    public void metricsAllShowsEverySimulationAndTheTotal() throws Exception {
        TestProjects.fileProject(workingDir.resolve("a.gsynth"));
        TestProjects.fileProject(workingDir.resolve("longer-name.gsynth"));

        String output = run("metrics all\nstart a.gsynth\nstart longer-name.gsynth\nstop 1\nmetrics all\nexit\n");

        assertTrue(output, output.contains("No simulations yet."));
        // File names are aligned
        assertTrue(output, output.contains("[1] a.gsynth           | stopped after "));
        assertTrue(output, output.contains("[2] longer-name.gsynth | 00:00:"));
        assertTrue(output, output.contains("Total: 1 running | CPU "));
    }

    @Test
    public void startByIdRunsTheSameFileAgain() throws Exception {
        TestProjects.fileProject(workingDir.resolve("a.gsynth"));

        String output = run("start a.gsynth\nstart 1\nstop 1\nstart 1\nstart 5\nexit\n");

        assertTrue(output, output.contains("Error: 'a.gsynth' is already running with id 1"));
        assertEquals(output, 2, output.split("\\[1\\] Started 'a.gsynth'", -1).length - 1);
        assertTrue(output, output.contains("Error: There is no simulation with id 5"));
    }

    @Test
    public void unknownCommandsSuggestTheClosestOne() {
        assertEquals("Unknown command 'lsit'. Did you mean 'list'? Type 'help' for the list of commands.",
            CliShell.unknownCommand("lsit"));
        assertTrue(CliShell.unknownCommand("STRAT").contains("Did you mean 'start'?"));
        assertTrue(CliShell.unknownCommand("clera").contains("Did you mean 'clear'?"));
        assertEquals("Unknown command 'deploy'. Type 'help' for the list of commands.", CliShell.unknownCommand("deploy"));
    }

    @Test
    public void clearIsSentToTheScreen() throws Exception {
        int[] cleared = {0};
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        PrintStream out = new PrintStream(bytes, true, StandardCharsets.UTF_8);
        CliShell shell = new CliShell(manager, CliShell.plainInput(new BufferedReader(new StringReader("clear\nclear x\nexit\n")), out),
            out, workingDir, home, "9.9.9");
        shell.useTerminal(CliTheme.plain(), new CliShell.Screen() {
            @Override
            public void showLive(java.util.function.Supplier<List<String>> lines) {
                lines.get().forEach(out::println);
            }

            @Override
            public void clearScreen() {
                cleared[0]++;
            }
        });
        shell.run();

        assertEquals(1, cleared[0]);
        assertTrue(bytes.toString(StandardCharsets.UTF_8).contains("Error: Usage: clear"));
    }

    /** Runs the shell with a desktop launcher that only records what it was asked. */
    private String runWithDesktop(String input, IDesktopLauncher desktop) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        PrintStream out = new PrintStream(bytes, true, StandardCharsets.UTF_8);
        CliShell shell = new CliShell(manager, CliShell.plainInput(new BufferedReader(new StringReader(input)), out),
            out, workingDir, home, "9.9.9");
        shell.useDesktop(desktop);
        shell.run();
        return bytes.toString(StandardCharsets.UTF_8);
    }

    @Test
    public void editOpensProjectsInTheDesktopApplication() throws Exception {
        Path project = TestProjects.fileProject(workingDir.resolve("a.gsynth"));
        java.nio.file.Files.writeString(workingDir.resolve("broken.gsynth"), "{ not json");
        List<Path> opened = new java.util.ArrayList<>();
        IDesktopLauncher.Result[] answer = {IDesktopLauncher.Result.LAUNCHED};
        IDesktopLauncher desktop = file -> {
            opened.add(file);
            return answer[0];
        };

        // A folder named "new" does not turn "edit new" into a path
        java.nio.file.Files.createDirectories(workingDir.resolve("new"));
        String output = runWithDesktop("edit a.gsynth\nedit new\nedit\nedit missing.gsynth\nedit broken.gsynth\n", desktop);

        assertTrue(output, output.contains("Opening 'a.gsynth' in GenSynth..."));
        assertTrue(output, output.contains("    Save it there, then 'start <file.gsynth>' runs it."));
        assertTrue(output, output.contains("Opening a new project in GenSynth..."));
        assertTrue(output, output.contains("Error: Usage: edit <file.gsynth> | edit new"));
        assertTrue(output, output.contains("Error: File not found: " + workingDir.resolve("missing.gsynth")));
        assertTrue(output, output.contains("Error: Not a GenSynth project file: invalid JSON content"));
        // Only the valid ones reach the desktop application
        assertEquals(java.util.Arrays.asList(workingDir.resolve("a.gsynth"), null), opened);

        answer[0] = IDesktopLauncher.Result.OPENED_IN_WINDOW;
        output = runWithDesktop("start a.gsynth\nedit a.gsynth\nstop 1\nedit a.gsynth\nexit\n", desktop);
        assertTrue(output, output.contains("Sent 'a.gsynth' to the open GenSynth window."));
        // A running file must stop before it starts again
        assertTrue(output, output.contains("    Save it there, then 'stop 1' and 'start 1' run the changes."));
        assertTrue(output, output.contains("    Save it there, then 'start 1' runs the changes."));
        assertTrue(project.toFile().exists());
    }

    @Test
    public void editReportsWhyTheDesktopCannotOpen() throws Exception {
        TestProjects.fileProject(workingDir.resolve("a.gsynth"));
        IDesktopLauncher noDisplay = file -> {
            throw new IllegalStateException("No graphical display: the desktop application cannot open here");
        };

        String output = runWithDesktop("edit a.gsynth\nexit\n", noDisplay);

        assertTrue(output, output.contains("Error: No graphical display"));
        assertTrue("without a launcher", run("edit new\nexit\n").contains("Error: The desktop application is not available here"));
    }

    @Test
    public void tokenizeSplitsOnWhitespaceAndKeepsQuotedText() {
        assertEquals(List.of(), CliShell.tokenize("   "));
        assertEquals(List.of("stop", "all"), CliShell.tokenize("  stop   all "));
        assertEquals(List.of("start", "C:\\My Files\\a.gsynth"), CliShell.tokenize("start 'C:\\My Files\\a.gsynth'"));
        assertEquals(List.of("start", "a b.gsynth"), CliShell.tokenize("start a\" \"b.gsynth"));
        assertThrows(IllegalArgumentException.class, () -> CliShell.tokenize("start \"a"));
    }

}
