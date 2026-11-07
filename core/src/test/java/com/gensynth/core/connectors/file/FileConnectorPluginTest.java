package com.gensynth.core.connectors.file;

import com.gensynth.plugin.api.ConnectorConfig;
import com.gensynth.plugin.api.ConnectorContext;
import com.gensynth.plugin.api.ConnectorSession;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * Two File Output flows must never write to the same file: the second one fails to connect with
 * a clear message until the first closes its session.
 */
public class FileConnectorPluginTest {

    private final FileConnectorPlugin plugin = new FileConnectorPlugin();
    private final List<ConnectorSession> sessions = new ArrayList<>();
    private Path outputDir;

    @Before
    public void setUp() throws IOException {
        outputDir = Files.createTempDirectory("gensynth-file-connector-");
    }

    @After
    public void tearDown() throws Exception {
        for (ConnectorSession session : sessions) {
            session.close();
        }
    }

    @Test
    public void namesThatSanitizeToTheSameFileAreRefused() throws IOException {
        open("Sensor 1", "Plant", null);

        IOException error = openExpectingFailure("Sensor_1", "Plant", null);

        Path file = outputDir.resolve("Plant").resolve("Sensor_1.json").toAbsolutePath().normalize();
        assertEquals(FileConnectorPlugin.fileInUseMessage(file), error.getMessage());
        assertEquals("File \"" + file + "\" is already used by another flow; give this flow a different name or File name",
                error.getMessage());
    }

    @Test
    public void theSameExplicitFileNameIsRefused() throws IOException {
        open("Sensor", "Plant", "readings");

        IOException error = openExpectingFailure("Pump", "Plant", "readings");

        assertTrue(error.getMessage(), error.getMessage().contains("is already used by another flow"));
    }

    @Test
    public void groupsMappedToTheSameFolderAreRefused() throws IOException {
        open("Sensor", "Plant A", null);

        IOException error = openExpectingFailure("Sensor", "Plant_A", null);

        assertTrue(error.getMessage(), error.getMessage().contains("is already used by another flow"));
    }

    @Test
    public void closingASessionFreesItsFile() throws Exception {
        ConnectorSession first = open("Sensor 1", "Plant", null);
        first.send("{\"a\":1}".getBytes(StandardCharsets.UTF_8), Map.of());
        first.close();
        sessions.remove(first);

        ConnectorSession second = open("Sensor_1", "Plant", null);

        assertTrue(second.isHealthy());
    }

    @Test
    public void differentNamesWriteToDifferentFiles() throws IOException {
        open("Sensor 1", "Plant", null);
        open("Sensor 2", "Plant", null);
        open("Sensor 1", "Other", null);

        assertEquals(3, sessions.size());
    }

    @Test
    public void aFailedOpenDoesNotKeepTheFileTaken() throws IOException {
        // A regular file where the group folder should be makes the open fail
        Path blocker = Files.createFile(outputDir.resolve("Plant"));

        IOException first = openExpectingFailure("Sensor", "Plant", null);
        IOException second = openExpectingFailure("Sensor", "Plant", null);

        assertNotEquals("the second attempt must fail for the same reason, not as a duplicate",
                FileConnectorPlugin.fileInUseMessage(outputDir.resolve("Plant").resolve("Sensor.json")
                        .toAbsolutePath().normalize()), second.getMessage());
        assertEquals(first.getClass(), second.getClass());

        Files.delete(blocker);
        assertNotNull(open("Sensor", "Plant", null));
    }

    private ConnectorSession open(String flowName, String groupName, String fileName) throws IOException {
        ConnectorSession session = plugin.connect(config(fileName), new ConnectorContext(flowName, groupName, null));
        sessions.add(session);
        return session;
    }

    private IOException openExpectingFailure(String flowName, String groupName, String fileName) {
        try {
            open(flowName, groupName, fileName);
        } catch (IOException ex) {
            return ex;
        }
        fail("Opening flow " + flowName + " in group " + groupName + " must fail");
        return null;
    }

    private ConnectorConfig config(String fileName) {
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("outputDir", outputDir.toString());
        if (fileName != null) {
            raw.put("fileName", fileName);
        }
        return ConnectorConfig.resolve(plugin.fields(), raw);
    }
}
