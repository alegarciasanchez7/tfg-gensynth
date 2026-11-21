package com.gensynth.core.desktop;

import org.junit.Test;

import java.nio.file.Path;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.*;

public class DesktopFolderOpenerTest {

    private final Path folder = Path.of("results", "OUTPUT_FILES_1").toAbsolutePath();

    @Test
    public void opensWithTheDesktopWhenAwtCanOpenFolders() throws Exception {
        CompletableFuture<Path[]> launched = new CompletableFuture<>();
        DesktopFolderOpener opener = new DesktopFolderOpener(() -> true,
            () -> Optional.of(Path.of("usr", "bin", "xdg-open").toAbsolutePath()),
            (opened, xdgOpen) -> launched.complete(new Path[] {opened, xdgOpen}));

        assertTrue(opener.open(folder));

        Path[] call = launched.get(5, TimeUnit.SECONDS);
        assertEquals(folder, call[0]);
        assertNull("opened with AWT", call[1]);
    }

    @Test
    public void fallsBackToXdgOpenWhereAwtCannot() throws Exception {
        Path xdgOpen = Path.of("usr", "bin", "xdg-open").toAbsolutePath();
        CompletableFuture<Path> launchedWith = new CompletableFuture<>();
        DesktopFolderOpener opener = new DesktopFolderOpener(() -> false, () -> Optional.of(xdgOpen),
            (opened, executable) -> launchedWith.complete(executable));

        assertTrue(opener.open(folder));
        assertEquals(xdgOpen, launchedWith.get(5, TimeUnit.SECONDS));
    }

    @Test
    public void triesXdgOpenWhenTheDesktopFailsToOpenTheFolder() throws Exception {
        Path xdgOpen = Path.of("usr", "bin", "xdg-open").toAbsolutePath();
        CompletableFuture<Path> launchedWith = new CompletableFuture<>();
        DesktopFolderOpener opener = new DesktopFolderOpener(() -> true, () -> Optional.of(xdgOpen),
            (opened, executable) -> {
                if (executable == null) {
                    throw new java.io.IOException("Failed to show URI");
                }
                launchedWith.complete(executable);
            });

        assertTrue(opener.open(folder));
        assertEquals(xdgOpen, launchedWith.get(5, TimeUnit.SECONDS));
    }

    @Test
    public void saysSoWhenNothingCanOpenFolders() {
        DesktopFolderOpener opener = new DesktopFolderOpener(() -> false, Optional::empty,
            (opened, executable) -> fail("nothing must be launched"));

        assertFalse(opener.open(folder));
    }
}
