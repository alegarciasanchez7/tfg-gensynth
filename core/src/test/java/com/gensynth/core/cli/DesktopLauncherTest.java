package com.gensynth.core.cli;

import com.gensynth.core.api.IDesktopLauncher;
import com.gensynth.core.api.IOpenWindowClient;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.*;

public class DesktopLauncherTest {

    private static final List<String> NOHUP = List.of("/bin/sh", "-c", "nohup \"$@\" >/dev/null 2>&1 &", "gensynth");

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    @Test
    public void linuxStartsTheDesktopLauncherInASessionOfItsOwn() {
        Path cli = Paths.get("opt", "gensynth", "bin", "gensynth-cli").toAbsolutePath();
        String gui = cli.resolveSibling("GenSynth").toString();

        assertEquals(List.of("/usr/bin/setsid", gui, "--desktop", "--open", "/p/a.gsynth"),
            DesktopLauncher.command(cli.toString(), "Linux", "/jdk", List.of(), "cp", "/usr/bin/setsid", "/p/a.gsynth"));

        // Without setsid, at least in the background with nohup
        List<String> fallback = new ArrayList<>(NOHUP);
        fallback.addAll(List.of(gui, "--desktop"));
        assertEquals(fallback, DesktopLauncher.command(cli.toString(), "Linux", "/jdk", List.of(), "cp", null, null));
    }

    @Test
    public void macOsStartsTheApplicationLikeTheFinder() {
        Path cli = Paths.get("Applications", "GenSynth.app", "Contents", "MacOS", "gensynth-cli").toAbsolutePath();
        String bundle = cli.getParent().getParent().getParent().toString();

        assertEquals(List.of("/usr/bin/open", "-n", "-a", bundle, "--args", "--desktop", "--open", "/p/a.gsynth"),
            DesktopLauncher.command(cli.toString(), "Mac OS X", "/jdk", List.of(), "cp", null, "/p/a.gsynth"));
    }

    @Test
    public void windowsStartsTheDesktopLauncherDirectly() {
        // It has no console: the console's Ctrl + C never reaches it
        Path cli = Paths.get("GenSynth", "gensynth-cli.exe").toAbsolutePath();

        assertEquals(List.of(cli.resolveSibling("GenSynth.exe").toString(), "--desktop"),
            DesktopLauncher.command(cli.toString(), "Windows 11", "/jdk", List.of(), "cp", null, null));
    }

    @Test
    public void fromTheSourceBuildTheSameJavaRunsTheApplication() {
        String javaHome = Paths.get("jdk").toAbsolutePath().toString();
        List<String> jvmArgs = List.of("-Dgensynth.home=/core", "-agentlib:jdwp=transport=dt_socket,address=5005", "-Xmx512m");

        assertEquals(List.of("/usr/bin/setsid", Paths.get(javaHome, "bin", "java").toString(), "-Dgensynth.home=/core",
                "-Xmx512m", "-cp", "classes:libs", "com.gensynth.core.App", "--desktop"),
            DesktopLauncher.command(null, "Linux", javaHome, jvmArgs, "classes:libs", "/usr/bin/setsid", null));

        // macOS from the source build has no bundle to open: in the background with nohup
        List<String> mac = DesktopLauncher.command(null, "Mac OS X", javaHome, List.of(), "classes:libs", null, null);
        assertEquals(NOHUP, mac.subList(0, NOHUP.size()));

        // javaw has no console: Ctrl + C in the command line does not reach the window
        assertEquals(List.of(Paths.get(javaHome, "bin", "javaw").toString(), "-cp", "classes;libs",
                "com.gensynth.core.App", "--desktop", "--open", "C:\\p\\a.gsynth"),
            DesktopLauncher.command(null, "Windows 10", javaHome, List.of(), "classes;libs", null, "C:\\p\\a.gsynth"));
    }

    @Test
    public void theDesktopLauncherIsFoundThroughALink() throws Exception {
        // On Linux the command line is reached through /usr/bin/gensynth, a link
        Path bin = temp.newFolder("opt", "gensynth", "bin").toPath();
        Path cli = Files.createFile(bin.resolve("gensynth-cli"));
        Path link = temp.newFolder("usr", "bin").toPath().resolve("gensynth");
        try {
            Files.createSymbolicLink(link, cli);
        } catch (IOException | UnsupportedOperationException e) {
            // Creating links needs special rights on Windows, where there is no such link anyway
            org.junit.Assume.assumeNoException(e);
        }

        assertEquals(bin.toRealPath().resolve("GenSynth"), DesktopLauncher.desktopLauncher(link.toString(), "Linux"));
    }

    @Test
    public void anOpenWindowGetsTheProjectAndNothingIsStarted() throws Exception {
        List<String> requested = new ArrayList<>();
        List<List<String>> started = new ArrayList<>();
        DesktopLauncher launcher = new DesktopLauncher(file -> {
            requested.add(file);
            return IOpenWindowClient.Outcome.SENT;
        }, () -> false, started::add);
        Path project = temp.newFile("plant.gsynth").toPath();

        assertEquals(IDesktopLauncher.Result.OPENED_IN_WINDOW, launcher.open(project));

        assertEquals(List.of(project.toAbsolutePath().toString()), requested);
        assertTrue(started.isEmpty());
    }

    @Test
    public void withoutAnOpenWindowANewOneIsStarted() throws Exception {
        List<List<String>> started = new ArrayList<>();
        DesktopLauncher launcher = new DesktopLauncher(file -> IOpenWindowClient.Outcome.NOT_RUNNING, () -> false, started::add);
        Path project = temp.newFile("plant.gsynth").toPath();

        assertEquals(IDesktopLauncher.Result.LAUNCHED, launcher.open(project));
        assertEquals(IDesktopLauncher.Result.LAUNCHED, launcher.open(null));

        assertEquals(2, started.size());
        List<String> first = started.get(0);
        assertEquals(List.of("--desktop", "--open", project.toAbsolutePath().toString()),
            first.subList(first.size() - 3, first.size()));
        List<String> second = started.get(1);
        assertEquals("--desktop", second.get(second.size() - 1));
    }

    @Test
    public void aRejectionOfTheOpenWindowIsReported() {
        List<List<String>> started = new ArrayList<>();
        DesktopLauncher launcher = new DesktopLauncher(file -> {
            throw new IllegalStateException("The open GenSynth window is an older version: close it and try again");
        }, () -> false, started::add);

        IllegalStateException error = assertThrows(IllegalStateException.class, () -> launcher.open(null));

        assertTrue(error.getMessage(), error.getMessage().contains("older version"));
        assertTrue(started.isEmpty());
    }

    @Test
    public void withoutADisplayNothingIsStarted() {
        List<List<String>> started = new ArrayList<>();
        DesktopLauncher launcher = new DesktopLauncher(file -> IOpenWindowClient.Outcome.NOT_RUNNING, () -> true, started::add);

        IllegalStateException error = assertThrows(IllegalStateException.class, () -> launcher.open(null));

        assertTrue(error.getMessage(), error.getMessage().startsWith("No graphical display"));
        assertTrue(started.isEmpty());
    }

    @Test
    public void aFailedStartIsReported() {
        DesktopLauncher launcher = new DesktopLauncher(file -> IOpenWindowClient.Outcome.NOT_RUNNING, () -> false, command -> {
            throw new IOException("No such file");
        });

        IllegalStateException error = assertThrows(IllegalStateException.class, () -> launcher.open(null));

        assertEquals("Cannot start GenSynth: No such file", error.getMessage());
    }
}
