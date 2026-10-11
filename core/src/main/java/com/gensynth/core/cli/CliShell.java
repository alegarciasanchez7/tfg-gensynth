package com.gensynth.core.cli;

import com.gensynth.core.api.ISimulationManager;
import com.gensynth.core.model.SimulationSnapshot;
import org.jline.utils.AttributedStyle;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Interactive shell of the {@code gensynth} command: reads one command per line and runs it
 * against a {@link ISimulationManager}. The input and output are injected so the shell can be
 * tested; what it prints is the user interface of the command, not logging.
 */
public class CliShell {

    static final String PROMPT = "gensynth> ";

    /** Commands of the help, with their description. */
    private static final String[][] HELP = {
        {"start <file.gsynth>", "Start a project file (quote paths with spaces)"},
        {"stop <id>", "Stop the simulation with that id"},
        {"stop all", "Stop every running simulation"},
        {"list", "Show the simulations of this session"},
        {"clear", "Clear the screen"},
        {"help", "Show this help"},
        {"exit", "Stop every simulation and leave"},
    };

    /**
     * Source of the command lines: a terminal with line editing, or any reader.
     */
    @FunctionalInterface
    public interface LineSource {

        /**
         * Shows the prompt and reads one line.
         *
         * @param prompt text shown before the line
         * @return the line, or null at the end of the input
         * @throws IOException if the input cannot be read
         */
        String readLine(String prompt) throws IOException;
    }

    private final ISimulationManager manager;
    private final LineSource in;
    private final PrintStream out;
    private final Path workingDir;
    private final Path userHome;
    private final String version;
    private CliTheme theme = CliTheme.plain();
    private StatusPanel panel;

    /**
     * @param manager    runs the simulations
     * @param in         source of the commands (see {@link #plainInput})
     * @param out        where the shell writes its output
     * @param workingDir folder that relative paths are resolved against
     * @param userHome   folder that {@code ~} expands to
     * @param version    application version shown in the banner
     */
    public CliShell(ISimulationManager manager, LineSource in, PrintStream out,
                    Path workingDir, Path userHome, String version) {
        this.manager = manager;
        this.in = in;
        this.out = out;
        this.workingDir = workingDir;
        this.userHome = userHome;
        this.version = version;
    }

    /**
     * Reads the lines from a plain reader, printing the prompt to {@code out}: used when the
     * input is not a terminal (a pipe or a file) and by the tests.
     *
     * @param in  source of the lines
     * @param out where the prompt is printed
     * @return the line source
     */
    public static LineSource plainInput(BufferedReader in, PrintStream out) {
        return prompt -> {
            out.print(prompt);
            out.flush();
            return in.readLine();
        };
    }

    /**
     * Writes to a terminal: colors, a header with the logo that clears the screen and, if
     * available, the status panel at the bottom.
     *
     * @param theme colors of the output
     * @param panel live status panel, or null
     */
    void useTerminal(CliTheme theme, StatusPanel panel) {
        this.theme = theme;
        this.panel = panel;
    }

    /**
     * Runs the shell until {@code exit} or the end of the input, then stops every simulation
     * that is still running.
     *
     * @throws IOException if the input cannot be read
     */
    public void run() throws IOException {
        printHeader();
        String prompt = theme.isColored()
            ? theme.paint("gensynth", CliTheme.PRIMARY.bold()) + theme.paint("> ", CliTheme.MUTED)
            : PROMPT;
        boolean keepGoing = true;
        while (keepGoing) {
            String line = in.readLine(prompt);
            if (line == null) {
                out.println();
                keepGoing = false;
            } else {
                keepGoing = execute(line);
            }
        }
        exit();
    }

    /**
     * Runs one command line.
     *
     * @param line the command as typed
     * @return false when the shell must end
     */
    boolean execute(String line) {
        // The panel waits while the command prints, so their output never mixes
        return panel == null ? runCommand(line) : panel.whilePrinting(() -> runCommand(line));
    }

