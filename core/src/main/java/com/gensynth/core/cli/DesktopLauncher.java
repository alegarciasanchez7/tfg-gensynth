package com.gensynth.core.cli;

import com.gensynth.core.api.IDesktopLauncher;
import com.gensynth.core.api.IOpenWindowClient;
import com.gensynth.core.config.AppConfig;
import com.gensynth.core.config.AppPaths;
import com.gensynth.core.ws.OpenProjectClient;

import java.awt.GraphicsEnvironment;
import java.io.File;
import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.BooleanSupplier;

/**
 * Opens projects in the desktop application for the {@code edit} command: first in the window
 * that is already open (REQUEST_OPEN_PROJECT, see {@link OpenProjectClient}), otherwise in a new
 * one started as a separate process. The new window outlives the command line: it starts out of
 * its terminal, so {@code Ctrl + C} or closing the terminal does not close it (see
 * {@link #command}).
 */
public class DesktopLauncher implements IDesktopLauncher {

    /** Starts the desktop application; replaced in the tests. */
    @FunctionalInterface
    interface ProcessStarter {

        /**
         * @param command the command line of the desktop application
         * @throws IOException if it cannot be started
         */
        void start(List<String> command) throws IOException;
    }

    private static final long ANSWER_TIMEOUT_MILLIS = 2000;
    private static final String MAIN_CLASS = "com.gensynth.core.App";
    /** Where Linux distributions install setsid (util-linux). */
    private static final List<String> SETSID_PATHS = List.of("/usr/bin/setsid", "/bin/setsid");

    private final IOpenWindowClient openWindow;
    private final BooleanSupplier headless;
    private final ProcessStarter starter;

    /**
     * Talks to the desktop application on its usual address and starts it from this
     * installation (or from the source build in development).
     */
    public DesktopLauncher() {
        this(new OpenProjectClient(new AppConfig().getWebsocketHost(), new AppConfig().getWebsocketPort(),
            ANSWER_TIMEOUT_MILLIS), GraphicsEnvironment::isHeadless, DesktopLauncher::startDetached);
    }

    /**
     * @param openWindow asks an open desktop application to open the project
     * @param headless   tells whether there is no graphical display to open a window on
     * @param starter    starts a new desktop application
     */
    DesktopLauncher(IOpenWindowClient openWindow, BooleanSupplier headless, ProcessStarter starter) {
        this.openWindow = openWindow;
        this.headless = headless;
        this.starter = starter;
    }

    @Override
    public Result open(Path projectFile) {
        String filePath = projectFile == null ? null : projectFile.toAbsolutePath().normalize().toString();
        if (openWindow.requestOpen(filePath) == IOpenWindowClient.Outcome.SENT) {
            return Result.OPENED_IN_WINDOW;
        }
        if (headless.getAsBoolean()) {
            throw new IllegalStateException("No graphical display: the desktop application cannot open here."
                + " Edit the project on a computer with a desktop and copy it here");
        }
        String cliLauncher = System.getProperty(AppPaths.LAUNCHER_PROPERTY);
        String osName = System.getProperty("os.name", "");
        if (cliLauncher != null) {
            // Checked here: on Linux and macOS it starts on its own, where a missing launcher
            // would fail without a word
            Path desktopLauncher = desktopLauncher(cliLauncher, osName);
            if (!Files.isRegularFile(desktopLauncher)) {
                throw new IllegalStateException("Cannot find the GenSynth application at " + desktopLauncher);
            }
        }
        String setsid = SETSID_PATHS.stream().filter(path -> Files.isExecutable(Paths.get(path))).findFirst().orElse(null);
        List<String> command = command(cliLauncher, osName, System.getProperty("java.home"),
            ManagementFactory.getRuntimeMXBean().getInputArguments(), System.getProperty("java.class.path"),
            setsid, filePath);
        try {
            starter.start(command);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot start GenSynth: " + e.getMessage(), e);
        }
        return Result.LAUNCHED;
    }

