package com.gensynth.core.cli;

import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import org.jline.reader.Candidate;
import org.jline.reader.Parser;
import org.jline.reader.impl.DefaultParser;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.Assert.*;

public class CliCompleterTest {

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    private Path workingDir;
    private SimulationManager manager;
    private CliCompleter completer;
    private final DefaultParser parser = new DefaultParser();

    @Before
    public void setUp() throws Exception {
        // root/{other.gsynth, outputs/, work/{a.gsynth, notes.txt, .secret, docs/inner.gsynth}, home/projects/}
        Path root = temp.getRoot().toPath();
        workingDir = Files.createDirectories(root.resolve("work"));
        Path home = Files.createDirectories(root.resolve("home"));
        Files.createDirectories(home.resolve("projects"));
        Files.createFile(root.resolve("other.gsynth"));
        Files.createFile(workingDir.resolve("a.gsynth"));
        Files.createFile(workingDir.resolve("notes.txt"));
        Files.createFile(workingDir.resolve(".secret"));
        Files.createDirectories(workingDir.resolve("docs"));
        Files.createFile(workingDir.resolve("docs").resolve("inner.gsynth"));

        Path outputs = temp.newFolder("outputs").toPath();
        manager = new SimulationManager(new ConnectorCatalogService(), () -> outputs.resolve("OUTPUT").toString());
        completer = new CliCompleter(manager, workingDir, home);
        parser.setEscapeChars(null);
    }

    @After
    public void tearDown() {
        manager.shutdown();
    }

    private List<Candidate> complete(String line) {
        List<Candidate> candidates = new ArrayList<>();
        completer.complete(null, parser.parse(line, line.length(), Parser.ParseContext.COMPLETE), candidates);
        return candidates;
    }

    private Set<String> values(String line) {
        return complete(line).stream().map(Candidate::value).collect(Collectors.toSet());
    }

    @Test
    public void firstWordCompletesCommands() {
        assertEquals(Set.of("start", "stop", "list", "help", "exit"), values(""));
        assertEquals(Set.of("start", "stop", "list", "help", "exit"), values("st"));
    }

    @Test
    public void startListsTheWorkingFolderWithoutHiddenEntries() {
        assertEquals(Set.of("a.gsynth", "notes.txt", "docs/"), values("start "));

        Candidate folder = complete("start ").stream().filter(c -> c.value().equals("docs/")).findFirst().orElseThrow();
        assertFalse("a folder leaves the cursor inside it", folder.complete());
        Candidate file = complete("start ").stream().filter(c -> c.value().equals("a.gsynth")).findFirst().orElseThrow();
        assertTrue(file.complete());
    }

    @Test
    public void startListsTheFolderTypedSoFar() {
        assertEquals(Set.of("docs/inner.gsynth"), values("start docs/"));
        assertEquals(Set.of("docs/inner.gsynth"), values("start docs/in"));
        assertEquals(Set.of("../other.gsynth", "../outputs/", "../work/", "../home/"), values("start ../"));
        assertEquals(Set.of("~/projects/"), values("start ~/"));
        assertEquals(Set.of("docs/../a.gsynth", "docs/../notes.txt", "docs/../docs/"), values("start docs/../"));
    }

    @Test
    public void dotsAndHiddenEntriesAppearOnceADotIsTyped() {
        assertTrue(values("start ..").contains("../"));
        assertTrue(values("start .").containsAll(Set.of("./", ".secret")));
    }

    @Test
    public void missingFoldersAndOtherWordsOfferNothing() {
        assertTrue(values("start missing/").isEmpty());
        assertTrue(values("start a.gsynth ").isEmpty());
        assertTrue(values("list ").isEmpty());
        assertTrue(values("hello ").isEmpty());
    }

    @Test
    public void stopOffersAllAndTheRunningIds() throws Exception {
        assertEquals(Set.of("all"), values("stop "));

        manager.start(TestProjects.fileProject(workingDir.resolve("one.gsynth")));
        manager.start(TestProjects.fileProject(workingDir.resolve("two.gsynth")));
        manager.stop(1);

        assertEquals(Set.of("all", "2"), values("stop "));
        Candidate id = complete("stop ").stream().filter(c -> c.value().equals("2")).findFirst().orElseThrow();
        assertEquals("two.gsynth", id.descr());
    }
}
