package com.gensynth.core.cli;

import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import org.jline.utils.AttributedString;
import org.jline.utils.AttributedStyle;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.Assert.*;

public class CliHighlighterTest {

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    private Path workingDir;
    private SimulationManager manager;
    private CliHighlighter highlighter;

    @Before
    public void setUp() throws Exception {
        workingDir = temp.newFolder("work").toPath();
        TestProjects.fileProject(workingDir.resolve("good.gsynth"));
        Files.writeString(workingDir.resolve("broken.gsynth"), "{\"hello\":1}");
        Files.writeString(workingDir.resolve("notes.txt"), "text");
        Files.createDirectories(workingDir.resolve("docs"));
        Path outputs = temp.newFolder("outputs").toPath();
        manager = new SimulationManager(new ConnectorCatalogService(), () -> outputs.resolve("OUTPUT").toString());
        highlighter = new CliHighlighter(manager, new ProjectFileCheck(), workingDir, temp.getRoot().toPath());
    }

    @After
    public void tearDown() {
        manager.shutdown();
    }

    /** Style of the character at {@code index} once the line is highlighted. */
    private AttributedStyle styleAt(String line, int index) {
        AttributedString highlighted = highlighter.highlight(null, line);
        assertEquals(line, highlighted.toString());
        return highlighted.styleAt(index);
    }

    @Test
    public void commandsAreCyanAndUnknownWordsRed() {
        assertEquals(CliTheme.PRIMARY.bold(), styleAt("start", 0));
        assertEquals(CliTheme.PRIMARY.bold(), styleAt("  LIST", 2));
        assertEquals(CliTheme.ERROR, styleAt("hello", 0));
        assertEquals(CliTheme.PLAIN, styleAt("  hello", 0));
    }

    @Test
    public void startPathsAreColoredByWhatTheyPointTo() {
        assertEquals(CliTheme.SUCCESS, styleAt("start good.gsynth", 6));
        assertEquals(CliTheme.SUCCESS, styleAt("start './good.gsynth'", 6));
        assertEquals(CliTheme.WARNING, styleAt("start broken.gsynth", 6));
        assertEquals(CliTheme.WARNING, styleAt("start notes.txt", 6));
        assertEquals(CliTheme.INFO, styleAt("start docs", 6));
        assertEquals(CliTheme.PLAIN, styleAt("start goo", 6));
    }

    @Test
    public void stopIdsAreVioletWhenRunning() throws Exception {
        assertEquals(CliTheme.ERROR, styleAt("stop 1", 5));
        manager.start(workingDir.resolve("good.gsynth"));

        assertEquals(CliTheme.ACCENT, styleAt("stop 1", 5));
        assertEquals(CliTheme.ACCENT, styleAt("stop all", 5));
        assertEquals(CliTheme.ERROR, styleAt("stop 2", 5));
    }

    @Test
    public void wordsKeepTheirPositionAndAcceptAnOpenQuote() {
        assertEquals(List.of(new CliHighlighter.Word(1, 6, "start"), new CliHighlighter.Word(7, 16, "my file")),
            CliHighlighter.words(" start 'my file' "));
        assertEquals(List.of(new CliHighlighter.Word(0, 5, "start"), new CliHighlighter.Word(6, 10, "a b")),
            CliHighlighter.words("start \"a b"));
    }
}
