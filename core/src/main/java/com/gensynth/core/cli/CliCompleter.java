package com.gensynth.core.cli;

import com.gensynth.core.api.ISimulationManager;
import com.gensynth.core.model.SimulationSnapshot;
import org.jline.reader.Candidate;
import org.jline.reader.Completer;
import org.jline.reader.LineReader;
import org.jline.reader.ParsedLine;

import java.io.File;
import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

/**
 * Tab completion of the shell: command names, the ids of {@code stop} and the paths of
 * {@code start}. A path lists the folder typed so far, like a terminal does: {@code start }
 * lists the current folder, {@code start ../} its parent and {@code start docs/} that folder.
 * Folders end with a separator so the next Tab goes on inside them.
 */
public class CliCompleter implements Completer {

    private static final List<String> COMMANDS = List.of("start", "stop", "list", "help", "exit");
    private static final boolean WINDOWS = File.separatorChar == '\\';

    private final ISimulationManager manager;
    private final Path workingDir;
    private final Path userHome;

    /**
     * @param manager    source of the ids that {@code stop} offers
     * @param workingDir folder that relative paths are resolved against
     * @param userHome   folder that {@code ~} expands to
     */
    public CliCompleter(ISimulationManager manager, Path workingDir, Path userHome) {
        this.manager = manager;
        this.workingDir = workingDir;
        this.userHome = userHome;
    }

    /**
     * Adds the candidates for the word under the cursor. The reader filters them by what is
     * already typed and quotes the ones with spaces.
     *
     * @param reader     the line reader (not used)
     * @param line       the parsed line, with the word under the cursor
     * @param candidates where the candidates are added
     */
    @Override
    public void complete(LineReader reader, ParsedLine line, List<Candidate> candidates) {
        if (line.wordIndex() == 0) {
            COMMANDS.forEach(command -> candidates.add(new Candidate(command)));
            return;
        }
        if (line.wordIndex() != 1) {
            return;
        }
        String command = line.words().get(0).toLowerCase(Locale.ROOT);
        if ("start".equals(command)) {
            addPaths(line.word().substring(0, line.wordCursor()), candidates);
        } else if ("stop".equals(command)) {
            candidates.add(new Candidate("all", "all", null, "every running simulation", null, null, true));
            for (SimulationSnapshot simulation : manager.list()) {
                if (simulation.status() == SimulationSnapshot.Status.RUNNING) {
                    String id = String.valueOf(simulation.id());
                    candidates.add(new Candidate(id, id, null,
                        String.valueOf(simulation.configFile().getFileName()), null, null, true));
                }
            }
        }
    }

    /**
     * Adds the entries of the folder in {@code typed} (the text up to its last separator, or the
     * working folder when there is none). Hidden entries are offered only once the name typed
     * starts with a dot, as in a terminal.
     */
    private void addPaths(String typed, List<Candidate> candidates) {
        int lastSeparator = lastSeparator(typed);
        String folderPart = typed.substring(0, lastSeparator + 1);
        String namePart = typed.substring(lastSeparator + 1);
        String separator = lastSeparator >= 0 ? String.valueOf(typed.charAt(lastSeparator)) : File.separator;

        Path folder;
        try {
            folder = folderPart.isEmpty() ? workingDir : CliShell.resolvePath(folderPart, workingDir, userHome);
        } catch (IllegalArgumentException e) {
            return;
        }
        boolean showHidden = namePart.startsWith(".");
        if (namePart.equals(".") || namePart.equals("..")) {
            // The folder listing never includes them: "..<Tab>" becomes "../"
            addFolder(folderPart + namePart, namePart, separator, candidates);
        }
        try (DirectoryStream<Path> entries = Files.newDirectoryStream(folder)) {
            for (Path entry : entries) {
                String name = entry.getFileName().toString();
                if (!showHidden && isHidden(entry)) {
                    continue;
                }
                if (Files.isDirectory(entry)) {
                    addFolder(folderPart + name, name, separator, candidates);
                } else {
                    candidates.add(new Candidate(folderPart + name, name, null, null, null, null, true));
                }
            }
        } catch (IOException | SecurityException e) {
            // Missing or unreadable folder: nothing to offer
        }
    }

    /**
     * A folder is not complete: no space is added after it, so Tab can go on with its content.
     * If the user types the separator right after it, the reader drops the one it added.
     */
    private static void addFolder(String value, String name, String separator, List<Candidate> candidates) {
        candidates.add(new Candidate(value + separator, name + separator, null, null, separator, null, false));
    }

    private static int lastSeparator(String typed) {
        int slash = typed.lastIndexOf('/');
        // A backslash is a separator only on Windows; elsewhere it is a valid file name character
        return WINDOWS ? Math.max(slash, typed.lastIndexOf('\\')) : slash;
    }

    private static boolean isHidden(Path entry) {
        try {
            return entry.getFileName().toString().startsWith(".") || Files.isHidden(entry);
        } catch (IOException e) {
            return true;
        }
    }
}
