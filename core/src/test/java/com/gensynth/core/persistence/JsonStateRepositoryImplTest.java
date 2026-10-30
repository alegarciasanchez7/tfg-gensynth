package com.gensynth.core.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.model.ProjectSettings;
import com.gensynth.core.persistence.StateRepository.StateRepositoryException;
import org.junit.Test;

import java.io.IOException;
import java.nio.file.AccessDeniedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.Assert.*;

public class JsonStateRepositoryImplTest {

    private JsonStateRepositoryImpl newRepository() throws IOException {
        return new JsonStateRepositoryImpl(Files.createTempDirectory("gensynth-state-").toString());
    }

    @Test
    public void exportsToAFolderWithSpacesInItsName() throws Exception {
        Path folder = Files.createDirectories(Files.createTempDirectory("gensynth-export-").resolve("My Projects"));
        Path target = folder.resolve("weather station.gsynth");

        newRepository().exportState(target, List.of(), List.of(), ProjectSettings.defaults());

        assertTrue(Files.exists(target));
        assertEquals(ProjectFileFormat.FORMAT_ID,
            ProjectFileFormat.read(target, new ObjectMapper()).path("format").asText());
    }

    @Test
    public void exportToAnUnwritablePathNamesThePath() throws Exception {
        // A regular file used as the parent folder makes the write fail on every OS
        Path notAFolder = Files.createFile(Files.createTempDirectory("gensynth-export-").resolve("file.txt"));
        Path target = notAFolder.resolve("project.gsynth");

        StateRepositoryException error = assertThrows(StateRepositoryException.class,
            () -> newRepository().exportState(target, List.of(), List.of(), ProjectSettings.defaults()));

        assertTrue(error.getMessage(), error.getMessage().startsWith("Could not write " + target.toAbsolutePath()));
    }

    @Test
    public void accessDeniedExplainsThatTheFolderIsNotWritable() throws Exception {
        Path folder = Files.createTempDirectory("gensynth-export-");
        Path target = folder.resolve("project.gsynth");

        String message = JsonStateRepositoryImpl.exportFailureMessage(target, new AccessDeniedException(target.toString()));

        assertTrue(message, message.startsWith("You do not have permission to write in " + folder.toAbsolutePath()));
    }
}
