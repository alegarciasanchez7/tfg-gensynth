package com.gensynth.core.model;

import com.fasterxml.jackson.databind.JsonNode;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * A project file read without running it, with what would stop it from starting.
 *
 * @param file     the project file (resolved to its real path)
 * @param project  the parsed and validated project document
 * @param problems   what would stop it from starting or leave a flow without sending
 * @param connectors name and version of each installed connector the project uses, by
 *                   technology id (e.g. {@code "rabbitmq" -> "RabbitMQ 1.0.0"}); the ones that
 *                   are not installed are missing
 */
public record ProjectReport(Path file, JsonNode project, List<StartProblem> problems, Map<String, String> connectors) {

    /**
     * @param file       the project file
     * @param project    the project document
     * @param problems   the problems found (copied)
     * @param connectors the installed connectors it uses (copied)
     */
    public ProjectReport {
        problems = List.copyOf(problems);
        connectors = Map.copyOf(connectors);
    }
}
