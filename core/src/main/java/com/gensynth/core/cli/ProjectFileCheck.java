package com.gensynth.core.cli;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.persistence.ProjectFileFormat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tells whether a file is a valid GenSynth project, for the colors of the command line. The
 * highlighter asks on every key, so each answer is kept until the file changes.
 */
final class ProjectFileCheck {

    private record Entry(long modified, long size, boolean valid) {
    }

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<Path, Entry> cache = new ConcurrentHashMap<>();

    /**
     * @param file any path
     * @return true if it is a {@code .gsynth} file that {@link ProjectFileFormat#read} accepts
     */
    boolean isValidProject(Path file) {
        if (!ProjectFileFormat.hasExtension(String.valueOf(file.getFileName())) || !Files.isRegularFile(file)) {
            return false;
        }
        try {
            long modified = Files.getLastModifiedTime(file).toMillis();
            long size = Files.size(file);
            Entry cached = cache.get(file);
            if (cached != null && cached.modified() == modified && cached.size() == size) {
                return cached.valid();
            }
            boolean valid = readable(file);
            cache.put(file, new Entry(modified, size, valid));
            return valid;
        } catch (IOException e) {
            return false;
        }
    }

    private boolean readable(Path file) {
        try {
            ProjectFileFormat.read(file, objectMapper);
            return true;
        } catch (IOException | RuntimeException e) {
            return false;
        }
    }
}
