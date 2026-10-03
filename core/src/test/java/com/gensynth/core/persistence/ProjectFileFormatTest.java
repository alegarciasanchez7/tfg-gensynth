package com.gensynth.core.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.*;

public class ProjectFileFormatTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private ObjectNode validProject() {
        ObjectNode root = mapper.createObjectNode();
        root.put("format", ProjectFileFormat.FORMAT_ID);
        root.put("version", ProjectFileFormat.VERSION);
        root.putArray("groups");
        root.putArray("variables");
        return root;
    }

    private void assertRejected(ObjectNode root) {
        assertThrows(IllegalArgumentException.class, () -> ProjectFileFormat.validate(root));
    }

    @Test
    public void validateAcceptsValidProject() {
        ProjectFileFormat.validate(validProject());
    }

    @Test
    public void validateRejectsMissingOrUnknownFormat() {
        ObjectNode missing = validProject();
        missing.remove("format");
        assertRejected(missing);

        ObjectNode unknown = validProject();
        unknown.put("format", "something-else");
        assertRejected(unknown);
    }

    @Test
    public void validateRejectsMissingVersion() {
        ObjectNode root = validProject();
        root.remove("version");
        assertRejected(root);
    }

    @Test
    public void validateRejectsNonArrayGroupsOrVariables() {
        ObjectNode groups = validProject();
        groups.put("groups", "not-an-array");
        assertRejected(groups);

        ObjectNode variables = validProject();
        variables.remove("variables");
        assertRejected(variables);
    }

    @Test
    public void validateRejectsNonObjectRoot() {
        assertThrows(IllegalArgumentException.class, () -> ProjectFileFormat.validate(mapper.createArrayNode()));
        assertThrows(IllegalArgumentException.class, () -> ProjectFileFormat.validate(null));
    }

    @Test
    public void extensionHelpers() {
        assertTrue(ProjectFileFormat.hasExtension("project.gsynth"));
        assertTrue(ProjectFileFormat.hasExtension("PROJECT.GSYNTH"));
        assertFalse(ProjectFileFormat.hasExtension("project.json"));
        assertFalse(ProjectFileFormat.hasExtension(null));

        assertEquals("/tmp/a.gsynth", ProjectFileFormat.ensureExtension("/tmp/a"));
        assertEquals("/tmp/a.json.gsynth", ProjectFileFormat.ensureExtension("/tmp/a.json"));
        assertEquals("/tmp/a.gsynth", ProjectFileFormat.ensureExtension("/tmp/a.gsynth"));
    }

    @Test
    public void readAcceptsValidProjectFile() throws Exception {
        Path dir = Files.createTempDirectory("gensynth-format-test-");
        Path file = dir.resolve("project.gsynth");
        mapper.writeValue(file.toFile(), validProject());

        ObjectNode project = ProjectFileFormat.read(file, mapper);
        assertEquals(ProjectFileFormat.FORMAT_ID, project.path("format").asText());
    }

    @Test
    public void readRejectsWrongExtensionInvalidJsonAndForeignJson() throws Exception {
        Path dir = Files.createTempDirectory("gensynth-format-test-");

        Path jsonFile = dir.resolve("project.json");
        mapper.writeValue(jsonFile.toFile(), validProject());
        assertThrows(IllegalArgumentException.class, () -> ProjectFileFormat.read(jsonFile, mapper));

        Path brokenFile = dir.resolve("broken.gsynth");
        Files.writeString(brokenFile, "{ not json");
        assertThrows(IllegalArgumentException.class, () -> ProjectFileFormat.read(brokenFile, mapper));

        Path foreignFile = dir.resolve("foreign.gsynth");
        Files.writeString(foreignFile, "{\"groups\":[],\"variables\":[]}");
        assertThrows(IllegalArgumentException.class, () -> ProjectFileFormat.read(foreignFile, mapper));
    }
}
