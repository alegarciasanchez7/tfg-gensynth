package com.gensynth.core.connectors.runtime;

import java.util.Set;

/**
 * Implemented by a built-in connector some of whose fields the Core sets itself when it opens a
 * session, such as the File Output format, which follows the flow's message format. Those fields
 * are still validated, but the catalog does not show them, so nobody edits them by hand.
 */
public interface CoreSetFields {

    /**
     * @return keys of the fields that the Core sets
     */
    Set<String> coreSetFields();
}
