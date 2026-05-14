# Gen-Synth Bridge Standards

This document defines the communication standard between the Java Core and the React UI. It serves as a single source of truth for command identifiers, payload structures, and implementation requirements.

## 1. Protocol Overview

- **Format**: JSON
- **Version**: `1.0.0`
- **Pattern**: Request-Response (via `commandId`) and Broadcast Events.

## 2. Command Catalog (UI -> Core)

Every command sent from the UI MUST include:
- `type`: One of the identifiers below.
- `commandId`: A unique string for tracking the response.
- `protocolVersion`: Fixed at `1.0.0`.
- `payload`: Object containing parameters.

### System & Metrics
| Command | Payload | Description |
|---------|---------|-------------|
| `START_SYSTEM` | - | Starts all enabled groups and flows. |
| `STOP_SYSTEM` | - | Stops all running flows. |
| `GET_INITIAL_STATE` | - | Requests full state (groups, flows, variables, metrics). |
| `SUBSCRIBE_METRICS` | - | Starts streaming performance metrics. |
| `UNSUBSCRIBE_METRICS` | - | Stops metrics streaming. |
| `UI_LOG` | `{ level, source, message }` | Sends a UI log to the backend console. |

### Group Management
| Command | Payload | Description |
|---------|---------|-------------|
| `CREATE_GROUP` | `{ name, description? }` | Creates a new group. |
| `DELETE_GROUP` | `{ groupId }` | Permanently deletes a group. |
| `UPDATE_GROUP_CONFIG` | `{ groupId, ...config }` | Updates group settings (enabled, threads, etc). |
| `START_GROUP` | `{ groupId }` | Starts a specific group. |
| `STOP_GROUP` | `{ groupId }` | Stops a specific group. |
| `PAUSE_GROUP` | `{ groupId }` | Pauses a specific group. |
| `CLONE_GROUP` | `{ groupId, count }` | Clones a group and its flows N times. |

### Flow Management
| Command | Payload | Description |
|---------|---------|-------------|
| `CREATE_FLOW` | `{ groupId, name, technology, host, port, ... }` | Creates a new flow in a group. |
| `DELETE_FLOW` | `{ groupId, flowId }` | Deletes a flow from a group. |
| `UPDATE_FLOW_CONFIG` | `{ groupId, flowId, ...config }` | Updates flow configuration. |
| `CLONE_FLOW` | `{ groupId, flowId, count }` | Clones a specific flow N times. |

### Variable Management
| Command | Payload | Description |
|---------|---------|-------------|
| `CREATE_VARIABLE` | `{ name, type, scope, ... }` | Creates a new variable. |
| `DELETE_VARIABLE` | `{ variableId }` | Deletes a variable. |
| `UPDATE_VARIABLE` | `{ variableId, ...config }` | Updates a variable definition. |

### Plugins & Connectors
| Command | Payload | Description |
|---------|---------|-------------|
| `GET_CONNECTOR_CATALOG` | - | Lists all available connector plugins. |
| `GET_LATEST_CONNECTOR` | `{ pluginId }` | Gets latest version of a plugin. |
| `VALIDATE_PLUGIN` | `{ jarBase64, ... }` | Validates a plugin JAR before install. |
| `INSTALL_PLUGIN` | `{ jarBase64, ... }` | Installs a new plugin (requires restart). |
| `UNINSTALL_PLUGIN` | `{ pluginId, version }` | Uninstalls a plugin. |

### Persistence & Files
| Command | Payload | Description |
|---------|---------|-------------|
| `LOAD_STATE` | - | Opens native dialog to load a project. |
| `SAVE_STATE` | - | Opens native dialog to save project. |
| `EXPORT_STATE` | `{ filePath }` | Exports state to a specific path. |
| `IMPORT_STATE` | `{ groups, variables }` | Injects full state. |
| `PICK_DIRECTORY` | - | Opens native folder picker. |

## 3. Implementation Checklist

When adding a new command, these files MUST be updated:

### Backend (Java)
- [ ] `UiBridgeWebSocketServer.java`:
    - Add to `SUPPORTED_COMMANDS` Set.
    - Add `case` to `handleCommand` switch.
    - Implement logic (ideally in a private `handleX` method).
    - Send response via `sendAck` or `sendCreatedResponse`.
    - Broadcast updates using `broadcastGroupsUpdate()` if state changed.

### Frontend (TypeScript)
- [ ] `simulator-ui/src/app/core/types.ts`: Add to `UICommandType` union.
- [ ] `simulator-ui/src/app/core/bridge.ts`:
    - Add to `SUPPORTED_COMMANDS` Set.
    - Add to `validateCommand` switch with proper field checks.
- [ ] `simulator-ui/src/app/context/AppContext.tsx`: Add method to the context and implement bridge call.

## 4. Bridge Rules
1. **Never use `any`**: Ensure types are synchronized between Java (POJOs) and TS (Interfaces).
2. **Standard Responses**: Use `status: "ok"` or `status: "error"`.
3. **Atomic Broadcasts**: After a state-changing command, always broadcast the full `GROUPS_UPDATE` to ensure all UI components are in sync.
4. **Desktop Safety**: In JCEF mode, always handle the case where the browser might be closed during a long-running command.
