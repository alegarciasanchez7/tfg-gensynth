package com.gensynth.core.cli;

import com.gensynth.core.api.IPluginInstaller;
import com.gensynth.core.api.ISimulationManager;
import com.gensynth.core.connectors.plugin.PluginInstallResult;
import com.gensynth.core.connectors.plugin.PluginValidationResult;
import com.gensynth.core.connectors.plugin.PluginValidationResult.ValidationEntry;
import com.gensynth.core.connectors.plugin.PluginValidationResult.ValidationLevel;
import com.gensynth.core.connectors.runtime.ConnectorDescriptor;
import com.gensynth.core.model.SimulationSnapshot;
import org.jline.utils.AttributedStyle;

import java.io.IOException;
import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * The {@code plugins} command of the shell: lists the connectors, and imports or removes
 * connector plugins as the desktop application does (same checks, same plugins folder). The
 * desktop application restarts to load them; the command line stops its simulations instead,
 * after asking, and loads the connectors again, so the next {@code start} can use them.
 */
final class PluginCommands {

    /** The subcommands, in the order of the help. */
    static final List<String> SUBCOMMANDS = List.of("add", "remove");

    static final String USAGE = "Usage: plugins | plugins add <file.jar> | plugins remove <id>";

    /** Name and version given to the validator when the JAR says nothing else (as the desktop does). */
    private static final String DEFAULT_VERSION = "1.0.0";

    /** Asks the user a question; null at the end of the input. */
    @FunctionalInterface
    interface Question {
        String ask(String prompt) throws IOException;
    }

    private final ISimulationManager manager;
    private final IPluginInstaller installer;
    private final PrintStream out;
    private final Path workingDir;
    private final Path userHome;
    private final Question question;
    /** Stops every running simulation, printing what each one sent. */
    private final Runnable stopAll;

    /**
     * @param manager   lists the connectors and loads them again after a change
     * @param installer validates, installs and removes the plugin JARs
     * @param out       where the command writes its output
     * @param workingDir folder that relative paths are resolved against
     * @param userHome  folder that {@code ~} expands to
     * @param question  asks for a confirmation
     * @param stopAll   stops every running simulation, printing each one
     */
    PluginCommands(ISimulationManager manager, IPluginInstaller installer, PrintStream out, Path workingDir,
                   Path userHome, Question question, Runnable stopAll) {
        this.manager = manager;
        this.installer = installer;
        this.out = out;
        this.workingDir = workingDir;
        this.userHome = userHome;
        this.question = question;
        this.stopAll = stopAll;
    }

    /**
     * Runs {@code plugins}, {@code plugins add <file.jar>} or {@code plugins remove <id>}.
     *
     * @param args  the words after {@code plugins}
     * @param theme colors of the output
     * @throws IOException if the answer cannot be read
     */
    void run(List<String> args, CliTheme theme) throws IOException {
        if (args.isEmpty()) {
            list(theme);
            return;
        }
        String subcommand = args.get(0).toLowerCase(Locale.ROOT);
        if (args.size() != 2 || !SUBCOMMANDS.contains(subcommand)) {
            throw new IllegalArgumentException(USAGE);
        }
        if ("add".equals(subcommand)) {
            add(CliShell.resolvePath(args.get(1), workingDir, userHome), theme);
        } else {
            remove(args.get(1), theme);
        }
    }

    private void list(CliTheme theme) {
        List<ConnectorDescriptor> connectors = manager.connectors();
        int idWidth = Math.max(4, connectors.stream().mapToInt(c -> c.getPluginId().length()).max().orElse(0));
        int nameWidth = Math.max(4, connectors.stream().mapToInt(c -> c.getDisplayName().length()).max().orElse(0));
        String format = "%-" + idWidth + "s  %-" + nameWidth + "s  %-8s  %s";
        out.println(theme.paint(String.format(format, "ID", "NAME", "VERSION", "SOURCE"), AttributedStyle.BOLD));
        for (ConnectorDescriptor connector : connectors) {
            out.println(theme.paint(String.format("%-" + idWidth + "s", connector.getPluginId()), CliTheme.ACCENT)
                + String.format("  %-" + nameWidth + "s  %-8s  ", connector.getDisplayName(), connector.getPluginVersion())
                + (connector.isExternal() ? theme.paint("imported", CliTheme.SUCCESS) : "included"));
        }
        out.println("Import a plugin with 'plugins add <file.jar>'.");
    }

