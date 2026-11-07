package com.gensynth.core.model;

import java.util.List;

/**
 * A reason why a project cannot start, or why part of it will not send, found without
 * starting it (see {@code SystemCommandHandler.checkProject}).
 *
 * @param kind    what is wrong
 * @param group   name of the group it belongs to
 * @param flow    name of the flow it belongs to, or null when it concerns the whole group
 * @param message what is wrong, for the user
 * @param cycle   for {@link Kind#CYCLE}, the variables of the cycle in order, ending with the
 *                first one again; empty otherwise
 */
public record StartProblem(Kind kind, String group, String flow, String message, List<String> cycle) {

    /** What is wrong. */
    public enum Kind {
        /** A variable has an invalid configuration (e.g. minimum above maximum). */
        INVALID_VARIABLE,
        /** Variables refer to each other in a cycle (formulas, templates or conditional rules). */
        CYCLE,
        /** A variable refers to a variable that does not exist. */
        BROKEN_REFERENCE,
        /** A template uses {@code .itemN} on a list that is not a Fixed Subset. */
        INVALID_ITEM_REFERENCE,
        /** The connector of a flow is not installed. */
        CONNECTOR_NOT_INSTALLED,
        /** The connector settings of a flow are not valid. */
        INVALID_CONNECTOR_CONFIG,
        /** The connector of a flow could not open its connection. */
        CONNECTOR_FAILED,
        /** Any other reason. */
        OTHER
    }

    /**
     * @param kind    what is wrong
     * @param group   name of the group it belongs to
     * @param flow    name of the flow, or null
     * @param message what is wrong, for the user
     * @param cycle   the variables of the cycle (null is stored as empty)
     */
    public StartProblem {
        cycle = cycle == null ? List.of() : List.copyOf(cycle);
    }

    /**
     * @return true when the project cannot start at all; connector problems only leave their
     *         flow without sending, as in the desktop application
     */
    public boolean blocking() {
        return kind != Kind.CONNECTOR_NOT_INSTALLED
            && kind != Kind.INVALID_CONNECTOR_CONFIG
            && kind != Kind.CONNECTOR_FAILED;
    }
}
