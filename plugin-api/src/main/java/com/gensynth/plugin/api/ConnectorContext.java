package com.gensynth.plugin.api;

/**
 * Runtime information about the flow a session is opened for.
 *
 * @param flowName        name of the flow
 * @param groupName       name of the group that contains the flow
 * @param outputDirectory directory of the current simulation session, for connectors that write
 *                        files (relative to GenSynth's working directory)
 */
public record ConnectorContext(String flowName, String groupName, String outputDirectory) {
}
