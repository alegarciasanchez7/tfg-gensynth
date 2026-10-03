package com.gensynth.core.persistence;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/**
 * Definition of the GenSynth project file format (".gsynth").
 *
 * A project file is a JSON document with the following shape:
 * <pre>
 * { "format": "gensynth-project", "version": "1.0.0", "exportedAt": "...", "groups": [...], "variables": [...] }
 * </pre>
 * The extension makes file dialogs show only project files, and the {@code format} marker
 * guarantees that a file renamed to ".gsynth" is still rejected when it is not a GenSynth project.
 */
public final class ProjectFileFormat {

    /** File extension of GenSynth project files, including the leading dot. */
    public static final String EXTENSION = ".gsynth";

    /** Value of the {@code format} field that identifies a GenSynth project file. */
    public static final String FORMAT_ID = "gensynth-project";

    /** Current version of the project file format. */
    public static final String VERSION = "1.0.0";

    private ProjectFileFormat() {
    }

    /**
     * Checks whether a file name or path ends with the project file extension (case-insensitive).
     *
     * @param name file name or path, may be null
     * @return true if the name ends with {@link #EXTENSION}
     */
    public static boolean hasExtension(String name) {
        return name != null && name.toLowerCase(Locale.ROOT).endsWith(EXTENSION);
    }

    /**
     * Appends the project file extension to a path that does not have it yet.
     *
     * @param path file path chosen by the user
     * @return the path ending with {@link #EXTENSION}
     */
    public static String ensureExtension(String path) {
        return hasExtension(path) ? path : path + EXTENSION;
    }

    /**
     * Validates that a parsed JSON document is a GenSynth project file.
     *
     * @param root parsed JSON document
     * @throws IllegalArgumentException if the document is not a valid project file
     */
    public static void validate(JsonNode root) {
        if (root == null || !root.isObject()) {
            throw new IllegalArgumentException("Not a GenSynth project file: root must be a JSON object");
        }
        if (!FORMAT_ID.equals(root.path("format").asText(null))) {
            throw new IllegalArgumentException("Not a GenSynth project file: missing or unknown 'format' marker");
        }
        if (!root.path("version").isTextual()) {
            throw new IllegalArgumentException("Invalid GenSynth project file: missing 'version'");
        }
        if (!root.path("groups").isArray() || !root.path("variables").isArray()) {
            throw new IllegalArgumentException("Invalid GenSynth project file: 'groups' and 'variables' must be arrays");
        }
    }

    /**
     * Reads a project file from disk, checking its extension and content.
     *
     * @param file         path of the project file
     * @param objectMapper mapper used to parse the JSON content
     * @return the parsed project document
     * @throws IllegalArgumentException if the file is not a valid GenSynth project file
     * @throws IOException              if the file cannot be read
     */
    public static ObjectNode read(Path file, ObjectMapper objectMapper) throws IOException {
        if (!hasExtension(file.getFileName().toString())) {
            throw new IllegalArgumentException("Not a GenSynth project file: expected a " + EXTENSION + " file");
        }
        String content = Files.readString(file, StandardCharsets.UTF_8);
        JsonNode root;
        try {
            root = objectMapper.readTree(content);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Not a GenSynth project file: invalid JSON content", e);
        }
        validate(root);
        return (ObjectNode) root;
    }
}
