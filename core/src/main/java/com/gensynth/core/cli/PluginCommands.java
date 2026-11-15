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
import java.util.function.Function;
import java.util.function.Supplier;

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

    /** Version given to the validator when the JAR says nothing else (as the desktop does). */
    private static final String DEFAULT_VERSION = "1.0.0";

    /** Asks the user a question; null at the end of the input. */
    @FunctionalInterface
    interface Question {
        String ask(String prompt) throws IOException;
    }

    private final ISimulationManager manager;
    private final IPluginInstaller installer;
    private final PrintStream out;
    private final CliTheme theme;
    /** Resolves a path typed by the user ({@code ~} and relative paths). */
    private final Function<String, Path> paths;
    private final Question question;
    /** Stops every running simulation, printing what each one sent. */
    private final Runnable stopAll;

    /**
     * @param manager   lists the connectors and loads them again after a change
     * @param installer validates, installs and removes the plugin JARs
     * @param out       where the command writes its output
     * @param theme     colors of the output
     * @param paths     resolves the path of {@code plugins add}
     * @param question  asks for a confirmation
     * @param stopAll   stops every running simulation, printing each one
     */
    PluginCommands(ISimulationManager manager, IPluginInstaller installer, PrintStream out, CliTheme theme,
                   Function<String, Path> paths, Question question, Runnable stopAll) {
        this.manager = manager;
        this.installer = installer;
        this.out = out;
        this.theme = theme;
        this.paths = paths;
        this.question = question;
        this.stopAll = stopAll;
    }

    /**
     * @param name a file name
     * @return whether it is a JAR file, the only kind {@code plugins add} accepts
     */
    static boolean isJar(String name) {
        return name.toLowerCase(Locale.ROOT).endsWith(".jar");
    }

    /**
     * @param manager source of the connectors
     * @param id      a plugin id, in any case
     * @return the imported (not included) connector with that id, if any
     */
    static Optional<ConnectorDescriptor> imported(ISimulationManager manager, String id) {
        return manager.connectors().stream()
            .filter(connector -> connector.isExternal() && connector.getPluginId().equalsIgnoreCase(id))
            .findFirst();
    }

    /**
     * Runs {@code plugins}, {@code plugins add <file.jar>} or {@code plugins remove <id>}.
     *
     * @param args the words after {@code plugins}
     * @throws IOException if the answer cannot be read
     */
    void run(List<String> args) throws IOException {
        if (args.isEmpty()) {
            list();
            return;
        }
        String subcommand = args.get(0).toLowerCase(Locale.ROOT);
        if (args.size() != 2 || !SUBCOMMANDS.contains(subcommand)) {
            throw new IllegalArgumentException(USAGE);
        }
        if ("add".equals(subcommand)) {
            add(paths.apply(args.get(1)));
        } else {
            remove(args.get(1));
        }
    }

    private void list() {
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

    private void add(Path jar) throws IOException {
        byte[] bytes = readJar(jar);
        String fileName = String.valueOf(jar.getFileName());
        PluginValidationResult validation = installer.validate(bytes, fileName, DEFAULT_VERSION);
        if (!validation.isValid()) {
            out.println(theme.error("'" + fileName + "' cannot be imported:"));
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
                out.println(theme.warning(entry.getMessage()));
            }
        }
        if (!confirm("Install " + plugin + "?") || !apply(() -> installer.install(bytes, fileName, DEFAULT_VERSION))) {
            return;
        }
        boolean loaded = imported(manager, validation.getPluginId())
            .filter(connector -> connector.getPluginVersion().equals(validation.getPluginVersion()))
            .isPresent();
        if (!loaded) {
            out.println(theme.warning(plugin + " was copied to the plugins folder but could not be loaded: see the log"));
            return;
        }
        // Loaded fine: the desktop application must not remove it on its next start
        installer.confirmLoaded();
        out.println(theme.paint("Installed " + plugin + ".", CliTheme.SUCCESS) + " New simulations can use it now.");
        out.println("    Open GenSynth windows load it the next time they start.");
    }

    private void remove(String id) throws IOException {
        ConnectorDescriptor connector = imported(manager, id).orElseThrow(() -> new IllegalArgumentException(
            manager.connectors().stream().filter(c -> c.getPluginId().equalsIgnoreCase(id)).findFirst()
                .map(included -> included.getDisplayName() + " is included in GenSynth and cannot be removed.")
                .orElse("There is no imported plugin with id '" + id + "'. Type 'plugins' to see them.")));
        String plugin = connector.getDisplayName() + " " + connector.getPluginVersion();
        if (!confirm("Remove " + plugin + "?")
            || !apply(() -> installer.uninstall(connector.getPluginId(), connector.getPluginVersion()))) {
            return;
        }
        out.println(theme.paint("Removed " + plugin + ".", CliTheme.SUCCESS));
        out.println("    Open GenSynth windows keep it until they restart.");
    }

    /**
     * Stops the simulations, changes the plugins and loads the connectors again.
     *
     * @return whether the change succeeded (its error is printed otherwise)
     */
    private boolean apply(Supplier<PluginInstallResult> change) {
        stopAll.run();
        PluginInstallResult result = manager.changeConnectors(change);
        if (!result.isSuccess()) {
            out.println(theme.error(result.getMessage()));
        }
        return result.isSuccess();
    }

    private static byte[] readJar(Path jar) {
        if (!Files.isRegularFile(jar)) {
            throw new IllegalArgumentException("File not found: " + jar);
        }
        if (!isJar(String.valueOf(jar.getFileName()))) {
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
    private boolean confirm(String action) throws IOException {
        long running = manager.list().stream().filter(s -> s.status() == SimulationSnapshot.Status.RUNNING).count();
        if (running > 0) {
            out.println(theme.warning((running == 1 ? "The running simulation" : "The " + running + " running simulations")
                + " will be stopped to load the connectors again."));
        }
        String answer = question.ask(action + " [y/N] ");
        boolean yes = answer != null && List.of("y", "yes").contains(answer.trim().toLowerCase(Locale.ROOT));
        if (!yes) {
            out.println("Cancelled: nothing was changed.");
        }
        return yes;
    }
}
