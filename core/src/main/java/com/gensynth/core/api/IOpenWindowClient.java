package com.gensynth.core.api;

/**
 * Asks a GenSynth application that is already open to open a project in its window. Used by
 * the {@code edit} command of the command line and by a second launch of the application (a
 * double click on a project file while it is open), so only one window edits the projects.
 */
public interface IOpenWindowClient {

    /** What happened with the request. */
    enum Outcome {
        /** The open application received the project. */
        SENT,
        /** No GenSynth application answered: none is open. */
        NOT_RUNNING
    }

    /**
     * @param filePath absolute path of the project file, or null for a new project
     * @return whether the open application received the project
     * @throws IllegalStateException if the open application rejects it or does not answer, with
     *                               the reason (e.g. an invalid project file, no window in
     *                               browser mode, or an older version)
     */
    Outcome requestOpen(String filePath);
}