    private void add(Path jar, CliTheme theme) throws IOException {
        byte[] bytes = readJar(jar);
        String fileName = String.valueOf(jar.getFileName());
        PluginValidationResult validation = installer.validate(bytes, fileName, DEFAULT_VERSION);
        if (!validation.isValid()) {
            out.println(theme.paint("Error:", CliTheme.ERROR) + " '" + fileName + "' cannot be imported:");
            validation.getErrors().forEach(error -> out.println("  - " + error));
            return;
        }

        String plugin = validation.getDisplayName() + " " + validation.getPluginVersion();
        out.println(theme.paint(plugin, AttributedStyle.BOLD) + " (id " + validation.getPluginId() + ", "
            + validation.getFieldCount() + " settings)");
        if (validation.getDescription() != null && !validation.getDescription().isBlank()) {
            out.println("    " + validation.getDescription());
        }
        for (ValidationEntry entry : validation.getLogs()) {
            if (entry.getLevel() == ValidationLevel.WARN) {
                printWarning(entry.getMessage(), theme);
            }
        }
        if (!confirm("Install " + plugin + "?", theme)) {
            return;
        }

        stopAll.run();
        PluginInstallResult result = manager.changeConnectors(
            () -> installer.install(bytes, fileName, DEFAULT_VERSION));
        if (!result.isSuccess()) {
            out.println(theme.paint("Error:", CliTheme.ERROR) + " " + result.getMessage());
            return;
        }
        boolean loaded = manager.connectors().stream().anyMatch(c -> c.isExternal()
            && c.getPluginId().equals(validation.getPluginId())
            && c.getPluginVersion().equals(validation.getPluginVersion()));
        if (!loaded) {
            printWarning(plugin + " was copied to the plugins folder but could not be loaded: see the log", theme);
            return;
        }
        // Loaded fine: the desktop application must not remove it on its next start
        installer.confirmLoaded();
        out.println(theme.paint("Installed " + plugin + ".", CliTheme.SUCCESS)
            + " New simulations can use it now.");
        out.println("    Open GenSynth windows load it the next time they start.");
    }

    private void remove(String id, CliTheme theme) throws IOException {
        List<ConnectorDescriptor> withId = manager.connectors().stream()
            .filter(c -> c.getPluginId().equalsIgnoreCase(id)).toList();
        Optional<ConnectorDescriptor> imported = withId.stream().filter(ConnectorDescriptor::isExternal).findFirst();
        if (imported.isEmpty()) {
            throw new IllegalArgumentException(withId.isEmpty()
                ? "There is no imported plugin with id '" + id + "'. Type 'plugins' to see them."
                : withId.get(0).getDisplayName() + " is included in GenSynth and cannot be removed.");
        }
        ConnectorDescriptor connector = imported.get();
        String plugin = connector.getDisplayName() + " " + connector.getPluginVersion();
        if (!confirm("Remove " + plugin + "?", theme)) {
            return;
        }

        stopAll.run();
        PluginInstallResult result = manager.changeConnectors(
            () -> installer.uninstall(connector.getPluginId(), connector.getPluginVersion()));
        if (!result.isSuccess()) {
            out.println(theme.paint("Error:", CliTheme.ERROR) + " " + result.getMessage());
            return;
        }
        out.println(theme.paint("Removed " + plugin + ".", CliTheme.SUCCESS));
        out.println("    Open GenSynth windows keep it until they restart.");
    }

    private static byte[] readJar(Path jar) {
        if (!Files.isRegularFile(jar)) {
            throw new IllegalArgumentException("File not found: " + jar);
        }
        if (!CliCompleter.isJar(String.valueOf(jar.getFileName()))) {
            throw new IllegalArgumentException("Only .jar files can be imported: " + jar.getFileName());
        }
        try {
            return Files.readAllBytes(jar);
        } catch (IOException e) {
            throw new IllegalArgumentException("Cannot read " + jar + ": " + e.getMessage(), e);
        }
    }

    /**
     * Asks before changing the plugins; the running simulations are stopped to load them again,
     * as the desktop application interrupts its flows when it restarts.
     *
     * @return whether the user answered yes
     */
    private boolean confirm(String action, CliTheme theme) throws IOException {
        long running = manager.list().stream().filter(s -> s.status() == SimulationSnapshot.Status.RUNNING).count();
        if (running > 0) {
            printWarning((running == 1 ? "The running simulation" : "The " + running + " running simulations")
                + " will be stopped to load the connectors again.", theme);
        }
        String answer = question.ask(action + " [y/N] ");
        boolean yes = answer != null && List.of("y", "yes").contains(answer.trim().toLowerCase(Locale.ROOT));
        if (!yes) {
            out.println("Cancelled: nothing was changed.");
        }
        return yes;
    }

    private void printWarning(String message, CliTheme theme) {
        out.println("    " + theme.paint("Warning:", CliTheme.WARNING) + " " + message);
    }
}
