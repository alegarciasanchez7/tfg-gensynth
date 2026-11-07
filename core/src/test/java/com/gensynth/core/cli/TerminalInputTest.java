package com.gensynth.core.cli;

import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import org.jline.reader.LineReader;
import org.jline.reader.UserInterruptException;
import org.jline.terminal.Attributes;
import org.jline.terminal.Size;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOError;
import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.Assert.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Types keys into a virtual terminal, as a user would, and checks the lines the shell receives.
 */
public class TerminalInputTest {

    private static final String TAB = "\t";
    private static final String ENTER = "\r";

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    private Path workingDir;
    private SimulationManager manager;

    @Before
    public void setUp() throws Exception {
        workingDir = temp.newFolder("work").toPath();
        Files.createDirectories(workingDir.resolve("documents").resolve("plant"));
        Files.createFile(workingDir.resolve("documents").resolve("plant").resolve("line.gsynth"));
        Files.createFile(workingDir.resolve("my project.gsynth"));
        Path outputs = temp.newFolder("outputs").toPath();
        manager = new SimulationManager(new ConnectorCatalogService(), () -> outputs.resolve("OUTPUT").toString());
    }

    @After
    public void tearDown() {
        manager.shutdown();
    }

    /** What the last terminal of {@link #type} received, and that terminal. */
    private ByteArrayOutputStream screen;
    private Terminal terminal;

    private TerminalInput type(String keys) throws Exception {
        screen = new ByteArrayOutputStream();
        terminal = TerminalBuilder.builder()
            .system(false)
            .type("xterm")
            // A known width: otherwise it depends on the console the tests run in (Windows)
            .size(new Size(80, 24))
            .streams(new ByteArrayInputStream(keys.getBytes(StandardCharsets.UTF_8)), screen)
            .build();
        return new TerminalInput(terminal, new CliCompleter(manager, workingDir, temp.getRoot().toPath()));
    }

    @Test
    public void tabCompletesCommandsAndFolderByFolder() throws Exception {
        try (TerminalInput input = type("sta" + TAB + "doc" + TAB + "pl" + TAB + "l" + TAB + ENTER)) {
            // No separator typed: folders end with the one of the system (a backslash on Windows)
            String sep = File.separator;
            assertEquals("start documents" + sep + "plant" + sep + "line.gsynth ", input.readLine(CliShell.PROMPT));
        }
    }

    @Test
    public void completedNamesWithSpacesAreQuoted() throws Exception {
        try (TerminalInput input = type("start my" + TAB + ENTER)) {
            String line = input.readLine(CliShell.PROMPT);
            assertEquals("start 'my project.gsynth' ", line);
            assertEquals("my project.gsynth", CliShell.tokenize(line).get(1));
        }
    }

    @Test
    public void ctrlCDiscardsTheLineAndEndsTheInputWhenEmpty() throws Exception {
        // Ctrl+C reaches the reader as an asynchronous signal, so the reader is mocked
        LineReader reader = mock(LineReader.class);
        when(reader.readLine(CliShell.PROMPT))
            .thenThrow(new UserInterruptException("start x"))
            .thenReturn("list")
            .thenThrow(new UserInterruptException(""));
        try (TerminalInput input = new TerminalInput(mock(Terminal.class), reader)) {
            assertEquals("list", input.readLine(CliShell.PROMPT));
            assertNull(input.readLine(CliShell.PROMPT));
        }
    }

    @Test
    public void liveLineIsRedrawnUntilAKeyIsPressed() throws Exception {
        // Any key goes back to the prompt; an arrow key sends three characters
        String longText = "metrics line " + "x".repeat(100) + " END";
        try (TerminalInput input = type("\u001b[A")) {
            input.showLive(() -> List.of(longText));

            String shown = screen.toString(StandardCharsets.UTF_8);
            assertTrue(shown, shown.contains("\rmetrics line xxx"));
            assertFalse("cut to the width of the terminal", shown.contains("END"));
            assertTrue("the terminal is back in its normal mode",
                terminal.getAttributes().getLocalFlag(Attributes.LocalFlag.ICANON));
            assertTrue(terminal.getAttributes().getLocalFlag(Attributes.LocalFlag.ISIG));
        }
    }

    @Test
    public void severalLinesAreDrawnAsABlockWithTheHintAtTheEnd() throws Exception {
        try (TerminalInput input = type("q")) {
            input.showLive(() -> List.of("[1] a.gsynth | 2 msg/s", "Total: 1 running"));

            String shown = screen.toString(StandardCharsets.UTF_8);
            assertTrue(shown, shown.contains("[1] a.gsynth | 2 msg/s"));
            assertTrue(shown, shown.contains("\r\nTotal: 1 running  (press any key)"));
        }
    }

    @Test
    public void dumbTerminalsPrintTheLiveLineOnce() throws Exception {
        // They only deliver keys after Enter, so waiting for a key would block
        Terminal dumb = mock(Terminal.class);
        StringWriter shown = new StringWriter();
        when(dumb.getType()).thenReturn(Terminal.TYPE_DUMB);
        when(dumb.writer()).thenReturn(new PrintWriter(shown));
        try (TerminalInput input = new TerminalInput(dumb, mock(LineReader.class))) {
            input.showLive(() -> List.of("1 running | CPU 1.0%"));
        }

        assertEquals("1 running | CPU 1.0%" + System.lineSeparator(), shown.toString());
        verify(dumb, never()).enterRawMode();
    }

    @Test
    public void aTerminalThatGoesAwayEndsTheInput() throws Exception {
        LineReader reader = mock(LineReader.class);
        when(reader.readLine(CliShell.PROMPT)).thenThrow(new IOError(new IOException("Input/output error")));
        try (TerminalInput input = new TerminalInput(mock(Terminal.class), reader)) {
            assertNull(input.readLine(CliShell.PROMPT));
        }
    }

    @Test
    public void endOfInputEndsTheInput() throws Exception {
        try (TerminalInput input = type("")) {
            assertNull(input.readLine(CliShell.PROMPT));
        }
    }
}
