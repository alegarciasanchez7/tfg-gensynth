package com.gensynth.core.persistence;

import com.gensynth.core.model.GroupDefinition;
import com.gensynth.core.model.ProjectSettings;
import com.gensynth.core.model.Variable;

import java.util.List;

/**
 * Repository interface for persisting gen-synth state to storage.
 *
 * Implementations are responsible for loading and saving:
 * - GroupDefinition configurations
 * - FlowDefinition configurations (nested within groups)
 * - Variable definitions (across all scopes)
 * - Project settings (tick clock configuration)
 *
 * The repository abstracts the storage mechanism, allowing for
 * different implementations (JSON files, databases, etc.).
 */
public interface StateRepository {

    /**
     * Loads all groups from storage.
     *
     * @return List of GroupDefinition objects. Empty list if no groups exist.
     * @throws StateRepositoryException if loading fails
     */
    List<GroupDefinition> loadGroups() throws StateRepositoryException;

    /**
     * Saves all groups to storage.
     *
     * Replaces all previously saved groups (full overwrite).
     *
     * @param groups List of GroupDefinition objects to save
     * @throws StateRepositoryException if saving fails
     */
    void saveGroups(List<GroupDefinition> groups) throws StateRepositoryException;

    /**
     * Loads all variables from storage.
     *
     * @return List of Variable objects. Empty list if no variables exist.
     * @throws StateRepositoryException if loading fails
     */
    List<Variable> loadVariables() throws StateRepositoryException;

    /**
     * Saves all variables to storage.
     *
     * Replaces all previously saved variables (full overwrite).
     *
     * @param variables List of Variable objects to save
     * @throws StateRepositoryException if saving fails
     */
    void saveVariables(List<Variable> variables) throws StateRepositoryException;

    /**
     * Loads the project settings from storage.
     *
     * @return the persisted settings, or the defaults if none were saved
     * @throws StateRepositoryException if loading fails
     */
    ProjectSettings loadSettings() throws StateRepositoryException;

    /**
     * Saves the project settings to storage (full overwrite).
     *
     * @param settings the settings to save
     * @throws StateRepositoryException if saving fails
     */
    void saveSettings(ProjectSettings settings) throws StateRepositoryException;

    /**
     * Clears all persisted state (groups, flows, variables, settings).
     *
     * @throws StateRepositoryException if clearing fails
     */
    void clear() throws StateRepositoryException;

    /**
     * Exports the current state to a single file.
     *
     * @param targetFile Path where the state should be exported
     * @param groups List of groups to export
     * @param variables List of variables to export
     * @param settings Project settings to export
     * @throws StateRepositoryException if export fails
     */
    void exportState(java.nio.file.Path targetFile, List<GroupDefinition> groups, List<Variable> variables, ProjectSettings settings) throws StateRepositoryException;

    /**
     * Gets the root directory where state is persisted.
     *
     * @return String path to state directory
     */
    String getStateDirectory();

    /**
     * Checks if the repository is initialized and ready for use.
     *
     * @return true if ready, false otherwise
     */
    boolean isReady();

    /**
     * Indicates an error in the state repository.
     */
    class StateRepositoryException extends Exception {
        public StateRepositoryException(String message) {
            super(message);
        }

        public StateRepositoryException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
