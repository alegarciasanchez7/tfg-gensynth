package com.gensynth.core.cli;

import com.gensynth.core.api.IDesktopLauncher;
import com.gensynth.core.api.ISimulationManager;
import com.gensynth.core.model.ProjectReport;
import com.gensynth.core.model.SimulationSnapshot;
import com.gensynth.core.model.StartProblem;
import com.gensynth.core.model.TickSettings;
import com.gensynth.core.monitoring.ResourceUsage;
import org.jline.utils.AttributedStyle;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Supplier;

/**
 * Interactive shell of the {@code gensynth} command: reads one command per line and runs it
 * against a {@link ISimulationManager}. The input and output are injected so the shell can be
 * tested; what it prints is the user interface of the command, not logging.
 */
public class CliShell {

    static final String PROMPT = "gensynth> ";

    /** Commands of the help, with their description. */
    private static final String[][] HELP = {
        {"start <file.gsynth|id>", "Start a project file (quote paths with spaces), or again by its id"},
        {"see <file.gsynth>", "Show what a project contains, without running it"},
        {"edit <file.gsynth>|new", "Open a project, or a new one, in the desktop application"},
        {"stop <id> | stop all", "Stop a simulation, or every running one"},
        {"tick <id|all> [value]", "Show or change the tick: 500ms, 2s, 1m or fast"},
        {"metrics [id|all]", "Live totals, one simulation, or every simulation"},
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

    /**
     * What the shell does with the screen: the live lines of {@code metrics} and {@code clear}.
     */
    @FunctionalInterface
    public interface Screen {

        /**
         * Shows lines with live values until the user goes back to the prompt.
         *
         * @param lines builds the lines each time they are shown
         * @throws IOException if the keyboard cannot be read
         */
        void showLive(Supplier<List<String>> lines) throws IOException;

        /**
         * Clears the screen. Nothing is done without a terminal.
         */
        default void clearScreen() {
        }
    }

    private final ISimulationManager manager;
    private final LineSource in;
    private final PrintStream out;
    private final Path workingDir;
    private final Path userHome;
    private final String version;
    private CliTheme theme = CliTheme.plain();
    private IDesktopLauncher desktop;
    /** Without a terminal the lines are printed once, as they are now. */
    private Screen screen;

    /**
     * @param manager    runs the simulations
     * @param in         source of the commands (see {@link #plainInput})
     * @param out        where the shell writes its output
     * @param workingDir folder that relative paths are resolved against
     * @param userHome   folder that {@code ~} expands to
     * @param version    application version shown in the header
     */
    public CliShell(ISimulationManager manager, LineSource in, PrintStream out,
                    Path workingDir, Path userHome, String version) {
        this.manager = manager;
        this.in = in;
        this.out = out;
        this.workingDir = workingDir;
        this.userHome = userHome;
        this.version = version;
        this.screen = lines -> lines.get().forEach(out::println);
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
     * Writes to a terminal: colors (when it shows them), {@code metrics} lines refreshed in
     * place and {@code clear}.
     *
     * @param theme    colors of the output
     * @param screen   where {@code metrics} shows its lines and {@code clear} clears
     */
    void useTerminal(CliTheme theme, Screen screen) {
        this.theme = theme;
        this.screen = screen;
    }

    /**
     * @param desktop opens projects in the desktop application ({@code edit})
     */
    void useDesktop(IDesktopLauncher desktop) {
        this.desktop = desktop;
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
            String line = in.readLine(PROMPT);
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
                case "see" -> see(args);
                case "edit" -> edit(args);
                case "stop" -> stop(args);
                case "tick" -> tick(args);
                case "metrics" -> metrics(args);
                case "list" -> list(args);
                case "clear" -> clear(args);
                case "help" -> help();
                case "exit" -> {
                    return false;
                }
                default -> printError(unknownCommand(tokens.get(0)));
            }
        } catch (ProjectStartException e) {
            printCannotStart(e);
        } catch (IllegalArgumentException | IllegalStateException e) {
            printError(e.getMessage());
        } catch (IOException e) {
            printError("Cannot read the keyboard: " + e.getMessage());
        }
        return true;
    }

