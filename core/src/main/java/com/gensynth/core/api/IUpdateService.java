package com.gensynth.core.api;

import com.gensynth.core.update.UpdateCheck;

import java.io.IOException;
import java.nio.file.Path;

/**
 * Service contract for updating the installed application from its published releases.
 *
 * The user always decides: a check never downloads anything, and nothing is installed
 * unless {@link #install(Path)} is called for an installer that {@link #download} verified.
 */
public interface IUpdateService {

    /**
     * Receives the progress of a download.
     */
    interface DownloadProgress {

        /**
         * Called while the installer is downloaded, at most a few times per second.
         *
         * @param receivedBytes bytes received so far
         * @param totalBytes    size of the installer
         */
        void onProgress(long receivedBytes, long totalBytes);

        /** Called once the installer is downloaded, before its checksum is verified. */
        default void onVerifying() {
        }
    }

    /**
     * @return the version of the running application, or null if it is unknown
     */
    String currentVersion();

    /**
     * Tells why this installation cannot update itself (not installed, unknown version,
     * unsupported system...).
     *
     * @return a message for the user, or null if updates are supported
     */
    String unsupportedReason();

    /**
     * Asks the release server for the latest release and its installer for this system.
     *
     * @return the result of the check
     * @throws IOException          if the server cannot be reached or answers something unexpected
     * @throws InterruptedException if the thread is interrupted while waiting
     */
    UpdateCheck check() throws IOException, InterruptedException;

    /**
     * Downloads the installer of an available update and verifies its SHA-256 checksum.
     * A previous download is deleted first; nothing is left on disk if the download fails.
     *
     * @param update   an available update, from {@link #check()}
     * @param progress receives the download progress
     * @return the verified installer
     * @throws IOException          if the download fails or the checksum does not match
     * @throws InterruptedException if the download is cancelled (the thread is interrupted)
     */
    Path download(UpdateCheck update, DownloadProgress progress) throws IOException, InterruptedException;

    /**
     * Starts the installer. On systems where the application must be closed first it closes
     * the application and does not return; elsewhere it waits for the installation and then
     * restarts the application.
     *
     * @param installer the installer returned by {@link #download}
     * @throws IOException          if the installer cannot be started or the installation fails
     * @throws InterruptedException if the thread is interrupted while waiting for the installation
     */
    void install(Path installer) throws IOException, InterruptedException;

    /**
     * @return true if {@link #install(Path)} closes the application before installing
     */
    boolean closesAppToInstall();
}
