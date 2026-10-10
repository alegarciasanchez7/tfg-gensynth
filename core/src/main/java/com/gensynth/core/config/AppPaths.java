package com.gensynth.core.config;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;
import java.util.function.UnaryOperator;

/**
 * Single source of truth for the folders GenSynth reads and writes.
 *
 * <p>Two modes:
 * <ul>
 *   <li><b>Installed</b> (started by the jpackage launcher, which sets {@code jpackage.app-path}):
 *       the installation folder is read-only, so internal data goes to the standard per-user
 *       folder of the OS and the generated files to {@code ~/GenSynth}.</li>
 *   <li><b>Development</b> (started with {@code java -cp ...}): everything stays relative to the
 *       working directory ({@code core/}), as it always has.</li>
 * </ul>
 * The {@code gensynth.home} system property overrides the data and output folders in both modes.
 */
public final class AppPaths {

    /** System property that forces the data and output folder. */
    public static final String HOME_PROPERTY = "gensynth.home";
    /** System property with the folder of the installed application JARs (jpackage {@code $APPDIR}). */
    public static final String APP_DIR_PROPERTY = "gensynth.appdir";
    /** System property set by every jpackage launcher: the path of the launcher executable. */
    public static final String LAUNCHER_PROPERTY = "jpackage.app-path";

    /** Marker of a plugin installation waiting to be confirmed by a successful start. */
    public static final String PENDING_INSTALL_MARKER = ".pending_install.json";
    /** Report of an automatic plugin rollback, shown once by the UI. */
    public static final String ROLLBACK_REPORT = ".rollback_report.json";

    private static final String OUTPUT_DIR_PREFIX = "OUTPUT_FILES_";

    private static volatile AppPaths current;

    private final boolean installed;
    private final Path dataHome;
    private final Path outputsHome;
    private final Path sharedLibsDir;

    private AppPaths(boolean installed, Path dataHome, Path outputsHome, Path sharedLibsDir) {
        this.installed = installed;
        this.dataHome = dataHome;
        this.outputsHome = outputsHome;
        this.sharedLibsDir = sharedLibsDir;
    }

    /**
     * @return the folders of the running process, resolved once from the system properties and
     *         the environment
     */
    public static AppPaths current() {
        AppPaths paths = current;
        if (paths == null) {
            synchronized (AppPaths.class) {
                paths = current;
                if (paths == null) {
                    paths = resolve(System.getProperty("os.name", ""), System.getenv(), System::getProperty);
                    current = paths;
                }
            }
        }
        return paths;
    }

    /**
     * Resolves the folders for the given platform. Exposed for tests, which cannot change the
     * real OS or environment.
     *
     * @param osName     value of the {@code os.name} property
     * @param env        environment variables
     * @param properties system property lookup (returns null when unset)
     * @return the resolved folders
     */
    static AppPaths resolve(String osName, Map<String, String> env, UnaryOperator<String> properties) {
        boolean installed = properties.apply(LAUNCHER_PROPERTY) != null;
        Path userHome = Paths.get(properties.apply("user.home"));
        Path workingDir = Paths.get(properties.apply("user.dir"));
        String homeOverride = properties.apply(HOME_PROPERTY);

        Path dataHome;
        Path outputsHome;
        if (homeOverride != null && !homeOverride.isBlank()) {
            dataHome = Paths.get(homeOverride).toAbsolutePath();
            outputsHome = dataHome;
        } else if (installed) {
            dataHome = osDataHome(osName, env, userHome);
            outputsHome = userHome.resolve("GenSynth");
        } else {
            dataHome = workingDir;
            outputsHome = workingDir;
        }

        // Installed: the libraries are jpackage "app content", which every OS places next to
        // $APPDIR (outside the classpath, so only the plugins load them)
        String appDir = properties.apply(APP_DIR_PROPERTY);
        Path sharedLibsDir = (installed && appDir != null && !appDir.isBlank())
            ? Paths.get(appDir).toAbsolutePath().getParent().resolve("shared")
            : workingDir.resolve("lib").resolve("shared");

        return new AppPaths(installed, dataHome, outputsHome, sharedLibsDir);
    }

    private static Path osDataHome(String osName, Map<String, String> env, Path userHome) {
        String os = osName.toLowerCase(Locale.ROOT);
        if (os.contains("win")) {
            String localAppData = env.get("LOCALAPPDATA");
            Path base = (localAppData != null && !localAppData.isBlank())
                ? Paths.get(localAppData)
                : userHome.resolve("AppData").resolve("Local");
            return base.resolve("GenSynth");
        }
        if (os.contains("mac") || os.contains("darwin")) {
            return userHome.resolve("Library").resolve("Application Support").resolve("GenSynth");
        }
        // Linux and other Unix systems: XDG Base Directory specification
        String xdgDataHome = env.get("XDG_DATA_HOME");
        Path base = (xdgDataHome != null && Paths.get(xdgDataHome).isAbsolute())
            ? Paths.get(xdgDataHome)
            : userHome.resolve(".local").resolve("share");
        return base.resolve("gensynth");
    }

    /**
     * @return true when running from an installed application (jpackage launcher)
     */
    public boolean isInstalled() {
        return installed;
    }

    /**
     * @return root of the internal, user-writable data (plugins, autosave, embedded browser)
     */
    public Path dataHome() {
        return dataHome;
    }

    /**
     * @return folder of the installed connector plugin JARs and their install markers
     */
    public Path pluginsDir() {
        return dataHome.resolve("plugins");
    }

    /**
     * @return marker file of a plugin installation that is not confirmed yet
     */
    public Path pendingInstallMarker() {
        return pluginsDir().resolve(PENDING_INSTALL_MARKER);
    }

    /**
     * @return report file of the last automatic plugin rollback
     */
    public Path rollbackReport() {
        return pluginsDir().resolve(ROLLBACK_REPORT);
    }

    /**
     * @return folder of the autosaved project state
     */
    public Path stateDir() {
        return dataHome.resolve("state");
    }

    /**
     * @return folder where the embedded browser (JCEF/Chromium) is installed, with its cache
     */
    public Path jcefDir() {
        return dataHome.resolve("jcef-bundle");
    }

    /**
     * @return folder where the output folders of each session are created
     */
    public Path outputsHome() {
        return outputsHome;
    }

    /**
     * @return read-only folder of the client libraries shared with the plugins
     */
    public Path sharedLibsDir() {
        return sharedLibsDir;
    }

    /**
     * Builds the output folder of a new session, named after the current date and time.
     *
     * @return absolute path of the session output folder (not created yet)
     */
    public String newSessionOutputDir() {
        String timestamp = new SimpleDateFormat("yyyy_MM_dd_HH_mm_ss").format(new Date());
        return outputsHome.resolve(OUTPUT_DIR_PREFIX + timestamp).toAbsolutePath().toString();
    }
}