    private void start(List<String> args) {
        if (args.size() != 1) {
            throw new IllegalArgumentException("Usage: start <file.gsynth> | start <id>");
        }
        String target = args.get(0);
        Path file = resolvePath(target, workingDir, userHome);
        if (!Files.exists(file) && target.chars().allMatch(Character::isDigit)) {
            // An id: start again the file that ran with it
            file = simulation(Integer.parseInt(target)).configFile();
        }
        SimulationSnapshot started = manager.start(file);
        out.println(id(started) + theme.paint(" Started", CliTheme.SUCCESS)
            + String.format(" '%s' (%d groups, %d flows)", started.configFile().getFileName(),
                started.groups(), started.flows()));
        out.println("    Output folder: " + started.outputDir());
        for (String warning : started.warnings()) {
            printWarning(warning);
        }
        for (StartProblem problem : started.connectorProblems()) {
            printWarning(ProjectSummary.describe(problem));
        }
    }

    private void see(List<String> args) {
        if (args.size() != 1) {
            throw new IllegalArgumentException("Usage: see <file.gsynth>");
        }
        ProjectReport report = manager.inspect(resolvePath(args.get(0), workingDir, userHome));
        ProjectSummary.lines(report).forEach(line -> out.println(theme.paint(line)));
        if (report.problems().isEmpty()) {
            out.println(theme.paint("No problems found: it can start.", CliTheme.SUCCESS));
        }
    }

    private void edit(List<String> args) {
        if (args.size() != 1) {
            throw new IllegalArgumentException("Usage: edit <file.gsynth> | edit new");
        }
        if (desktop == null) {
            throw new IllegalStateException("The desktop application is not available here");
        }
        String target = args.get(0);
        Path file = null;
        // "new" is always the keyword: a project file must end in .gsynth
        if (!"new".equalsIgnoreCase(target)) {
            file = resolvePath(target, workingDir, userHome);
            // Same checks and messages as start, before anything opens
            SimulationManager.readProjectFile(file);
        }
        String name = file == null ? "a new project" : "'" + file.getFileName() + "'";
        IDesktopLauncher.Result result = desktop.open(file);
        out.println(result == IDesktopLauncher.Result.OPENED_IN_WINDOW
            ? "Sent " + name + " to the open GenSynth window."
            : "Opening " + name + " in GenSynth...");
        SimulationSnapshot simulation = file == null ? null : simulationOf(file);
        if (simulation == null) {
            out.println("    Save it there, then 'start <file.gsynth>' runs it.");
        } else if (simulation.status() == SimulationSnapshot.Status.RUNNING) {
            // A running file cannot start again until it stops
            out.println("    Save it there, then 'stop " + simulation.id() + "' and 'start " + simulation.id()
                + "' run the changes.");
        } else {
            out.println("    Save it there, then 'start " + simulation.id() + "' runs the changes.");
        }
    }

    /** The simulation of the file in this session, or null if it never ran. */
    private SimulationSnapshot simulationOf(Path file) {
        try {
            Path real = file.toRealPath();
            return manager.list().stream().filter(s -> s.configFile().equals(real)).findFirst().orElse(null);
        } catch (IOException e) {
            return null;
        }
    }

    private void stop(List<String> args) {
        if (args.size() != 1) {
            throw new IllegalArgumentException("Usage: stop <id> | stop all");
        }
        if (isAll(args.get(0))) {
            List<SimulationSnapshot> stopped = manager.stopAll();
            if (stopped.isEmpty()) {
                out.println("No simulation is running.");
            }
            stopped.forEach(this::printStopped);
            return;
        }
        printStopped(manager.stop(parseId(args.get(0), true)));
    }

    private void tick(List<String> args) {
        if (args.isEmpty() || args.size() > 2) {
            throw new IllegalArgumentException("Usage: tick <id|all> [value], e.g. tick 1 500ms, tick all 2s, tick 1 fast");
        }
        List<SimulationSnapshot> targets;
        if (isAll(args.get(0))) {
            targets = running();
            if (targets.isEmpty()) {
                out.println("No simulation is running.");
                return;
            }
        } else {
            targets = List.of(simulation(parseId(args.get(0), true)));
        }
        for (SimulationSnapshot target : targets) {
            if (args.size() == 1) {
                out.println(id(target) + " Tick: " + CliFormat.tick(target.tick())
                    + " (" + CliFormat.rate(target.ticksPerSecond()) + " ticks/s)");
            } else {
                TickSettings tick = CliFormat.parseTick(args.get(1), target.tick());
                SimulationSnapshot changed = manager.changeTick(target.id(), tick);
                out.println(id(changed) + " Tick set to " + CliFormat.tick(changed.tick())
                    + " (was " + CliFormat.tick(target.tick()) + ")");
            }
        }
    }

