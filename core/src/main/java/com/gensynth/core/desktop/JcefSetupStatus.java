package com.gensynth.core.desktop;

import me.friwi.jcefmaven.EnumProgress;

/**
 * What the first-run window shows for one step of the embedded browser (JCEF) setup.
 *
 * @param message  text for the user
 * @param percent  progress from 0 to 100, or {@link #INDETERMINATE} when unknown
 * @param finished true once the browser is ready and the window can close
 */
public record JcefSetupStatus(String message, int percent, boolean finished) {

    /** Progress value meaning "no estimation available". */
    public static final int INDETERMINATE = -1;

    /**
     * Maps a jcefmaven progress event to what the user sees.
     *
     * @param state   current setup step
     * @param percent progress reported by jcefmaven (0-100, or negative when unknown)
     * @return the status to show
     */
    public static JcefSetupStatus of(EnumProgress state, float percent) {
        return switch (state) {
            case LOCATING -> new JcefSetupStatus("Preparing the download...", INDETERMINATE, false);
            case DOWNLOADING -> percent < 0
                ? new JcefSetupStatus("Downloading the embedded browser...", INDETERMINATE, false)
                : new JcefSetupStatus("Downloading the embedded browser... " + clamp(percent) + "%", clamp(percent), false);
            case EXTRACTING -> new JcefSetupStatus("Extracting files...", INDETERMINATE, false);
            case INSTALL -> new JcefSetupStatus("Installing...", INDETERMINATE, false);
            case INITIALIZING -> new JcefSetupStatus("Starting GenSynth...", INDETERMINATE, false);
            case INITIALIZED -> new JcefSetupStatus("Ready", 100, true);
        };
    }

    /**
     * @param state a setup step
     * @return true for the steps that only happen while the browser is being downloaded and
     *         installed, i.e. when the user must be told what is going on
     */
    public static boolean isInstallStep(EnumProgress state) {
        return state == EnumProgress.LOCATING || state == EnumProgress.DOWNLOADING
            || state == EnumProgress.EXTRACTING || state == EnumProgress.INSTALL;
    }

    private static int clamp(float percent) {
        return Math.round(Math.clamp(percent, 0f, 100f));
    }
}
