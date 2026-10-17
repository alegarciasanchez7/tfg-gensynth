package com.gensynth.core.desktop;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ExternalLinkOpenerTest {

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
}