    private void metrics(List<String> args) throws IOException {
        if (args.size() > 1) {
            throw new IllegalArgumentException("Usage: metrics [id|all]");
        }
        if (args.isEmpty()) {
            screen.showLive(() -> List.of(totalMetrics()));
            return;
        }
        if (isAll(args.get(0))) {
            if (manager.list().isEmpty()) {
                out.println("No simulations yet. Use 'start <file.gsynth>' to start one.");
                return;
            }
            screen.showLive(this::allMetrics);
            return;
        }
        int id = parseId(args.get(0), true);
        // Fails now if the id does not exist, before the live line starts
        simulation(id);
        screen.showLive(() -> List.of(simulationMetrics(simulation(id), 0)));
    }

    /** One line per simulation of the session, with the file names aligned, and the totals. */
    private List<String> allMetrics() {
        List<SimulationSnapshot> simulations = manager.list();
        int nameWidth = simulations.stream().mapToInt(s -> fileName(s).length()).max().orElse(0);
        List<String> lines = new ArrayList<>();
        for (SimulationSnapshot simulation : simulations) {
            lines.add(simulationMetrics(simulation, nameWidth));
        }
        lines.add("Total: " + totalMetrics());
        return lines;
    }

    private void clear(List<String> args) {
        if (!args.isEmpty()) {
            throw new IllegalArgumentException("Usage: clear");
        }
        out.flush();
        screen.clearScreen();
    }

    /**
     * The error of an unknown command, suggesting the closest one when it looks like a typo
     * ({@code lsit} -> {@code list}).
     */
    static String unknownCommand(String typed) {
        String suggestion = null;
        int best = 3;
        for (String[] command : HELP) {
            String name = command[0].split(" ")[0];
            int distance = editDistance(typed.toLowerCase(Locale.ROOT), name);
            if (distance < best) {
                best = distance;
                suggestion = name;
            }
        }
        return "Unknown command '" + typed + "'."
            + (suggestion != null ? " Did you mean '" + suggestion + "'?" : "")
            + " Type 'help' for the list of commands.";
    }

