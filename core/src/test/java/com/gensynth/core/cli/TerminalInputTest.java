package com.gensynth.core.cli;

import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import org.jline.reader.LineReader;
import org.jline.reader.UserInterruptException;
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
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.*;
import static org.mockito.Mockito.mock;
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

    private TerminalInput type(String keys) throws Exception {
        Terminal terminal = TerminalBuilder.builder()
            .system(false)
            .type("xterm")
            .streams(new ByteArrayInputStream(keys.getBytes(StandardCharsets.UTF_8)), new ByteArrayOutputStream())
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
    public void endOfInputEndsTheInput() throws Exception {
        try (TerminalInput input = type("")) {
            assertNull(input.readLine(CliShell.PROMPT));
        }
    }
}
