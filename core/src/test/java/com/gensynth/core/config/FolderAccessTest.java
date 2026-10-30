package com.gensynth.core.config;

import org.junit.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.*;

public class FolderAccessTest {

    @Test
    public void canWriteInATemporaryFolderAndLeavesNoProbeFile() throws Exception {
        Path folder = Files.createTempDirectory("gensynth-folder-access-");

        assertTrue(FolderAccess.canWriteIn(folder));
        try (var entries = Files.list(folder)) {
            assertEquals("The probe file must be deleted", 0, entries.count());
        }
    }

    @Test
    public void cannotWriteInAMissingFolderOrInAFile() throws Exception {
        Path folder = Files.createTempDirectory("gensynth-folder-access-");
        Path file = Files.createFile(folder.resolve("project.gsynth"));

        assertFalse(FolderAccess.canWriteIn(folder.resolve("missing")));
        assertFalse(FolderAccess.canWriteIn(file));
        assertFalse(FolderAccess.canWriteIn(null));
    }

    @Test
    public void noPermissionMessageNamesTheFolderAndWhatToDo() throws Exception {
        Path folder = Files.createTempDirectory("gensynth-folder-access-");

        String message = FolderAccess.noPermissionMessage(folder);

        assertTrue(message.contains(folder.toAbsolutePath().toString()));
        assertTrue(message.contains("Documents"));
    }
}
