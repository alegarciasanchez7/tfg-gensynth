package com.gensynth.core.config;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.*;

public class DevicePreferencesTest {

    @Test
    public void usesTheDefaultsWhenTheFileIsMissing() throws Exception {
        Path folder = Files.createTempDirectory("gensynth-prefs-");

        assertTrue(DevicePreferences.inFolder(folder.toString()).outputFolder().isEmpty());
        assertTrue(DevicePreferences.inFolder(null).outputFolder().isEmpty());
    }

    @Test
    public void savesAndLoadsTheOutputFolder() throws Exception {
        Path folder = Files.createTempDirectory("gensynth-prefs-");
        Path results = folder.resolve("My results");

        DevicePreferences.inFolder(folder.toString()).setOutputFolder(results);

        assertEquals(results.toAbsolutePath(), DevicePreferences.inFolder(folder.toString()).outputFolder().orElseThrow());
    }

    @Test
    public void clearingTheOutputFolderGoesBackToTheDefault() throws Exception {
        Path folder = Files.createTempDirectory("gensynth-prefs-");
        DevicePreferences preferences = DevicePreferences.inFolder(folder.toString());
        preferences.setOutputFolder(folder.resolve("results"));

        preferences.setOutputFolder(null);

        assertTrue(preferences.outputFolder().isEmpty());
        assertTrue(DevicePreferences.inFolder(folder.toString()).outputFolder().isEmpty());
    }

    @Test
    public void sessionsGoToTheChosenFolderOrElseToTheDefaultOne() throws Exception {
        Path folder = Files.createTempDirectory("gensynth-prefs-");
        Path defaultFolder = folder.resolve("default");
        List<String> warnings = new ArrayList<>();
        DevicePreferences preferences = DevicePreferences.inFolder(folder.toString());

        assertEquals(defaultFolder, preferences.sessionsFolder(defaultFolder, warnings::add));

        // A chosen folder that does not exist yet is created
        Path chosen = folder.resolve("My results");
        preferences.setOutputFolder(chosen);
        assertEquals(chosen.toAbsolutePath(), preferences.sessionsFolder(defaultFolder, warnings::add));
        assertTrue(Files.isDirectory(chosen));
        assertTrue(warnings.isEmpty());

        // A folder that cannot be created (here, inside a file) falls back to the default one
        Path file = Files.writeString(folder.resolve("a-file.txt"), "x");
        preferences.setOutputFolder(file.resolve("results"));
        assertEquals(defaultFolder, preferences.sessionsFolder(defaultFolder, warnings::add));
        assertEquals(1, warnings.size());
        assertTrue(warnings.get(0), warnings.get(0).contains("Using the default output folder instead"));
    }

    @Test
    public void ignoresACorruptFileOrARelativePath() throws Exception {
        Path corrupt = Files.createTempDirectory("gensynth-prefs-");
        Files.writeString(corrupt.resolve(DevicePreferences.FILE_NAME), "{ not json", StandardCharsets.UTF_8);
        Path relative = Files.createTempDirectory("gensynth-prefs-");
        Files.writeString(relative.resolve(DevicePreferences.FILE_NAME), "{\"outputFolder\":\"results\"}", StandardCharsets.UTF_8);

        assertTrue(DevicePreferences.inFolder(corrupt.toString()).outputFolder().isEmpty());
        assertTrue(DevicePreferences.inFolder(relative.toString()).outputFolder().isEmpty());
    }
}
