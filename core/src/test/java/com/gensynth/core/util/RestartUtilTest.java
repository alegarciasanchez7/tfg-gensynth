package com.gensynth.core.util;

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class RestartUtilTest {

    private static final String[] ARGS = {"--desktop", "--verbose"};

    @Test
    public void launcherCommandRunsTheLauncherWithTheOriginalArguments() {
        assertEquals(List.of("GenSynth", "--desktop", "--verbose"), RestartUtil.launcherCommand("GenSynth", ARGS));
        assertEquals(List.of("GenSynth"), RestartUtil.launcherCommand("GenSynth", null));
    }

    @Test
    public void mavenCommandPassesTheArgumentsAsExecArgs() {
        assertEquals(List.of("mvn", "exec:java", "-Dexec.mainClass=com.gensynth.core.App",
                "-Dexec.args=--desktop --verbose"), RestartUtil.mavenCommand(false, ARGS));
        assertEquals(List.of("mvn.cmd", "exec:java", "-Dexec.mainClass=com.gensynth.core.App"),
                RestartUtil.mavenCommand(true, new String[0]));
        assertEquals(3, RestartUtil.mavenCommand(false, null).size());
    }

    @Test
    public void javaCommandKeepsTheClassPathAndEndsWithTheArguments() {
        List<String> command = RestartUtil.javaCommand("app.jar", ARGS);
        assertTrue(command.get(0).endsWith("java"));
        int classPath = command.indexOf("-cp");
        assertEquals("app.jar", command.get(classPath + 1));
        assertEquals("com.gensynth.core.App", command.get(classPath + 2));
        assertEquals(List.of("--desktop", "--verbose"), command.subList(command.size() - 2, command.size()));

        List<String> withoutArgs = RestartUtil.javaCommand("app.jar", null);
        assertEquals("com.gensynth.core.App", withoutArgs.get(withoutArgs.size() - 1));
        assertFalse(withoutArgs.contains("--desktop"));
    }
}
