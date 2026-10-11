package com.gensynth.core.cli;

import com.gensynth.core.config.AppPaths;
import com.gensynth.core.ws.UiBridgeWebSocketServer;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.Console;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
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
        redirectLogToFile();

        SimulationManager manager = new SimulationManager();
        // Ctrl+C: stop the simulations so their connectors are closed cleanly
        Runtime.getRuntime().addShutdownHook(new Thread(manager::shutdown, "gensynth-cli-shutdown"));

        Path workingDir = Paths.get(System.getProperty("user.dir"));
        Path userHome = Paths.get(System.getProperty("user.home"));
        TerminalInput terminal = openTerminal(new CliCompleter(manager, workingDir, userHome));
        CliShell.LineSource input = terminal != null ? terminal : CliShell.plainInput(plainReader(), System.out);
        CliShell shell = new CliShell(manager, input, System.out, workingDir, userHome, version);
        int exitCode = 0;
        try {
            shell.run();
        } catch (IOException e) {
            System.err.println("Error reading the input: " + e.getMessage());
            exitCode = 1;
        } finally {
            manager.shutdown();
            closeTerminal(terminal);
        }
        // Plugin client libraries may leave non-daemon threads behind
        System.exit(exitCode);
    }

    /**
     * Opens the terminal with line editing and Tab completion.
     *
     * @return the terminal, or null when the input is not a terminal (a pipe or a file) or the
     *         terminal cannot be opened; the shell then reads plain lines
     */
    private static TerminalInput openTerminal(CliCompleter completer) {
        if (System.console() == null) {
            return null;
        }
        try {
            return TerminalInput.open(completer);
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
     * unless a log file is already configured.
     */
    private static void redirectLogToFile() {
        if (System.getProperty(LOG_FILE_PROPERTY) != null) {
            return;
        }
        Path logFile = AppPaths.current().dataHome().resolve("logs").resolve("cli.log");
        try {
            Files.createDirectories(logFile.getParent());
        } catch (IOException e) {
            // Keep the default (stderr) rather than failing to start
            return;
        }
        System.setProperty(LOG_FILE_PROPERTY, logFile.toString());
        System.setProperty("org.slf4j.simpleLogger.showDateTime", "true");
        System.setProperty("org.slf4j.simpleLogger.dateTimeFormat", "yyyy-MM-dd HH:mm:ss.SSS");
        // The engine logs message previews at INFO (up to 4 per second and flow): keep only its
        // warnings and errors, or the file would keep growing during a long simulation
        System.setProperty("org.slf4j.simpleLogger.log." + UiBridgeWebSocketServer.class.getName(), "warn");
    }
}