    private boolean runCommand(String line) {
        List<String> tokens;
        try {
            tokens = tokenize(line);
        } catch (IllegalArgumentException e) {
            printError(e.getMessage());
            return true;
        }
        if (tokens.isEmpty()) {
            return true;
        }
        String command = tokens.get(0).toLowerCase(Locale.ROOT);
        List<String> args = tokens.subList(1, tokens.size());
        try {
            switch (command) {
                case "start" -> start(args);
                case "stop" -> stop(args);
                case "list" -> list(args);
                case "clear" -> clear(args);
                case "help" -> help();
                case "exit" -> {
                    return false;
                }
                default -> printError("Unknown command '" + tokens.get(0) + "'. Type 'help' for the list of commands.");
            }
        } catch (IllegalArgumentException | IllegalStateException e) {
            printError(e.getMessage());
        }
        return true;
    }

    private void start(List<String> args) {
        if (args.size() != 1) {
            throw new IllegalArgumentException("Usage: start <file.gsynth>");
        }
        SimulationSnapshot started = manager.start(resolvePath(args.get(0), workingDir, userHome));
        out.println(id(started) + theme.paint(" Started", CliTheme.SUCCESS)
            + String.format(" '%s' (%d groups, %d flows)", started.configFile().getFileName(),
                started.groups(), started.flows()));
        for (String error : started.connectorErrors()) {
            out.println("    " + theme.paint("Warning:", CliTheme.WARNING) + " connector failed in " + error);
        }
    }

    private void stop(List<String> args) {
        if (args.size() != 1) {
            throw new IllegalArgumentException("Usage: stop <id> | stop all");
        }
        if ("all".equalsIgnoreCase(args.get(0))) {
            List<SimulationSnapshot> stopped = manager.stopAll();
            if (stopped.isEmpty()) {
                out.println(theme.paint("No simulation is running.", CliTheme.MUTED));
            }
            stopped.forEach(this::printStopped);
            return;
        }
        int id;
        try {
            id = Integer.parseInt(args.get(0));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid id '" + args.get(0) + "': expected a number or 'all'");
        }
        printStopped(manager.stop(id));
    }

    private void list(List<String> args) {
        if (!args.isEmpty()) {
            throw new IllegalArgumentException("Usage: list");
        }
        List<SimulationSnapshot> snapshots = manager.list();
        if (snapshots.isEmpty()) {
            out.println(theme.paint("No simulations yet. Use 'start <file.gsynth>' to start one.", CliTheme.MUTED));
            return;
        }
        long now = System.currentTimeMillis();
        out.println(theme.paint(String.format("%-4s %-8s %-9s %7s %10s %7s  %s", "ID", "STATUS", "UPTIME",
            "MSG/S", "MESSAGES", "ERRORS", "FILE"), AttributedStyle.BOLD));
        for (SimulationSnapshot s : snapshots) {
            boolean running = s.status() == SimulationSnapshot.Status.RUNNING;
            out.println(theme.paint(String.format("%-4d ", s.id()), CliTheme.ACCENT)
                + theme.paint(String.format("%-8s ", s.status().name().toLowerCase(Locale.ROOT)),
                    running ? CliTheme.SUCCESS : CliTheme.MUTED)
                + theme.paint(String.format("%-9s ", CliFormat.duration(s.uptimeMillis(now))), CliTheme.MUTED)
                + theme.paint(String.format("%7s ", CliFormat.rate(s.messagesPerSecond())), CliTheme.RATE)
                + String.format("%10d ", s.messagesSent())
                + theme.paint(String.format("%7d", s.errors()), s.errors() > 0 ? CliTheme.ERROR : CliTheme.PLAIN)
                + "  " + s.configFile());
        }
    }

    private void clear(List<String> args) {
        if (!args.isEmpty()) {
            throw new IllegalArgumentException("Usage: clear");
        }
        printHeader();
    }

