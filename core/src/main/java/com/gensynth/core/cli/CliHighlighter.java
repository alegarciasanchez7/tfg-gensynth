package com.gensynth.core.cli;

import com.gensynth.core.api.ISimulationManager;
import com.gensynth.core.model.SimulationSnapshot;
import org.jline.reader.Highlighter;
import org.jline.reader.LineReader;
import org.jline.utils.AttributedString;
import org.jline.utils.AttributedStringBuilder;
import org.jline.utils.AttributedStyle;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Colors the line while it is typed: known commands in cyan and unknown ones in red; after
 * {@code start}, a valid project file in green, a folder in blue and any other existing file in
 * amber; after {@code stop}, a running id (or {@code all}) in violet and anything else in red.
 * A path that does not exist yet keeps the default color, as it is usually still being typed.
 */
class CliHighlighter implements Highlighter {

    static final Set<String> COMMANDS = Set.of("start", "stop", "list", "clear", "help", "exit");

    /** A word of the line: where it is and its text without quotes. */
    record Word(int start, int end, String text) {
    }

    private final ISimulationManager manager;
    private final ProjectFileCheck projects;
    private final Path workingDir;
    private final Path userHome;

    /**
     * @param manager    source of the running ids
     * @param projects   tells which files are valid projects
     * @param workingDir folder that relative paths are resolved against
     * @param userHome   folder that {@code ~} expands to
     */
    CliHighlighter(ISimulationManager manager, ProjectFileCheck projects, Path workingDir, Path userHome) {
        this.manager = manager;
        this.projects = projects;
        this.workingDir = workingDir;
        this.userHome = userHome;
    }

    /**
     * @param reader the line reader (not used)
     * @param buffer the line typed so far
     * @return the line with its colors
     */
    @Override
    public AttributedString highlight(LineReader reader, String buffer) {
        List<Word> words = words(buffer);
        AttributedStyle[] styles = new AttributedStyle[buffer.length()];
        if (!words.isEmpty()) {
            Word command = words.get(0);
            String name = command.text().toLowerCase(Locale.ROOT);
            paint(styles, command, COMMANDS.contains(name) ? CliTheme.PRIMARY.bold() : CliTheme.ERROR);
            if (words.size() == 2) {
                AttributedStyle argument = switch (name) {
                    case "start" -> pathStyle(words.get(1).text());
                    case "stop" -> idStyle(words.get(1).text());
                    default -> null;
                };
                paint(styles, words.get(1), argument);
            }
        }
        AttributedStringBuilder line = new AttributedStringBuilder();
        for (int i = 0; i < buffer.length(); i++) {
            line.append(String.valueOf(buffer.charAt(i)), styles[i] != null ? styles[i] : CliTheme.PLAIN);
        }
        return line.toAttributedString();
    }

    private AttributedStyle pathStyle(String raw) {
        Path path;
        try {
            path = CliShell.resolvePath(raw, workingDir, userHome);
        } catch (IllegalArgumentException e) {
            return CliTheme.ERROR;
        }
        if (projects.isValidProject(path)) {
            return CliTheme.SUCCESS;
        }
        if (Files.isDirectory(path)) {
            return CliTheme.INFO;
        }
        return Files.exists(path) ? CliTheme.WARNING : null;
    }

    private AttributedStyle idStyle(String raw) {
        if ("all".equalsIgnoreCase(raw)) {
            return CliTheme.ACCENT;
        }
        for (SimulationSnapshot simulation : manager.list()) {
            if (simulation.status() == SimulationSnapshot.Status.RUNNING
                    && String.valueOf(simulation.id()).equals(raw)) {
                return CliTheme.ACCENT;
            }
        }
        return CliTheme.ERROR;
    }

    private static void paint(AttributedStyle[] styles, Word word, AttributedStyle style) {
        for (int i = word.start(); i < word.end(); i++) {
            styles[i] = style;
        }
    }

    /**
     * Splits the line like {@link CliShell#tokenize}, but keeps where each word is and accepts a
     * quote that is not closed yet.
     *
     * @param line the line typed so far
     * @return its words
     */
    static List<Word> words(String line) {
        List<Word> words = new ArrayList<>();
        StringBuilder text = new StringBuilder();
        int start = -1;
        char quote = 0;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (quote != 0) {
                if (c == quote) {
                    quote = 0;
                } else {
                    text.append(c);
                }
            } else if (Character.isWhitespace(c)) {
                if (start >= 0) {
                    words.add(new Word(start, i, text.toString()));
                    text.setLength(0);
                    start = -1;
                }
            } else {
                if (start < 0) {
                    start = i;
                }
                if (c == '"' || c == '\'') {
                    quote = c;
                } else {
                    text.append(c);
                }
            }
        }
        if (start >= 0) {
            words.add(new Word(start, line.length(), text.toString()));
        }
        return words;
    }
}
