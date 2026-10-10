package com.gensynth.core.desktop;

import me.friwi.jcefmaven.EnumProgress;
import org.junit.Test;

import static org.junit.Assert.*;

public class JcefSetupStatusTest {

    @Test
    public void downloadShowsItsPercentage() {
        JcefSetupStatus status = JcefSetupStatus.of(EnumProgress.DOWNLOADING, 42.4f);

        assertEquals(42, status.percent());
        assertEquals("Downloading the embedded browser... 42%", status.message());
        assertFalse(status.finished());
    }

    @Test
    public void downloadWithoutEstimationIsIndeterminate() {
        JcefSetupStatus status = JcefSetupStatus.of(EnumProgress.DOWNLOADING, EnumProgress.NO_ESTIMATION);

        assertEquals(JcefSetupStatus.INDETERMINATE, status.percent());
        assertEquals("Downloading the embedded browser...", status.message());
    }

    @Test
    public void percentageIsKeptBetweenZeroAndOneHundred() {
        assertEquals(100, JcefSetupStatus.of(EnumProgress.DOWNLOADING, 130f).percent());
        assertEquals(0, JcefSetupStatus.of(EnumProgress.DOWNLOADING, 0f).percent());
    }

    @Test
    public void everyOtherStepHasAMessageAndOnlyInitializedFinishes() {
        for (EnumProgress state : EnumProgress.values()) {
            JcefSetupStatus status = JcefSetupStatus.of(state, EnumProgress.NO_ESTIMATION);

            assertFalse(state + " needs a message", status.message().isBlank());
            assertEquals(state + " finishes", state == EnumProgress.INITIALIZED, status.finished());
        }
    }

    @Test
    public void onlyDownloadAndInstallStepsOpenTheFirstRunWindow() {
        assertTrue(JcefSetupStatus.isInstallStep(EnumProgress.LOCATING));
        assertTrue(JcefSetupStatus.isInstallStep(EnumProgress.DOWNLOADING));
        assertTrue(JcefSetupStatus.isInstallStep(EnumProgress.EXTRACTING));
        assertTrue(JcefSetupStatus.isInstallStep(EnumProgress.INSTALL));
        assertFalse(JcefSetupStatus.isInstallStep(EnumProgress.INITIALIZING));
        assertFalse(JcefSetupStatus.isInstallStep(EnumProgress.INITIALIZED));
    }
}
