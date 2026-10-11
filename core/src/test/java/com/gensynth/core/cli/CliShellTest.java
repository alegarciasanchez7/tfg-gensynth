package com.gensynth.core.cli;

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
        return run(input, null);
    }

    /** Runs the shell; with a terminal, in colors as when it is started from one. */
    private String run(String input, Terminal terminal) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        PrintStream out = new PrintStream(bytes, true, StandardCharsets.UTF_8);
        CliShell shell = new CliShell(manager, CliShell.plainInput(new BufferedReader(new StringReader(input)), out),
            out, workingDir, home, "9.9.9");
        if (terminal != null) {
            shell.useTerminal(CliTheme.colored(terminal), null);
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
        assertTrue(output, output.contains("[2] Started 'b.gsynth' (1 groups, 1 flows)"));
        assertTrue(output, output.contains("Error: 'a.gsynth' is already running with id 1"));
        assertTrue(output, output.contains("ID   STATUS   UPTIME      MSG/S   MESSAGES  ERRORS  FILE"));
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
    public void plainOutputHasNoEscapeCodesAndClearRepeatsTheHeader() throws Exception {
        String output = run("clear\nclear extra\nexit\n");

        assertFalse(output, output.contains("\u001b["));
        assertEquals(output, 2, output.split("GenSynth 9.9.9 command line", -1).length - 1);
        assertTrue(output, output.contains("Error: Usage: clear"));
    }

    @Test
    public void terminalOutputIsColoredAndStartsWithTheLogo() throws Exception {
        TestProjects.fileProject(workingDir.resolve("a.gsynth"));
        ByteArrayOutputStream screen = new ByteArrayOutputStream();
        try (Terminal terminal = TerminalBuilder.builder().system(false).type("xterm-256color")
                .streams(new ByteArrayInputStream(new byte[0]), screen).size(new Size(100, 30)).build()) {
            String output = run("start a.gsynth\nstart missing.gsynth\nexit\n", terminal);

            assertTrue(output, output.contains("╱╲"));
            assertTrue(output, output.contains("GenSynth"));
            assertFalse("the plain header is not printed", output.contains("command line. Type"));
            assertTrue(output, output.contains("\u001b["));
            assertTrue(output, output.contains("Started"));
            assertTrue(output, output.contains("Error:"));
            // The screen is cleared through the terminal before the header
            assertTrue(screen.toString(StandardCharsets.UTF_8).contains("\u001b[2J"));
        }
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
