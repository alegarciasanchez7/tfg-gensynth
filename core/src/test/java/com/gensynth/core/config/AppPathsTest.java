package com.gensynth.core.config;

import org.junit.Test;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.*;

public class AppPathsTest {

    /** Filesystem root of the OS running the tests ("/" or "C:\\"), to build absolute paths everywhere. */
    private static final String ROOT = Paths.get("").toAbsolutePath().getRoot().toString();
    private static final String HOME = "/home/ana";
    private static final String WORK_DIR = "/repo/core";

    private static AppPaths resolve(String os, Map<String, String> env, Map<String, String> props) {
        Map<String, String> all = new HashMap<>(props);
        all.putIfAbsent("user.home", HOME);
        all.putIfAbsent("user.dir", WORK_DIR);
        return AppPaths.resolve(os, env, all::get);
    }

    private static Map<String, String> installed() {
        Map<String, String> props = new HashMap<>();
        props.put(AppPaths.LAUNCHER_PROPERTY, "/opt/gensynth/bin/GenSynth");
        props.put(AppPaths.APP_DIR_PROPERTY, "/opt/gensynth/lib/app");
        return props;
    }

    @Test
    public void developmentModeKeepsEverythingInTheWorkingDirectory() {
        AppPaths paths = resolve("Linux", Map.of(), Map.of());

        assertFalse(paths.isInstalled());
        assertEquals(Paths.get(WORK_DIR, "plugins"), paths.pluginsDir());
        assertEquals(Paths.get(WORK_DIR, "state"), paths.stateDir());
        assertEquals(Paths.get(WORK_DIR, "jcef-bundle"), paths.jcefDir());
        assertEquals(Paths.get(WORK_DIR), paths.outputsHome());
        assertEquals(Paths.get(WORK_DIR, "lib", "shared"), paths.sharedLibsDir());
    }

    @Test
    public void installedOnLinuxUsesTheXdgDataFolder() {
        AppPaths paths = resolve("Linux", Map.of(), installed());

        assertTrue(paths.isInstalled());
        assertEquals(Paths.get(HOME, ".local", "share", "gensynth"), paths.dataHome());
        assertEquals(Paths.get(HOME, "GenSynth"), paths.outputsHome());
        assertEquals(Paths.get("/opt/gensynth/lib/app").toAbsolutePath().getParent().resolve("shared"), paths.sharedLibsDir());
    }

    @Test
    public void installedOnLinuxHonoursXdgDataHome() {
        AppPaths paths = resolve("Linux", Map.of("XDG_DATA_HOME", ROOT + "data"), installed());

        assertEquals(Paths.get(ROOT + "data", "gensynth"), paths.dataHome());
    }

    @Test
    public void installedOnLinuxIgnoresARelativeXdgDataHome() {
        // The XDG specification says relative paths must be ignored
        AppPaths paths = resolve("Linux", Map.of("XDG_DATA_HOME", "relative/dir"), installed());

        assertEquals(Paths.get(HOME, ".local", "share", "gensynth"), paths.dataHome());
    }

    @Test
    public void installedOnWindowsUsesLocalAppData() {
        AppPaths paths = resolve("Windows 11", Map.of("LOCALAPPDATA", "/Users/ana/AppData/Local"), installed());

        assertEquals(Paths.get("/Users/ana/AppData/Local", "GenSynth"), paths.dataHome());
        assertEquals(Paths.get(HOME, "GenSynth"), paths.outputsHome());
    }

    @Test
    public void installedOnWindowsWithoutLocalAppDataFallsBackToTheUserProfile() {
        AppPaths paths = resolve("Windows 11", Map.of(), installed());

        assertEquals(Paths.get(HOME, "AppData", "Local", "GenSynth"), paths.dataHome());
    }

    @Test
    public void installedOnMacUsesApplicationSupport() {
        AppPaths paths = resolve("Mac OS X", Map.of(), installed());

        assertEquals(Paths.get(HOME, "Library", "Application Support", "GenSynth"), paths.dataHome());
    }

    @Test
    public void installedWithoutAppDirFallsBackToTheWorkingDirectoryForSharedLibraries() {
        Map<String, String> props = new HashMap<>(installed());
        props.remove(AppPaths.APP_DIR_PROPERTY);

        AppPaths paths = resolve("Linux", Map.of(), props);

        assertEquals(Paths.get(WORK_DIR, "lib", "shared"), paths.sharedLibsDir());
    }

    @Test
    public void homeOverrideWinsInBothModes() {
        Map<String, String> props = new HashMap<>(installed());
        props.put(AppPaths.HOME_PROPERTY, ROOT + "gensynth-test");

        AppPaths paths = resolve("Linux", Map.of(), props);

        assertEquals(Paths.get(ROOT + "gensynth-test"), paths.dataHome());
        assertEquals(Paths.get(ROOT + "gensynth-test"), paths.outputsHome());
        assertEquals(Paths.get(ROOT + "gensynth-test", "plugins"), paths.pluginsDir());
    }

    @Test
    public void blankHomeOverrideIsIgnored() {
        AppPaths paths = resolve("Linux", Map.of(), Map.of(AppPaths.HOME_PROPERTY, " "));

        assertEquals(Paths.get(WORK_DIR), paths.dataHome());
    }

    @Test
    public void sessionOutputDirIsAnAbsoluteTimestampedFolderInsideTheOutputsHome() {
        AppPaths paths = resolve("Linux", Map.of(), installed());

        Path sessionDir = Paths.get(paths.newSessionOutputDir());

        assertTrue(sessionDir.isAbsolute());
        assertEquals(Paths.get(HOME, "GenSynth"), sessionDir.getParent());
        assertTrue(sessionDir.getFileName().toString().matches("OUTPUT_FILES_\\d{4}(_\\d{2}){5}"));
    }

    @Test
    public void pluginInstallFilesLiveInThePluginsFolder() {
        AppPaths paths = resolve("Linux", Map.of(), installed());

        assertEquals(paths.pluginsDir().resolve(".pending_install.json"), paths.pendingInstallMarker());
        assertEquals(paths.pluginsDir().resolve(".rollback_report.json"), paths.rollbackReport());
    }

    @Test
    public void currentResolvesTheRunningProcessOnce() {
        AppPaths first = AppPaths.current();

        assertSame(first, AppPaths.current());
        assertNotNull(first.dataHome());
    }
}
