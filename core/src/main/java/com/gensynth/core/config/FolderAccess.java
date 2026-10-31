package com.gensynth.core.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Checks whether GenSynth can write in a folder, and the message shown when it cannot.
 *
 * <p>Typical case: the installation folder ({@code C:\Program Files\GenSynth}) is read-only for
 * normal users, so saving a project or generated files there fails.
 */
public final class FolderAccess {

    private FolderAccess() {
    }

    /**
     * Tells whether a file can be created in the folder. Creates and deletes a temporary file
     * instead of trusting {@link Files#isWritable(Path)}, which is not reliable for folders on Windows.
     *
     * @param folder the folder to check
     * @return true when the folder exists and a file can be created in it
     */
    public static boolean canWriteIn(Path folder) {
        if (folder == null || !Files.isDirectory(folder)) {
            return false;
        }
        try {
            Path probe = Files.createTempFile(folder, ".gensynth-", ".tmp");
            Files.deleteIfExists(probe);
            return true;
        } catch (IOException | SecurityException e) {
            return false;
        }
    }

    /**
     * Message shown when GenSynth cannot write in a folder.
     *
     * @param folder the folder that is not writable
     * @return a message that explains the cause and what to do
     */
    public static String noPermissionMessage(Path folder) {
        return "You do not have permission to write in " + folder.toAbsolutePath()
            + ". Choose a folder inside your user folder, such as Documents.";
    }
}