    private void help() {
        out.println("Commands:");
        for (String[] command : HELP) {
            out.println("  " + theme.paint(String.format("%-22s", command[0]), CliTheme.PRIMARY) + command[1]);
        }
        out.println(theme.paint("Press Tab to complete commands, ids and paths.", CliTheme.MUTED));
    }

    /**
     * Prints the header: with a terminal, clears the screen and shows the logo box; otherwise a
     * single line.
     */
    private void printHeader() {
        if (!theme.isColored()) {
            out.println("GenSynth " + version + " command line. Type 'help' for the list of commands.");
            return;
        }
        if (panel == null) {
            printBanner();
        } else {
            panel.whilePrinting(() -> {
                printBanner();
                return null;
            });
        }
    }

    private void printBanner() {
        out.flush();
        theme.clearScreen();
        if (panel != null) {
            panel.redrawAfterClear();
        }
        Banner.lines(version, Banner.displayFolder(workingDir, userHome), theme.width())
            .forEach(line -> out.println(theme.paint(line)));
        out.println();
        out.flush();
    }

    private void exit() {
        if (panel != null) {
            // Give the whole screen back before the last messages
            panel.close();
        }
        manager.stopAll().forEach(this::printStopped);
        out.println(theme.paint("Bye.", CliTheme.MUTED));
    }

    private void printStopped(SimulationSnapshot stopped) {
        out.println(id(stopped) + theme.paint(" Stopped", CliTheme.MUTED)
            + String.format(" '%s' after %s: %d messages sent, ", stopped.configFile().getFileName(),
                CliFormat.duration(stopped.uptimeMillis(stopped.stoppedAt())), stopped.messagesSent())
            + theme.paint(stopped.errors() + " errors", stopped.errors() > 0 ? CliTheme.ERROR : CliTheme.PLAIN));
    }

    private String id(SimulationSnapshot simulation) {
        return theme.paint("[" + simulation.id() + "]", CliTheme.ACCENT);
    }

    private void printError(String message) {
        out.println(theme.paint("Error:", CliTheme.ERROR) + " " + message);
    }

    /**
     * Resolves a path typed by the user: {@code ~} is the user's home and relative paths start
     * at the folder where {@code gensynth} was launched.
     *
     * @param raw        the path as typed
     * @param workingDir folder that relative paths are resolved against
     * @param userHome   folder that {@code ~} expands to
     * @return the normalized path
     * @throws IllegalArgumentException if the text is not a valid path
     */
    static Path resolvePath(String raw, Path workingDir, Path userHome) {
        try {
            Path path;
            if (raw.equals("~")) {
                path = userHome;
            } else if (raw.startsWith("~/") || raw.startsWith("~\\")) {
                path = userHome.resolve(raw.substring(2));
            } else {
                path = workingDir.resolve(raw);
            }
            return path.normalize();
        } catch (InvalidPathException e) {
            throw new IllegalArgumentException("Invalid path '" + raw + "'");
        }
    }

    /**
     * Splits a command line on whitespace; single or double quotes group words, so paths with
     * spaces can be typed as {@code start "my project.gsynth"}.
     *
     * @param line the command line
     * @return the words, without quotes
     * @throws IllegalArgumentException if a quote is not closed
     */
    static List<String> tokenize(String line) {
        List<String> tokens = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inToken = false;
        char quote = 0;
        for (char c : line.toCharArray()) {
            if (quote != 0) {
                if (c == quote) {
                    quote = 0;
                } else {
                    current.append(c);
                }
            } else if (c == '"' || c == '\'') {
                quote = c;
                inToken = true;
            } else if (Character.isWhitespace(c)) {
                if (inToken) {
                    tokens.add(current.toString());
                    current.setLength(0);
                    inToken = false;
                }
            } else {
                current.append(c);
                inToken = true;
            }
        }
        if (quote != 0) {
            throw new IllegalArgumentException("Missing closing quote");
        }
        if (inToken) {
            tokens.add(current.toString());
        }
        return tokens;
    }
}
