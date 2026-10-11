package com.gensynth.core.cli;

import com.gensynth.core.config.AppPaths;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import org.jline.terminal.Terminal;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.Console;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Entry point of the {@code gensynth} command: an interactive shell that starts and stops
 * project files headlessly, without the desktop window. It opens no network port and does not
 * touch the desktop autosave, so it can run next to the desktop application.
 */
public final class CliMain {

    /** slf4j-simple setting with the file that receives the log (stderr by default). */
    private static final String LOG_FILE_PROPERTY = "org.slf4j.simpleLogger.logFile";
    /** System property set by every jpackage launcher with the application version. */
    private static final String VERSION_PROPERTY = "jpackage.app-version";

    private CliMain() {
    }

    /**
     * Starts the shell. Arguments other than {@code --help} and {@code --version} are ignored:
     * the launcher inherits the default arguments of the desktop launcher.
     *
     * @param args command line arguments
     */
    public static void main(String[] args) {
        String version = System.getProperty(VERSION_PROPERTY, "dev");
        for (String arg : args) {
            if ("--version".equals(arg)) {
                System.out.println("GenSynth " + version);
                return;
            }
            if ("--help".equals(arg)) {
                System.out.println("Usage: gensynth");
                System.out.println("Opens the GenSynth command line. Type 'help' inside it for the list of commands.");
                return;
            }
        }

        // Must run before the first logger is created: slf4j-simple reads its settings once
        PrintStream console = redirectLogToFile();

        Path workingDir = Paths.get(System.getProperty("user.dir"));
        Path userHome = Paths.get(System.getProperty("user.home"));
        // Marks where each session starts, as the log keeps the previous ones
        LoggerFactory.getLogger(CliMain.class).info("GenSynth {} command line started in {}", version, workingDir);
        SimulationManager manager = new SimulationManager();
        Terminal systemTerminal = openTerminal();
        TerminalInput terminal = null;
        StatusPanel panel = null;
        CliShell shell;
        if (systemTerminal != null) {
            // NO_COLOR (https://no-color.org) keeps line editing and Tab, without colors or panel
            boolean colors = System.getenv("NO_COLOR") == null;
            CliTheme theme = colors ? CliTheme.colored(systemTerminal) : CliTheme.plain();
            ProjectFileCheck projects = new ProjectFileCheck();
            terminal = new TerminalInput(systemTerminal,
                new CliCompleter(manager, workingDir, userHome, theme, projects),
                colors ? new CliHighlighter(manager, projects, workingDir, userHome) : null);
            shell = new CliShell(manager, terminal, System.out, workingDir, userHome, version);
            if (colors) {
                panel = StatusPanel.open(systemTerminal, terminal.reader(), manager);
                shell.useTerminal(theme, panel);
            }
        } else {
            shell = new CliShell(manager, CliShell.plainInput(plainReader(), System.out), System.out,
                workingDir, userHome, version);
        }
        // Ctrl+C while a command runs: restore the screen and stop the simulations so their
        // connectors are closed cleanly
        StatusPanel openPanel = panel;
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            if (openPanel != null) {
                openPanel.close();
            }
            manager.shutdown();
        }, "gensynth-cli-shutdown"));

        int exitCode = 0;
        try {
            shell.run();
        } catch (IOException e) {
            console.println("Error reading the input: " + e.getMessage());
            exitCode = 1;
        } finally {
            if (panel != null) {
                panel.close();
            }
            manager.shutdown();
            closeTerminal(terminal);
        }
        // Plugin client libraries may leave non-daemon threads behind
        System.exit(exitCode);
    }

    /**
     * Opens the terminal for line editing, Tab completion, colors and the status panel.
     *
     * @return the terminal, or null when the input is not a terminal (a pipe or a file) or the
     *         terminal cannot be opened; the shell then reads plain lines
     */
    private static Terminal openTerminal() {
        if (System.console() == null) {
            return null;
        }
        try {
            return TerminalInput.openSystemTerminal();
        } catch (IOException | RuntimeException e) {
            LoggerFactory.getLogger(CliMain.class).warn("Line editing not available, reading plain lines", e);
            return null;
        }
    }

    private static BufferedReader plainReader() {
        Console console = System.console();
        Charset charset = console != null ? console.charset() : Charset.defaultCharset();
        return new BufferedReader(new InputStreamReader(System.in, charset));
    }

    private static void closeTerminal(TerminalInput terminal) {
        if (terminal == null) {
            return;
        }
        try {
            terminal.close();
        } catch (IOException e) {
            LoggerFactory.getLogger(CliMain.class).warn("Could not restore the terminal", e);
        }
    }

    /**
     * Sends the log to {@code <data folder>/logs/cli.log} so it does not mix with the shell,
     * unless a log file is already configured. Each session is added at the end of the file.
     * <p>
     * slf4j-simple can only overwrite a log file, so the file is opened here in append mode and
     * becomes the standard error stream, which slf4j-simple then writes to. Whatever a library
     * prints to the standard error also ends up in the log instead of in the shell.
     *
     * @return the original standard error, for the messages meant for the user
     */
    private static PrintStream redirectLogToFile() {
        PrintStream console = System.err;
        if (System.getProperty(LOG_FILE_PROPERTY) != null) {
            return console;
        }
        Path logFile = AppPaths.current().dataHome().resolve("logs").resolve("cli.log");
        try {
            System.setErr(openAppending(logFile));
        } catch (IOException e) {
            // Keep the default (stderr) rather than failing to start
            return console;
        }
        System.setProperty(LOG_FILE_PROPERTY, "System.err");
        System.setProperty("org.slf4j.simpleLogger.showDateTime", "true");
        System.setProperty("org.slf4j.simpleLogger.dateTimeFormat", "yyyy-MM-dd HH:mm:ss.SSS");
        // The engine logs message previews at INFO (up to 4 per second and flow): keep only its
        // warnings and errors, or the file would keep growing during a long simulation
        System.setProperty("org.slf4j.simpleLogger.log." + UiBridgeWebSocketServer.class.getName(), "warn");
        return console;
    }

    /**
     * @param logFile the log file, created with its folder if missing
     * @return a stream that writes at the end of the file
     * @throws IOException if the file cannot be opened
     */
    static PrintStream openAppending(Path logFile) throws IOException {
        Files.createDirectories(logFile.getParent());
        return new PrintStream(new FileOutputStream(logFile.toFile(), true), true, StandardCharsets.UTF_8);
    }
}
