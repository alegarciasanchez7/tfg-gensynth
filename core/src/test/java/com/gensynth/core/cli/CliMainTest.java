package com.gensynth.core.cli;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.Assert.assertEquals;

public class CliMainTest {

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    @Test
    public void eachSessionIsAddedAtTheEndOfTheLog() throws Exception {
        Path log = temp.getRoot().toPath().resolve("logs").resolve("cli.log");
        try (PrintStream first = CliMain.openAppending(log)) {
            first.println("first session");
        }
        try (PrintStream second = CliMain.openAppending(log)) {
            second.println("second session");
        }

        assertEquals(List.of("first session", "second session"), Files.readAllLines(log, StandardCharsets.UTF_8));
    }
}
