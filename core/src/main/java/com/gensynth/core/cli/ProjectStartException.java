package com.gensynth.core.cli;

import com.gensynth.core.model.StartProblem;

import java.util.List;

/**
 * A project that cannot start, with every reason found, so the command line can list them all
 * instead of only the first one.
 */
public class ProjectStartException extends IllegalStateException {

    private final String fileName;
    private final transient List<StartProblem> problems;

    /**
     * @param fileName name of the project file
     * @param problems the reasons why it cannot start (at least one)
     */
    public ProjectStartException(String fileName, List<StartProblem> problems) {
        super("'" + fileName + "' cannot start: " + problems.get(0).message()
            + (problems.size() > 1 ? " (and " + (problems.size() - 1) + " more)" : ""));
        this.fileName = fileName;
        this.problems = List.copyOf(problems);
    }

    /**
     * @return name of the project file
     */
    public String getFileName() {
        return fileName;
    }

    /**
     * @return the reasons why the project cannot start
     */
    public List<StartProblem> getProblems() {
        return problems;
    }
}
