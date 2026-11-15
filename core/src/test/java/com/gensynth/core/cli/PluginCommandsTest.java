package com.gensynth.core.cli;

import com.gensynth.core.config.AppPaths;
import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.plugin.TestPluginJars;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.Assert.*;

/**
 * The {@code plugins} command, run through the shell as the user types it, against a plugins
 * folder of its own.
 */
public class PluginCommandsTest {

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    private Path workingDir;
    private Path home;
    private Path pluginsDir;
    private SimulationManager manager;

    @Before
    public void setUp() throws Exception {
        workingDir = temp.newFolder("work").toPath();
        home = temp.newFolder("home").toPath();
        pluginsDir = temp.newFolder("plugins").toPath();
        Path shared = temp.newFolder("shared").toPath();
        Path outputs = temp.newFolder("outputs").toPath();
        manager = new SimulationManager(() -> new ConnectorCatalogService(pluginsDir, shared),
            warnings -> outputs.resolve("OUTPUT").toString());
        Files.write(workingDir.resolve("test.jar"), TestPluginJars.connector("testconn", "Test Connector", "2.0.0"));
    }

    @After
    public void tearDown() {
        manager.shutdown();
    }

    private String run(String input) throws Exception {
        return run(input, true);
    }

    private String run(String input, boolean withInstaller) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        PrintStream out = new PrintStream(bytes, true, StandardCharsets.UTF_8);
        CliShell shell = new CliShell(manager, CliShell.plainInput(new BufferedReader(new StringReader(input)), out),
            out, workingDir, home, "9.9.9");
        if (withInstaller) {
            shell.usePluginInstaller(new PluginInstallerImpl(pluginsDir, pluginsDir.resolveSibling("shared")));
        }
        shell.run();
        return bytes.toString(StandardCharsets.UTF_8);
    }

    private List<String> pluginJars() throws Exception {
        return TestPluginJars.fileNames(pluginsDir).stream().filter(name -> name.endsWith(".jar")).toList();
    }

    @Test
    public void listsTheIncludedConnectors() throws Exception {
        String output = run("plugins\nexit\n");

        assertTrue(output, output.contains("ID        NAME         VERSION   SOURCE"));
        assertTrue(output, output.contains("file      File Output  1.0.0     included"));
        assertTrue(output, output.contains("rabbitmq  RabbitMQ     1.0.0     included"));
        assertTrue(output, output.contains("Import a plugin with 'plugins add <file.jar>'."));
    }

    @Test
    public void importsAPluginThatTheNextSimulationsUseWithoutRestarting() throws Exception {
        TestProjects.connectorProject(workingDir.resolve("p.gsynth"), "testconn");

        String output = run("""
            see p.gsynth
            plugins add test.jar
            y
            plugins
            see p.gsynth
            start p.gsynth
            exit
            """);

        assertTrue("before: the connector is missing\n" + output, output.contains("testconn"));
        assertTrue(output, output.contains("Test Connector 2.0.0 (id testconn, 1 settings)"));
        assertTrue(output, output.contains("Test connector that accepts every message."));
        assertTrue(output, output.contains("Install Test Connector 2.0.0? [y/N] "));
        assertTrue(output, output.contains("Installed Test Connector 2.0.0. New simulations can use it now."));
        assertTrue(output, output.contains("testconn  Test Connector  2.0.0     imported"));
        assertTrue(output, output.contains("Test Connector 2.0.0"));
        assertTrue(output, output.contains("[1] Started 'p.gsynth'"));
        assertEquals(List.of("testconn-2.0.0.jar"), pluginJars());
        assertFalse("loaded fine: the desktop application must not roll it back",
            Files.exists(pluginsDir.resolve(AppPaths.PENDING_INSTALL_MARKER)));
    }

    @Test
    public void nothingChangesUnlessTheUserSaysYes() throws Exception {
        String output = run("plugins add test.jar\nn\nplugins add test.jar\n");

        assertEquals(output, 2, output.split("Cancelled: nothing was changed.", -1).length - 1);
        assertTrue(pluginJars().isEmpty());
    }

    @Test
    public void stopsTheRunningSimulationsBeforeChangingThePlugins() throws Exception {
        TestProjects.fileProject(workingDir.resolve("a.gsynth"));

        String output = run("start a.gsynth\nplugins add test.jar\nyes\nlist\nexit\n");

        assertTrue(output, output.contains("Warning: The running simulation will be stopped to load the connectors again."));
        assertTrue(output, output.contains("[1] Stopped 'a.gsynth'"));
        assertTrue(output, output.contains("Installed Test Connector 2.0.0."));
        assertTrue(output, output.contains("stopped"));
    }

    @Test
    public void explainsWhyAFileCannotBeImported() throws Exception {
        Files.writeString(workingDir.resolve("notes.txt"), "hello");
        Files.write(workingDir.resolve("broken.jar"), new byte[] {1, 2, 3});

        String output = run("""
            plugins add missing.jar
            plugins add notes.txt
            plugins add broken.jar
            plugins update test.jar
            exit
            """);

        assertTrue(output, output.contains("Error: File not found: "));
        assertTrue(output, output.contains("Error: Only .jar files can be imported: notes.txt"));
        assertTrue(output, output.contains("Error: 'broken.jar' cannot be imported:"));
        assertTrue(output, output.contains("Error: " + PluginCommands.USAGE));
        assertTrue(pluginJars().isEmpty());
    }

    @Test
    public void removesAnImportedPluginButNotAnIncludedOne() throws Exception {
        String output = run("""
            plugins add test.jar
            y
            plugins remove rabbitmq
            plugins remove nothing
            plugins remove testconn
            y
            plugins
            exit
            """);

        assertTrue(output, output.contains("Error: RabbitMQ is included in GenSynth and cannot be removed."));
        assertTrue(output, output.contains("Error: There is no imported plugin with id 'nothing'."));
        assertTrue(output, output.contains("Remove Test Connector 2.0.0? [y/N] "));
        assertTrue(output, output.contains("Removed Test Connector 2.0.0."));
        assertFalse(output, output.contains("imported\n"));
        assertTrue(pluginJars().isEmpty());
    }

    @Test
    public void withoutAnInstallerOnlyTheListIsAvailable() throws Exception {
        String output = run("plugins\nplugins add test.jar\nexit\n", false);

        assertTrue(output, output.contains("rabbitmq"));
        assertTrue(output, output.contains("Error: Plugins cannot be imported or removed here"));
    }

    @Test
    public void theHelpListsThePluginCommands() throws Exception {
        String output = run("help\nexit\n");

        assertTrue(output, output.contains("plugins add <file.jar>"));
        assertTrue(output, output.contains("plugins remove <id>"));
        assertTrue(CliShell.commands(false).contains("plugins"));
    }
}
