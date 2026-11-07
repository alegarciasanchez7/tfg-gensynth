package com.gensynth.core.ws;

/**
 * Names shared by the Bridge server and its command handlers: error codes, payload fields,
 * status values and log sources. They are part of the contract with the UI
 * (see BRIDGE_STANDARDS.md), so they are defined once.
 */
public final class BridgeProtocol {

    // ── Error codes ─────────────────────────────────────────────────
    /** The payload of a command is missing a field or has an invalid value. */
    public static final String INVALID_PAYLOAD = "INVALID_PAYLOAD";
    /** The group, flow or variable of a command does not exist. */
    public static final String NOT_FOUND = "NOT_FOUND";

    // ── Payload fields ──────────────────────────────────────────────
    public static final String COMMAND_ID = "commandId";
    public static final String CLIENT_REQUEST_ID = "clientRequestId";
    public static final String STATUS = "status";
    public static final String RESULT = "result";
    public static final String MESSAGE = "message";
    public static final String ERROR = "error";
    public static final String TIMESTAMP = "timestamp";
    public static final String GROUP_ID = "groupId";
    public static final String FLOW_ID = "flowId";
    public static final String VARIABLE_ID = "variableId";

    // ── Values and messages ─────────────────────────────────────────
    /** Status of a running group or flow. */
    public static final String RUNNING = "running";
    /** Prefix of the NOT_FOUND message of a group, followed by its id. */
    public static final String GROUP_NOT_FOUND = "Group not found: ";

    // ── Log sources ─────────────────────────────────────────────────
    public static final String SOURCE_SYSTEM = "SYSTEM";
    public static final String SOURCE_GROUPS = "GROUPS";
    public static final String SOURCE_FLOWS = "FLOWS";
    public static final String SOURCE_VARIABLES = "VARIABLES";
    public static final String SOURCE_PLUGINS = "PLUGINS";

    private BridgeProtocol() {
    }
}
