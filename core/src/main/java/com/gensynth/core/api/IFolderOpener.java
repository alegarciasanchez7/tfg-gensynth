package com.gensynth.core.api;

import java.nio.file.Path;

/**
 * Shows a local folder in the file explorer of the operating system, for the "Open" button of
 * the session folder in the UI.
 */
public interface IFolderOpener {

    /**
     * Asks the operating system to show a folder. Returns at once: the file explorer is started
     * in the background.
     *
     * @param folder an existing folder
     * @return {@code true} if the request was handed to the operating system, {@code false} if
     *         this system cannot open folders (no graphical desktop, e.g. a server)
     */
    boolean open(Path folder);
}
