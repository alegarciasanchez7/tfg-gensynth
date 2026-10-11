package com.gensynth.core.cli;

import com.gensynth.core.api.ISimulationManager;
import com.gensynth.core.model.SimulationSnapshot;

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
 * against a {@link ISimulationManager}. The streams are injected so the shell can be tested;
 * what it prints is the user interface of the command, not logging.
 */
public class CliShell {

    static final String PROMPT = "gensynth> ";

    private static final String HELP = """
        Commands:
          start <file.gsynth>   Start a project file (quote paths with spaces)
          stop <id>             Stop the simulation with that id
          stop all              Stop every running simulation
          list                  Show the simulations of this session
          help                  Show this help
          exit                  Stop every simulation and leave
        """;

    private final ISimulationManager manager;
    private final BufferedReader in;
    private final PrintStream out;
    private final Path workingDir;
    private final Path userHome;
    private final String version;

    /**
     * @param manager    runs the simulations
     * @param in         source of the commands
     * @param out        where the shell writes its output
     * @param workingDir folder that relative paths are resolved against
     * @param userHome   folder that {@code ~} expands to
     * @param version    application version shown in the banner
     */
    public CliShell(ISimulationManager manager, BufferedReader in, PrintStream out,
                    Path workingDir, Path userHome, String version) {
        this.manager = manager;
        this.in = in;
        this.out = out;
        this.workingDir = workingDir;
        this.userHome = userHome;
        this.version = version;
    }

    /**
     * Runs the shell until {@code exit} or the end of the input, then stops every simulation
     * that is still running.
     *
     * @throws IOException if the input cannot be read
     */
    public void run() throws IOException {
        out.println("GenSynth " + version + " command line. Type 'help' for the list of commands.");
        boolean keepGoing = true;
        while (keepGoing) {
            out.print(PROMPT);
            out.flush();
            String line = in.readLine();
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
                case "help" -> out.print(HELP);
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
        SimulationSnapshot started = manager.start(resolvePath(args.get(0)));
        out.printf("[%d] Started '%s' (%d groups, %d flows)%n", started.id(),
            started.configFile().getFileName(), started.groups(), started.flows());
        for (String error : started.connectorErrors()) {
            out.println("    Warning: connector failed in " + error);
        }
    }

    private void stop(List<String> args) {
        if (args.size() != 1) {
            throw new IllegalArgumentException("Usage: stop <id> | stop all");
        }
        if ("all".equalsIgnoreCase(args.get(0))) {
            List<SimulationSnapshot> stopped = manager.stopAll();
            if (stopped.isEmpty()) {
                out.println("No simulation is running.");
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
            out.println("No simulations yet. Use 'start <file.gsynth>' to start one.");
            return;
        }
        long now = System.currentTimeMillis();
        out.printf("%-4s %-8s %-9s %10s %7s  %s%n", "ID", "STATUS", "UPTIME", "MESSAGES", "ERRORS", "FILE");
        for (SimulationSnapshot s : snapshots) {
            out.printf("%-4d %-8s %-9s %10d %7d  %s%n", s.id(), s.status().name().toLowerCase(Locale.ROOT),
                formatDuration(s.uptimeMillis(now)), s.messagesSent(), s.errors(), s.configFile());
        }
    }

    private void exit() {
        manager.stopAll().forEach(this::printStopped);
        out.println("Bye.");
    }

    private void printStopped(SimulationSnapshot stopped) {
        out.printf("[%d] Stopped '%s' after %s: %d messages sent, %d errors%n", stopped.id(),
            stopped.configFile().getFileName(), formatDuration(stopped.uptimeMillis(stopped.stoppedAt())),
            stopped.messagesSent(), stopped.errors());
    }

    private void printError(String message) {
        out.println("Error: " + message);
    }

    /**
     * Resolves a path typed by the user: {@code ~} is the user's home and relative paths start
     * at the folder where {@code gensynth} was launched.
     */
    Path resolvePath(String raw) {
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

    static String formatDuration(long millis) {
        long seconds = Math.max(0, millis) / 1000;
        return String.format("%02d:%02d:%02d", seconds / 3600, (seconds / 60) % 60, seconds % 60);
    }
}
