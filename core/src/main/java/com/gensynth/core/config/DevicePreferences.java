package com.gensynth.core.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Preferences of this computer, kept out of the project files: a path such as
 * {@code C:\Users\Ana\Results} means nothing on another computer.
 *
 * <p>Stored as {@value #FILE_NAME} ({@code { "outputFolder": "<absolute path>" }}). A missing or
 * unreadable file means the defaults.
 */
public final class DevicePreferences {

    private static final Logger logger = LoggerFactory.getLogger(DevicePreferences.class);

    /** Name of the preferences file. */
    public static final String FILE_NAME = "preferences.json";

    private static final String OUTPUT_FOLDER = "outputFolder";

    private final Path file;
    private final ObjectMapper mapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    private volatile Path outputFolder;

    /**
     * Loads the preferences from a file.
     *
     * @param file the preferences file, or null to keep them in memory only
     */
    public DevicePreferences(Path file) {
        this.file = file;
        this.outputFolder = loadOutputFolder();
    }

    /**
     * Loads the preferences file of a folder.
     *
     * @param folder the folder of {@value #FILE_NAME}, or null to keep the preferences in memory only
     * @return the preferences
     */
    public static DevicePreferences inFolder(String folder) {
        return new DevicePreferences(folder == null || folder.isBlank() ? null : Paths.get(folder).resolve(FILE_NAME));
    }

    /**
     * @return the folder chosen for the generated files, empty when the default one is used
     */
    public Optional<Path> outputFolder() {
        return Optional.ofNullable(outputFolder);
    }

    /**
     * Changes the folder of the generated files and saves the preferences.
     *
     * @param folder an absolute folder, or null to go back to the default one
     * @throws IOException if the preferences file cannot be written
     */
    public synchronized void setOutputFolder(Path folder) throws IOException {
        Path previous = outputFolder;
        outputFolder = folder == null ? null : folder.toAbsolutePath().normalize();
        try {
            save();
        } catch (IOException e) {
            outputFolder = previous;
            throw e;
        }
    }

    private Path loadOutputFolder() {
        if (file == null || !Files.isRegularFile(file)) {
            return null;
        }
        try {
            JsonNode value = mapper.readTree(file.toFile()).path(OUTPUT_FOLDER);
            if (!value.isTextual() || value.asText().isBlank()) {
                return null;
            }
            Path folder = Paths.get(value.asText());
            if (!folder.isAbsolute()) {
                logger.warn("Ignoring the output folder in {}: '{}' is not an absolute path", file, folder);
                return null;
            }
            return folder;
        } catch (IOException | RuntimeException e) {
            logger.warn("Could not read {}, using the default preferences: {}", file, e.getMessage());
            return null;
        }
    }

    private void save() throws IOException {
        if (file == null) {
            return;
        }
        Map<String, Object> data = new LinkedHashMap<>();
        if (outputFolder != null) {
            data.put(OUTPUT_FOLDER, outputFolder.toString());
        }
        if (file.getParent() != null) {
            Files.createDirectories(file.getParent());
        }
        mapper.writeValue(file.toFile(), data);
    }
}
