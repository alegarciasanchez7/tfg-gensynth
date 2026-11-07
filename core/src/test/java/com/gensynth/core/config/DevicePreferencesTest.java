package com.gensynth.core.config;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

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
    public void ignoresACorruptFileOrARelativePath() throws Exception {
        Path corrupt = Files.createTempDirectory("gensynth-prefs-");
        Files.writeString(corrupt.resolve(DevicePreferences.FILE_NAME), "{ not json", StandardCharsets.UTF_8);
        Path relative = Files.createTempDirectory("gensynth-prefs-");
        Files.writeString(relative.resolve(DevicePreferences.FILE_NAME), "{\"outputFolder\":\"results\"}", StandardCharsets.UTF_8);

        assertTrue(DevicePreferences.inFolder(corrupt.toString()).outputFolder().isEmpty());
        assertTrue(DevicePreferences.inFolder(relative.toString()).outputFolder().isEmpty());
    }
}
