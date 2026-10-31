package com.gensynth.core.update;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;

/**
 * Kind of installer this system uses, as published in each release
 * ({@code GenSynth-installer-<version>.<extension>}), and how to run it.
 * Commands use fixed absolute paths, never {@code PATH}, like {@code ExternalLinkOpener}.
 */
public enum InstallerType {
    /** Windows installer, run with {@code msiexec}; it replaces the previous version. */
    MSI("msi", true),
    /** Debian/Ubuntu package, installed with {@code apt-get} through {@code pkexec}. */
    DEB("deb", false),
    /** Fedora/openSUSE package, installed with {@code dnf} (or {@code rpm}) through {@code pkexec}. */
    RPM("rpm", false),
    /** macOS disk image (Apple Silicon), opened so the user drags the app to Applications. */
    DMG("dmg", true);

    /** Grants administrator rights to the Linux package manager, asking for the user's password. */
    public static final String PKEXEC = "/usr/bin/pkexec";

    private final String extension;
    private final boolean closesAppFirst;

    InstallerType(String extension, boolean closesAppFirst) {
        this.extension = extension;
        this.closesAppFirst = closesAppFirst;
    }

    /**
     * @return file extension of the installer, without the dot
     */
    public String extension() {
        return extension;
    }

    /**
     * Windows locks the files of the running application and macOS replaces the whole app
     * bundle, so GenSynth closes before the installer runs. On Linux the package manager runs
     * while GenSynth is open ({@code pkexec} refuses to run once its parent process has ended),
     * and GenSynth restarts afterwards.
     *
     * @return true if the application must close before the installer runs
     */
    public boolean closesAppFirst() {
        return closesAppFirst;
    }

    /**
     * Finds the installer type of this system.
     *
     * @param osName          value of {@code os.name}
     * @param osArch          value of {@code os.arch}
     * @param commandSucceeds runs a command and tells whether it exited with 0 (used on Linux to
     *                        ask which package manager installed GenSynth)
     * @return the installer type, or empty if releases have no installer for this system
     */
    public static Optional<InstallerType> detect(String osName, String osArch, Predicate<List<String>> commandSucceeds) {
        String os = osName == null ? "" : osName.toLowerCase(Locale.ROOT);
        String arch = osArch == null ? "" : osArch.toLowerCase(Locale.ROOT);
        if (os.contains("win")) {
            return Optional.of(MSI);
        }
        if (os.contains("mac")) {
            // Releases only include an Apple Silicon disk image
            return arch.equals("aarch64") || arch.equals("arm64") ? Optional.of(DMG) : Optional.empty();
        }
        if (os.contains("linux")) {
            if (commandSucceeds.test(List.of("/usr/bin/dpkg-query", "-W", "gensynth"))) {
                return Optional.of(DEB);
            }
            if (commandSucceeds.test(List.of("/usr/bin/rpm", "-q", "gensynth"))) {
                return Optional.of(RPM);
            }
        }
        return Optional.empty();
    }

    /**
     * Builds the command that installs the downloaded installer.
     *
     * @param installer the downloaded installer
     * @param env       environment variables (Windows: {@code SystemRoot})
     * @param exists    tells whether a program exists (Linux: {@code dnf} or only {@code rpm})
     * @return the command and its arguments
     */
    public List<String> installCommand(Path installer, Map<String, String> env, Predicate<Path> exists) {
        String file = installer.toAbsolutePath().toString();
        List<String> command = new ArrayList<>();
        switch (this) {
            case MSI -> {
                String systemRoot = env.getOrDefault("SystemRoot", "C:\\Windows");
                command.add(Paths.get(systemRoot, "System32", "msiexec.exe").toString());
                command.add("/i");
            }
            case DMG -> command.add("/usr/bin/open");
            case DEB -> command.addAll(List.of(PKEXEC, "/usr/bin/apt-get", "install", "-y"));
            case RPM -> {
                command.add(PKEXEC);
                if (exists.test(Paths.get("/usr/bin/dnf"))) {
                    command.addAll(List.of("/usr/bin/dnf", "install", "-y"));
                } else {
                    command.addAll(List.of("/usr/bin/rpm", "-U"));
                }
            }
        }
        command.add(file);
        return command;
    }

    /**
     * Builds the install command for this computer.
     *
     * @param installer the downloaded installer
     * @return the command and its arguments
     */
    public List<String> installCommand(Path installer) {
        return installCommand(installer, System.getenv(), Files::isExecutable);
    }
}
