package com.gensynth.core.desktop;

import com.gensynth.core.api.IFolderOpener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.awt.Desktop;
import java.awt.GraphicsEnvironment;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Optional;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;

/**
 * Opens folders with {@link Desktop#open}, falling back to {@code xdg-open} on Linux desktops
 * where AWT cannot open files, or says it can but then fails (desktops without the GNOME
 * libraries). The folder is opened on a background thread so the caller never waits for the file
 * explorer to start.
 */
public class DesktopFolderOpener implements IFolderOpener {

    private static final Logger logger = LoggerFactory.getLogger(DesktopFolderOpener.class);

    private final BooleanSupplier awtAvailable;
    private final Supplier<Optional<Path>> xdgOpen;
    private final Launcher launcher;

    /** Opens a folder, with the given {@code xdg-open} or with AWT when it is null. */
    @FunctionalInterface
    interface Launcher {
        /**
         * @param folder  the folder to open
         * @param xdgOpen the {@code xdg-open} executable, or null to open it with AWT
         * @throws IOException when the folder could not be opened
         */
        void open(Path folder, Path xdgOpen) throws IOException;
    }

    /**
     * Opens folders with the desktop of this computer.
     */
    public DesktopFolderOpener() {
        this(DesktopFolderOpener::canOpenWithAwt, ExternalLinkOpener::linuxXdgOpen, DesktopFolderOpener::openNow);
    }

    /**
     * @param awtAvailable whether AWT can open folders here
     * @param xdgOpen      the {@code xdg-open} executable, when there is one (Linux)
     * @param launcher     opens a folder, with the given {@code xdg-open} or with AWT when it is null
     */
    DesktopFolderOpener(BooleanSupplier awtAvailable, Supplier<Optional<Path>> xdgOpen, Launcher launcher) {
        this.awtAvailable = awtAvailable;
        this.xdgOpen = xdgOpen;
        this.launcher = launcher;
    }

    @Override
    public boolean open(Path folder) {
        boolean awt = awtAvailable.getAsBoolean();
        Path executable = xdgOpen.get().orElse(null);
        if (!awt && executable == null) {
            logger.warn("No way to open folders on this system: {}", folder);
            return false;
        }
        Thread opener = new Thread(() -> launch(folder, awt, executable), "gensynth-open-folder");
        opener.setDaemon(true);
        opener.start();
        return true;
    }

    /** Opens the folder with AWT, or with {@code xdg-open} when AWT cannot or fails. */
    private void launch(Path folder, boolean awt, Path executable) {
        if (awt) {
            try {
                launcher.open(folder, null);
                return;
            } catch (IOException | RuntimeException e) {
                if (executable == null) {
                    logger.warn("Could not open the folder {}: {}", folder, e.getMessage());
                    return;
                }
                logger.debug("AWT could not open the folder {}, trying xdg-open: {}", folder, e.getMessage());
            }
        }
        try {
            launcher.open(folder, executable);
        } catch (IOException | RuntimeException e) {
            logger.warn("Could not open the folder {}: {}", folder, e.getMessage());
        }
    }

    private static boolean canOpenWithAwt() {
        return !GraphicsEnvironment.isHeadless()
            && Desktop.isDesktopSupported()
            && Desktop.getDesktop().isSupported(Desktop.Action.OPEN);
    }

    private static void openNow(Path folder, Path xdgOpen) throws IOException {
        if (xdgOpen == null) {
            Desktop.getDesktop().open(folder.toFile());
        } else {
            new ProcessBuilder(xdgOpen.toString(), folder.toString()).start();
        }
    }
}
