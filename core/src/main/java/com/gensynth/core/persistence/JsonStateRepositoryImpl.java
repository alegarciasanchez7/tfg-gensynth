package com.gensynth.core.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.gensynth.core.model.GroupDefinition;
import com.gensynth.core.model.Variable;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * JSON-based implementation of StateRepository.
 *
 * Persists state to JSON files in a configurable directory:
 * - groups.json: All GroupDefinition objects with nested FlowDefinition
 * - variables.json: All Variable objects
 *
 * Files are automatically created if they don't exist. If loading from a
 * non-existent file, returns an empty list.
 */
public class JsonStateRepositoryImpl implements StateRepository {

    private static final String GROUPS_FILE = "groups.json";
    private static final String VARIABLES_FILE = "variables.json";

    private final String stateDirectory;
    private final ObjectMapper objectMapper;
    private boolean initialized = false;

    /**
     * Creates a JsonStateRepositoryImpl with a custom state directory.
     *
     * @param stateDirectory Path to directory where state files will be stored
     */
    public JsonStateRepositoryImpl(String stateDirectory) {
        this.stateDirectory = stateDirectory != null ? stateDirectory : "core/state";
        this.objectMapper = new ObjectMapper();
        this.objectMapper.enable(SerializationFeature.INDENT_OUTPUT);
        this.initialized = initializeDirectory();
    }

    /**
     * Creates a JsonStateRepositoryImpl with default state directory (core/state).
     */
    public JsonStateRepositoryImpl() {
        this("core/state");
    }

    /**
     * Initializes the state directory if it doesn't exist.
     *
     * @return true if directory is ready, false if initialization failed
     */
    private boolean initializeDirectory() {
        try {
            Path path = Paths.get(stateDirectory);
            Files.createDirectories(path);
            return true;
        } catch (IOException e) {
            System.err.println("Failed to initialize state directory: " + stateDirectory);
            e.printStackTrace();
            return false;
        }
    }

    @Override
    public List<GroupDefinition> loadGroups() throws StateRepositoryException {
        if (!initialized) {
            throw new StateRepositoryException("Repository not initialized");
        }

        File file = new File(stateDirectory, GROUPS_FILE);
        if (!file.exists()) {
            return new ArrayList<>();
        }

        try {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> data = objectMapper.readValue(file, List.class);
            List<GroupDefinition> groups = new ArrayList<>();
            for (Map<String, Object> groupData : data) {
                groups.add(GroupDefinition.fromPayload(groupData));
            }
            return groups;
        } catch (IOException e) {
            throw new StateRepositoryException("Failed to load groups from " + file.getAbsolutePath(), e);
        }
    }

    @Override
    public void saveGroups(List<GroupDefinition> groups) throws StateRepositoryException {
        if (!initialized) {
            throw new StateRepositoryException("Repository not initialized");
        }

        File file = new File(stateDirectory, GROUPS_FILE);
        try {
            List<Map<String, Object>> data = new ArrayList<>();
            for (GroupDefinition group : groups) {
                data.add(group.toPayload());
            }
            objectMapper.writeValue(file, data);
        } catch (IOException e) {
            throw new StateRepositoryException("Failed to save groups to " + file.getAbsolutePath(), e);
        }
    }

    @Override
    public List<Variable> loadVariables() throws StateRepositoryException {
        if (!initialized) {
            throw new StateRepositoryException("Repository not initialized");
        }

        File file = new File(stateDirectory, VARIABLES_FILE);
        if (!file.exists()) {
            return new ArrayList<>();
        }

        try {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> data = objectMapper.readValue(file, List.class);
            List<Variable> variables = new ArrayList<>();
            for (Map<String, Object> varData : data) {
                variables.add(Variable.fromPayload(varData));
            }
            return variables;
        } catch (IOException e) {
            throw new StateRepositoryException("Failed to load variables from " + file.getAbsolutePath(), e);
        }
    }

    @Override
    public void saveVariables(List<Variable> variables) throws StateRepositoryException {
        if (!initialized) {
            throw new StateRepositoryException("Repository not initialized");
        }

        File file = new File(stateDirectory, VARIABLES_FILE);
        try {
            List<Map<String, Object>> data = new ArrayList<>();
            for (Variable variable : variables) {
                data.add(variable.toPayload());
            }
            objectMapper.writeValue(file, data);
        } catch (IOException e) {
            throw new StateRepositoryException("Failed to save variables to " + file.getAbsolutePath(), e);
        }
    }

    @Override
    public void clear() throws StateRepositoryException {
        try {
            File groupsFile = new File(stateDirectory, GROUPS_FILE);
            if (groupsFile.exists() && !groupsFile.delete()) {
                throw new IOException("Failed to delete " + GROUPS_FILE);
            }

            File variablesFile = new File(stateDirectory, VARIABLES_FILE);
            if (variablesFile.exists() && !variablesFile.delete()) {
                throw new IOException("Failed to delete " + VARIABLES_FILE);
            }
        } catch (IOException e) {
            throw new StateRepositoryException("Failed to clear state directory", e);
        }
    }

    @Override
    public String getStateDirectory() {
        return stateDirectory;
    }

    @Override
    public boolean isReady() {
        return initialized;
    }
}
