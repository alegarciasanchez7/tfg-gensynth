package com.gensynth.core.persistence;

import com.gensynth.core.model.GroupDefinition;
import com.gensynth.core.model.Variable;

import java.util.List;

/**
 * Repository interface for persisting gen-synth state to storage.
 *
 * Implementations are responsible for loading and saving:
 * - GroupDefinition configurations
 * - FlowDefinition configurations (nested within groups)
 * - Variable definitions (across all scopes)
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
     * Clears all persisted state (groups, flows, variables).
     *
     * @throws StateRepositoryException if clearing fails
     */
    void clear() throws StateRepositoryException;

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