    /** Changes (insert, delete, replace or swap two neighbours) that turn one word into the other. */
    private static int editDistance(String a, String b) {
        int[][] d = new int[a.length() + 1][b.length() + 1];
        for (int i = 0; i <= a.length(); i++) {
            for (int j = 0; j <= b.length(); j++) {
                if (i == 0 || j == 0) {
                    d[i][j] = i + j;
                    continue;
                }
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                d[i][j] = Math.min(Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1), d[i - 1][j - 1] + cost);
                if (i > 1 && j > 1 && a.charAt(i - 1) == b.charAt(j - 2) && a.charAt(i - 2) == b.charAt(j - 1)) {
                    d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
                }
            }
        }
        return d[a.length()][b.length()];
    }

    private String totalMetrics() {
        List<SimulationSnapshot> running = running();
        ResourceUsage usage = ResourceUsage.sample();
        String resources = String.format(Locale.ROOT, "CPU %.1f%% | RAM %d MB", usage.cpuPercent(), usage.usedMemoryMb());
        if (running.isEmpty()) {
            return "No simulation running | " + resources;
        }
        double rate = running.stream().mapToDouble(SimulationSnapshot::messagesPerSecond).sum();
        double network = running.stream().mapToDouble(SimulationSnapshot::networkUpPerSecond).sum();
        long sent = running.stream().mapToLong(SimulationSnapshot::messagesSent).sum();
        long errors = running.stream().mapToLong(SimulationSnapshot::errors).sum();
        return running.size() + " running | " + resources + " | NET " + CliFormat.bytes(network)
            + " | " + CliFormat.rate(rate) + " msg/s | " + CliFormat.count(sent) + " sent | "
            + CliFormat.count(errors) + " err";
    }

    /**
     * @param nameWidth width the file name is padded to, so several lines align (0 for none)
     */
    private static String simulationMetrics(SimulationSnapshot s, int nameWidth) {
        String name = fileName(s);
        String head = "[" + s.id() + "] " + name + " ".repeat(Math.max(0, nameWidth - name.length())) + " | ";
        String counters = CliFormat.count(s.messagesSent()) + " sent | " + CliFormat.count(s.errors()) + " err";
        if (s.status() != SimulationSnapshot.Status.RUNNING) {
            return head + "stopped after " + CliFormat.duration(s.uptimeMillis(s.stoppedAt())) + " | " + counters;
        }
        return head + CliFormat.duration(s.uptimeMillis(System.currentTimeMillis())) + " | "
            + CliFormat.rate(s.messagesPerSecond()) + " msg/s | " + counters + " | tick "
            + CliFormat.tick(s.tick()) + " (" + CliFormat.rate(s.ticksPerSecond()) + "/s)";
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
        out.println(theme.paint(String.format("%-4s %-8s %-9s %7s %10s %7s  %s", "ID", "STATUS", "UPTIME",
            "MSG/S", "MESSAGES", "ERRORS", "FILE"), AttributedStyle.BOLD));
        for (SimulationSnapshot s : snapshots) {
            boolean isRunning = s.status() == SimulationSnapshot.Status.RUNNING;
            out.println(theme.paint(String.format("%-4d ", s.id()), CliTheme.ACCENT)
                + theme.paint(String.format("%-8s ", s.status().name().toLowerCase(Locale.ROOT)),
                    isRunning ? CliTheme.SUCCESS : CliTheme.PLAIN)
                + String.format("%-9s %7s %10d ", CliFormat.duration(s.uptimeMillis(now)),
                    CliFormat.rate(s.messagesPerSecond()), s.messagesSent())
                + theme.paint(String.format("%7d", s.errors()), s.errors() > 0 ? CliTheme.ERROR : CliTheme.PLAIN)
                + "  " + s.configFile());
        }
    }

    private void help() {
        out.println("Commands:");
        for (String[] command : HELP) {
            out.println("  " + theme.paint(String.format("%-24s", command[0]), CliTheme.PRIMARY) + command[1]);
        }
        out.println("Press Tab to complete commands, ids and paths.");
    }

    private void exit() {
        manager.stopAll().forEach(this::printStopped);
        out.println("Bye.");
    }

    private List<SimulationSnapshot> running() {
        return manager.list().stream().filter(s -> s.status() == SimulationSnapshot.Status.RUNNING).toList();
    }

    private SimulationSnapshot simulation(int id) {
        return manager.list().stream().filter(s -> s.id() == id).findFirst()
            .orElseThrow(() -> new IllegalArgumentException("There is no simulation with id " + id));
    }

    private static String fileName(SimulationSnapshot simulation) {
        return String.valueOf(simulation.configFile().getFileName());
    }

    private static boolean isAll(String arg) {
        return "all".equalsIgnoreCase(arg);
    }

    private static int parseId(String arg, boolean allowsAll) {
        try {
            return Integer.parseInt(arg);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid id '" + arg + "': expected a number"
                + (allowsAll ? " or 'all'" : ""));
        }
    }

    private void printStopped(SimulationSnapshot stopped) {
        out.println(id(stopped) + " Stopped"
            + String.format(" '%s' after %s: %d messages sent, ", stopped.configFile().getFileName(),
                CliFormat.duration(stopped.uptimeMillis(stopped.stoppedAt())), stopped.messagesSent())
            + theme.paint(stopped.errors() + " errors", stopped.errors() > 0 ? CliTheme.ERROR : CliTheme.PLAIN));
    }

    /** Lists every reason why a project cannot start, one per line. */
    private void printCannotStart(ProjectStartException e) {
        out.println(theme.paint("Error:", CliTheme.ERROR) + " '" + e.getFileName() + "' cannot start:");
        for (StartProblem problem : e.getProblems()) {
            out.println("  - " + ProjectSummary.describe(problem));
        }
    }

    private String id(SimulationSnapshot simulation) {
        return theme.paint("[" + simulation.id() + "]", CliTheme.ACCENT);
    }

    private void printWarning(String message) {
        out.println("    " + theme.paint("Warning:", CliTheme.WARNING) + " " + message);
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
