package com.gensynth.core.cli;

import com.gensynth.core.api.IDesktopLauncher;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.net.ServerSocket;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.*;

public class DesktopLauncherTest {

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    /** A port nothing listens on: no desktop application is open. */
    private int freePort;

    @Before
    public void findFreePort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            freePort = socket.getLocalPort();
        }
    }

    @Test
    public void installedLaunchesTheDesktopLauncherNextToTheCommandLineOne() {
        Path cli = Paths.get("opt", "gensynth", "bin", "gensynth-cli").toAbsolutePath();

        List<String> linux = DesktopLauncher.command(cli.toString(), "Linux", "/jdk", List.of("-Xmx1g"), "cp", "/p/a.gsynth");
        // Detached from the terminal, so Ctrl + C and closing it do not close the window
        assertEquals(List.of("/bin/sh", "-c", "nohup \"$@\" >/dev/null 2>&1 &", "gensynth",
            cli.resolveSibling("GenSynth").toString(), "--desktop", "--open", "/p/a.gsynth"), linux);

        List<String> windows = DesktopLauncher.command(cli.toString(), "Windows 11", "/jdk", List.of(), "cp", null);
        assertEquals(List.of(cli.resolveSibling("GenSynth.exe").toString(), "--desktop"), windows);
    }

    @Test
    public void fromTheSourceBuildTheSameJavaRunsTheApplication() {
        String javaHome = Paths.get("jdk").toAbsolutePath().toString();
        List<String> jvmArgs = List.of("-Dgensynth.home=/core", "-agentlib:jdwp=transport=dt_socket,address=5005", "-Xmx512m");

        List<String> linux = DesktopLauncher.command(null, "Linux", javaHome, jvmArgs, "classes:libs", null);
        assertEquals(List.of("/bin/sh", "-c", "nohup \"$@\" >/dev/null 2>&1 &", "gensynth",
            Paths.get(javaHome, "bin", "java").toString(), "-Dgensynth.home=/core", "-Xmx512m",
            "-cp", "classes:libs", "com.gensynth.core.App", "--desktop"), linux);

        // javaw has no console: Ctrl + C in the command line does not reach the window
        List<String> windows = DesktopLauncher.command(null, "Windows 10", javaHome, List.of(), "classes;libs", "C:\\p\\a.gsynth");
        assertEquals(List.of(Paths.get(javaHome, "bin", "javaw").toString(), "-cp", "classes;libs",
            "com.gensynth.core.App", "--desktop", "--open", "C:\\p\\a.gsynth"), windows);
    }

    @Test
    public void theDesktopLauncherIsFoundThroughALink() throws Exception {
        // On Linux the command line is reached through /usr/bin/gensynth, a link
        Path bin = temp.newFolder("opt", "gensynth", "bin").toPath();
        Path cli = java.nio.file.Files.createFile(bin.resolve("gensynth-cli"));
        Path link = temp.newFolder("usr", "bin").toPath().resolve("gensynth");
        try {
            java.nio.file.Files.createSymbolicLink(link, cli);
        } catch (IOException | UnsupportedOperationException e) {
            // Creating links needs special rights on Windows, where there is no such link anyway
            org.junit.Assume.assumeNoException(e);
        }

        assertEquals(bin.toRealPath().resolve("GenSynth"), DesktopLauncher.desktopLauncher(link.toString(), "Linux"));
    }

    @Test
    public void withoutAnOpenWindowANewOneIsStarted() throws Exception {
        List<List<String>> started = new ArrayList<>();
        DesktopLauncher launcher = new DesktopLauncher("127.0.0.1", freePort, () -> false, started::add);
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
    public void withoutADisplayNothingIsStarted() {
        List<List<String>> started = new ArrayList<>();
        DesktopLauncher launcher = new DesktopLauncher("127.0.0.1", freePort, () -> true, started::add);

        IllegalStateException error = assertThrows(IllegalStateException.class, () -> launcher.open(null));

        assertTrue(error.getMessage(), error.getMessage().startsWith("No graphical display"));
        assertTrue(started.isEmpty());
    }

    @Test
    public void aFailedStartIsReported() {
        DesktopLauncher launcher = new DesktopLauncher("127.0.0.1", freePort, () -> false, command -> {
            throw new IOException("No such file");
        });

        IllegalStateException error = assertThrows(IllegalStateException.class, () -> launcher.open(null));

        assertEquals("Cannot start GenSynth: No such file", error.getMessage());
    }
}
