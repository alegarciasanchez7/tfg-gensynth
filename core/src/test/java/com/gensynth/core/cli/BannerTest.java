package com.gensynth.core.cli;

import org.jline.utils.AttributedString;
import org.junit.Test;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

import static org.junit.Assert.*;

public class BannerTest {

    private static String text(List<AttributedString> lines) {
        StringBuilder text = new StringBuilder();
        lines.forEach(line -> text.append(line).append('\n'));
        return text.toString();
    }

    @Test
    public void wideTerminalsShowTheLogoAndTheInformationInABox() {
        List<AttributedString> lines = Banner.lines("1.2.3", "~/projects", 100);
        String text = text(lines);

        assertTrue(text, lines.get(0).toString().startsWith("╭"));
        assertTrue(text, lines.get(lines.size() - 1).toString().startsWith("╰"));
        assertTrue(text, text.contains("╱╲"));
        assertTrue(text, text.contains("GenSynth 1.2.3"));
        assertTrue(text, text.contains("~/projects"));
        assertTrue(text, text.contains("Type 'help' · Tab completes paths"));
        int width = lines.get(0).columnLength();
        lines.forEach(line -> assertEquals(text, width, line.columnLength()));
        assertTrue(width <= 100);
    }

    @Test
    public void longFoldersKeepTheirEndAndNeverWidenTheBox() {
        String folder = "~/" + "very-long-folder-name/".repeat(10) + "end";
        List<AttributedString> lines = Banner.lines("1.2.3", folder, 80);

        assertTrue(text(lines), text(lines).contains("…"));
        assertTrue(text(lines), text(lines).contains("folder-name/end"));
        lines.forEach(line -> assertTrue(line.columnLength() <= 80));
    }

    @Test
    public void narrowTerminalsDropTheLogoAndThenTheBox() {
        List<AttributedString> noLogo = Banner.lines("1.2.3", "~", 50);
        assertFalse(text(noLogo).contains("╱╲"));
        assertTrue(text(noLogo).startsWith("╭"));
        noLogo.forEach(line -> assertTrue(line.columnLength() <= 50));

        List<AttributedString> noBox = Banner.lines("1.2.3", "~", 20);
        assertFalse(text(noBox).contains("╭"));
        assertTrue(text(noBox).contains("GenSynth 1.2.3"));
        noBox.forEach(line -> assertTrue(line.columnLength() <= 20));
    }

    @Test
    public void displayFolderAbbreviatesTheHome() {
        Path home = Paths.get("/home/me");
        assertEquals("~", Banner.displayFolder(home, home));
        assertEquals("~/projects/demo", Banner.displayFolder(home.resolve("projects/demo"), home));
        assertEquals(Paths.get("/opt/data").toAbsolutePath().toString(),
            Banner.displayFolder(Paths.get("/opt/data"), home));
    }
}
