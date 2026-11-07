package com.gensynth.core.desktop;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ExternalLinkOpenerTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    @Test
    public void allowsGoogleFormsAndTheProjectOnGitHub() {
        assertTrue(ExternalLinkOpener.isAllowed("https://docs.google.com/forms/d/e/abc/viewform?usp=pp_url&entry.1=Linux"));
        assertTrue(ExternalLinkOpener.isAllowed("https://forms.gle/AbCdEf123"));
        assertTrue(ExternalLinkOpener.isAllowed("https://github.com/alegarciasanchez7/tfg-gensynth/releases"));
    }

    @Test
    public void blocksEverythingElse() {
        assertFalse(ExternalLinkOpener.isAllowed(null));
        assertFalse(ExternalLinkOpener.isAllowed(""));
        assertFalse(ExternalLinkOpener.isAllowed("http://docs.google.com/forms/d/e/abc/viewform"));
        assertFalse(ExternalLinkOpener.isAllowed("https://docs.google.com/document/d/abc"));
        assertFalse(ExternalLinkOpener.isAllowed("https://docs.google.com.evil.example/forms/d/abc"));
        assertFalse(ExternalLinkOpener.isAllowed("https://user@forms.gle/abc"));
        assertFalse(ExternalLinkOpener.isAllowed("https://forms.gle:8443/abc"));
        assertFalse(ExternalLinkOpener.isAllowed("https://github.com/someone-else/repo"));
        assertFalse(ExternalLinkOpener.isAllowed("javascript:alert(1)"));
        assertFalse(ExternalLinkOpener.isAllowed("file:///etc/passwd"));
        assertFalse(ExternalLinkOpener.isAllowed("not a url"));
    }

    @Test
    public void openRejectsUrlsOutsideTheAllowList() {
        assertFalse(ExternalLinkOpener.open("https://example.com"));
    }

    @Test
    public void xdgOpenIsOnlyLookedUpInFixedAbsoluteFolders() {
        assertFalse(ExternalLinkOpener.XDG_OPEN_PATHS.isEmpty());
        for (String candidate : ExternalLinkOpener.XDG_OPEN_PATHS) {
            assertTrue(candidate, candidate.startsWith("/usr/"));
            assertTrue(candidate, candidate.endsWith("/xdg-open"));
        }
    }

    @Test
    public void findExecutableReturnsTheFirstExistingExecutable() throws Exception {
        File executable = tmp.newFile("opener");
        assertTrue(executable.setExecutable(true));
        String missing = new File(tmp.getRoot(), "missing").getAbsolutePath();
        String folder = tmp.newFolder("folder").getAbsolutePath();

        Optional<Path> found = ExternalLinkOpener.findExecutable(List.of(missing, folder, executable.getAbsolutePath()));

        assertTrue(found.isPresent());
        assertEquals(executable.toPath(), found.get());
    }

    @Test
    public void findExecutableIsEmptyWhenNoCandidateExists() {
        String missing = new File(tmp.getRoot(), "missing").getAbsolutePath();
        assertFalse(ExternalLinkOpener.findExecutable(List.of(missing)).isPresent());
    }
}
