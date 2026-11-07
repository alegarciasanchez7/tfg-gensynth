package com.gensynth.core;

import org.junit.Test;

import java.nio.file.Paths;
import java.util.List;

import static org.junit.Assert.*;

public class AppTest {

    @Test
    public void desktopAloneOpensAnEmptyWindow() {
        App.StartupArgs startup = App.parseArgs(new String[]{"--desktop"});

        assertTrue(startup.desktop());
        assertNull(startup.openFile());
        assertEquals(List.of("--desktop"), startup.restartArgs());
    }

    @Test
    public void noArgumentsStartsTheEngineAlone() {
        App.StartupArgs startup = App.parseArgs(new String[0]);

        assertFalse(startup.desktop());
        assertNull(startup.openFile());
        assertTrue(startup.restartArgs().isEmpty());
    }

    @Test
    public void openTakesTheProjectToOpenInTheWindow() {
        App.StartupArgs startup = App.parseArgs(new String[]{"--desktop", "--open", "projects/plant.gsynth"});

        assertTrue(startup.desktop());
        assertEquals(Paths.get("projects/plant.gsynth").toAbsolutePath().normalize().toString(), startup.openFile());
        // A restart (e.g. after installing a plugin) does not open the file again
        assertEquals(List.of("--desktop"), startup.restartArgs());
    }

    @Test
    public void aProjectFileAloneMeansTheDesktopWindow() {
        // What Windows and Linux pass on a double click: it replaces the launcher's default --desktop
        App.StartupArgs startup = App.parseArgs(new String[]{"plant.GSYNTH"});

        assertTrue(startup.desktop());
        assertEquals(Paths.get("plant.GSYNTH").toAbsolutePath().normalize().toString(), startup.openFile());
        assertEquals(List.of("--desktop"), startup.restartArgs());
    }

    @Test
    public void anyOtherFileAlsoMeansTheDesktopWindow() {
        // "Open with GenSynth" on a file that is not a project: the window reports it, instead of
        // an engine without window holding the port
        App.StartupArgs startup = App.parseArgs(new String[]{"notes.json"});

        assertTrue(startup.desktop());
        assertEquals(Paths.get("notes.json").toAbsolutePath().normalize().toString(), startup.openFile());
    }

    @Test
    public void otherArgumentsAreKeptForARestart() {
        App.StartupArgs startup = App.parseArgs(new String[]{"-psn_0_123", "--desktop", "--open"});

        assertTrue(startup.desktop());
        assertNull("--open without a file opens nothing", startup.openFile());
        assertEquals(List.of("--desktop", "-psn_0_123", "--open"), startup.restartArgs());
    }
}
