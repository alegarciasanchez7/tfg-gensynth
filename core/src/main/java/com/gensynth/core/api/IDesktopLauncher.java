package com.gensynth.core.api;

import java.nio.file.Path;

/**
 * Opens a project in the desktop application, for the {@code edit} command of the command
 * line: in the window that is already open, or in a new one.
 */
public interface IDesktopLauncher {

    /** Where the project was opened. */
    enum Result {
        /** The window that was already open received it. */
        OPENED_IN_WINDOW,
        /** A new window is starting with it. */
        LAUNCHED
    }

    /**
     * Opens a project file, or a new project, in the desktop application. Returns at once: the
     * window is another process, and closing the command line does not close it.
     *
     * @param projectFile a valid {@code .gsynth} file, or null for a new project
     * @return where the project was opened
     * @throws IllegalStateException if it cannot be opened, with the reason (e.g. no graphical
     *                               display, or the open window rejected the file)
     */
    Result open(Path projectFile);
}
