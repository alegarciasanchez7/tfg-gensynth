package com.gensynth.core.persistence;

import com.gensynth.core.model.GroupDefinition;
import com.gensynth.core.model.ProjectSettings;
import com.gensynth.core.model.Variable;

import java.nio.file.Path;
import java.util.List;

/**
 * State repository that stores nothing. Used by the headless command line, whose projects are
 * read from their own files and must not overwrite the autosave of the desktop application.
 */
public class NoOpStateRepository implements StateRepository {

    @Override
    public List<GroupDefinition> loadGroups() {
        return List.of();
    }

    @Override
    public void saveGroups(List<GroupDefinition> groups) {
        // Nothing is persisted
    }

    @Override
    public List<Variable> loadVariables() {
        return List.of();
    }

    @Override
    public void saveVariables(List<Variable> variables) {
        // Nothing is persisted
    }

    @Override
    public ProjectSettings loadSettings() {
        return ProjectSettings.defaults();
    }

    @Override
    public void saveSettings(ProjectSettings settings) {
        // Nothing is persisted
    }

    @Override
    public void clear() {
        // Nothing to clear
    }

    @Override
    public void exportState(Path targetFile, List<GroupDefinition> groups, List<Variable> variables,
                            ProjectSettings settings) throws StateRepositoryException {
        throw new StateRepositoryException("Export is not supported by the headless engine");
    }

    @Override
    public String getStateDirectory() {
        return "";
    }

    @Override
    public boolean isReady() {
        return true;
    }
}
