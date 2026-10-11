package com.gensynth.core.cli;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Writes small project files for the command line tests.
 */
final class TestProjects {

    private TestProjects() {
    }

    /**
     * Writes a project with one group and one flow that uses the built-in file connector,
     * ticking every 20 ms, so messages reach disk quickly.
     *
     * @param file where to write the project
     * @return the file
     */
    static Path fileProject(Path file) throws IOException {
        return write(file, project("""
            [{
              "id": "g1", "name": "Sensors", "enabled": true, "outputMode": "parallel",
              "flows": [{
                "id": "f1", "name": "Temperature", "technology": "file", "enabled": true, "everyTicks": 1,
                "template": "{\\"n\\":{{n}}}",
                "connectorConfig": { "format": "txt" }
              }]
            }]
            """, "[]"));
    }

    /**
     * Writes a project whose template accesses an item of a list that is not FIXED_SUBSET,
     * which the engine rejects when the group starts.
     *
     * @param file where to write the project
     * @return the file
     */
    static Path invalidStartProject(Path file) throws IOException {
        return write(file, project("""
            [{
              "id": "g1", "name": "Broken", "enabled": true, "outputMode": "parallel",
              "flows": [{
                "id": "f1", "name": "Flow", "technology": "file", "enabled": true,
                "template": "{{colors.item1}}",
                "connectorConfig": { "format": "txt" }
              }]
            }]
            """, """
            [{
              "id": "v1", "name": "colors", "scope": "GLOBAL", "type": "list",
              "config": {
                "selectionStrategy": "RANDOM",
                "items": [ { "id": "i1", "value": "red", "weight": 1.0 } ]
              }
            }]
            """));
    }

    private static String project(String groups, String variables) {
        return """
            {
              "format": "gensynth-project",
              "version": "1.0.0",
              "groups": %s,
              "variables": %s,
              "settings": { "tick": { "mode": "FIXED_RATE", "value": 20, "unit": "MILLISECONDS" } }
            }
            """.formatted(groups, variables);
    }

    private static Path write(Path file, String content) throws IOException {
        Files.createDirectories(file.getParent());
        return Files.writeString(file, content, StandardCharsets.UTF_8);
    }
}