    /**
     * Builds the command that starts the desktop application, out of the terminal of the
     * command line: {@code Ctrl + C} or closing the terminal reach every process started from it,
     * the embedded browser's helper processes included, which would break the window.
     * <ul>
     *   <li>Windows: the launcher has no console (javaw from the source build), so it never gets
     *       the console's {@code Ctrl + C}.</li>
     *   <li>Linux: in a session of its own with {@code setsid}.</li>
     *   <li>macOS installation: {@code open -a}, which starts it like the Finder does.</li>
     *   <li>Otherwise (macOS from the source build, or no {@code setsid}): in the background with
     *       {@code nohup}, which keeps at least the JVM alive.</li>
     * </ul>
     *
     * @param cliLauncher path of the command line launcher of an installation
     *                    ({@code jpackage.app-path}), or null when running from the source build
     * @param osName      name of the operating system
     * @param javaHome    Java of this process, used from the source build
     * @param jvmArgs     options of this JVM, kept from the source build (e.g. {@code gensynth.home})
     * @param classPath   class path of this process, used from the source build
     * @param setsid      path of {@code setsid}, or null when it is not installed
     * @param openFile    absolute path of the project file, or null for a new project
     * @return the command
     */
    static List<String> command(String cliLauncher, String osName, String javaHome, List<String> jvmArgs,
                                String classPath, String setsid, String openFile) {
        String os = osName.toLowerCase(Locale.ROOT);
        boolean windows = os.startsWith("windows");
        List<String> args = new ArrayList<>();
        // It needs --desktop explicitly: any argument replaces the launcher's default ones
        args.add("--desktop");
        if (openFile != null) {
            args.add("--open");
            args.add(openFile);
        }

        if (cliLauncher != null && os.startsWith("mac")) {
            // .../GenSynth.app/Contents/MacOS/GenSynth
            Path bundle = desktopLauncher(cliLauncher, osName).getParent().getParent().getParent();
            if (bundle != null && bundle.toString().endsWith(".app")) {
                List<String> command = new ArrayList<>(List.of("/usr/bin/open", "-n", "-a", bundle.toString(), "--args"));
                command.addAll(args);
                return command;
            }
        }

        List<String> app = new ArrayList<>();
        if (cliLauncher != null) {
            app.add(desktopLauncher(cliLauncher, osName).toString());
        } else {
            app.add(Paths.get(javaHome, "bin", windows ? "javaw" : "java").toString());
            for (String arg : jvmArgs) {
                // A debugger port would clash with the one of this process
                if (!arg.startsWith("-agentlib:jdwp") && !arg.startsWith("-Xrunjdwp")) {
                    app.add(arg);
                }
            }
            app.add("-cp");
            app.add(classPath);
            app.add(MAIN_CLASS);
        }
        app.addAll(args);
        if (windows) {
            return app;
        }
        List<String> detached = new ArrayList<>();
        if (os.startsWith("linux") && setsid != null) {
            detached.add(setsid);
        } else {
            detached.addAll(List.of("/bin/sh", "-c", "nohup \"$@\" >/dev/null 2>&1 &", "gensynth"));
        }
        detached.addAll(app);
        return detached;
    }

    /**
     * The desktop launcher sits next to the command line one in every installer (Windows: the
     * installation folder; Linux: {@code /opt/gensynth/bin}; macOS: {@code Contents/MacOS}).
     * Links are followed first: on Linux the command line is reached through
     * {@code /usr/bin/gensynth}.
     */
    static Path desktopLauncher(String cliLauncher, String osName) {
        Path cli = Paths.get(cliLauncher);
        try {
            cli = cli.toRealPath();
        } catch (IOException e) {
            // Not there (e.g. in the tests): use it as given
        }
        boolean windows = osName.toLowerCase(Locale.ROOT).startsWith("windows");
        return cli.resolveSibling(windows ? "GenSynth.exe" : "GenSynth");
    }

    private static void startDetached(List<String> command) throws IOException {
        ProcessBuilder builder = new ProcessBuilder(command)
            .redirectOutput(ProcessBuilder.Redirect.DISCARD)
            .redirectError(ProcessBuilder.Redirect.DISCARD)
            .redirectInput(ProcessBuilder.Redirect.from(new File(
                System.getProperty("os.name", "").toLowerCase(Locale.ROOT).startsWith("windows") ? "NUL" : "/dev/null")));
        // Not waited for: the window lives on its own
        builder.start();
    }
}
