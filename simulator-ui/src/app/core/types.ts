/**
 * Tipos para la comunicación con el Core Java
 * Estos tipos definen la estructura de los mensajes entre la UI y el núcleo
 */

// ─────────────────────────────────────────────────────────────
// Versionado del contrato
// ─────────────────────────────────────────────────────────────

export const CORE_PROTOCOL_VERSION = '1.0.0';

// ─────────────────────────────────────────────────────────────
// Mensajes del Core → UI
// ─────────────────────────────────────────────────────────────

export type CoreMessageType =
  | 'SYSTEM_STATUS'
  | 'GROUPS_UPDATE'
  | 'FLOW_UPDATE'
  | 'METRICS_UPDATE'
  | 'LOG_ENTRY'
  | 'VARIABLE_UPDATE'
  | 'INITIAL_STATE'
  | 'CONNECTION_STATUS'
  | 'ERROR'
  | 'TRACE_EVENT'
  | 'BRIDGE_TIMEOUT'
  | 'BRIDGE_RECONNECTING'
  | 'BRIDGE_RECONNECT_EXHAUSTED'
  | 'PLUGIN_VALIDATION_RESULT'
  | 'PLUGIN_INSTALL_RESULT'
  | 'RESTART_REQUIRED'
  | 'ROLLBACK_REPORT';

export interface CoreMessage<T = unknown> {
  type: CoreMessageType;
  timestamp: number;
  protocolVersion?: string;
  commandId?: string; // For correlation
  payload: T;
}

export interface CoreCommandErrorPayload {
  commandId?: string;
  clientRequestId?: string; // Re-emitted by backend for CREATE_* correlation
  status: 'error';
  code:
    | 'INVALID_ENVELOPE'
    | 'INVALID_PAYLOAD'
    | 'UNSUPPORTED_COMMAND'
    | 'NOT_FOUND'
    | 'PROTOCOL_VERSION_MISMATCH'
    | 'INTERNAL_ERROR'
    | 'BRIDGE_TIMEOUT'
    | 'BRIDGE_RECONNECTING'
    | 'BRIDGE_RECONNECT_EXHAUSTED';
  message: string;
  details?: Record<string, unknown>;
  recoverable?: boolean;
}

export interface CoreCommandOkPayload {
  commandId?: string;
  clientRequestId?: string; // Re-emitted by backend for CREATE_* correlation
  status: 'ok';
  result?: string;
}

export interface SystemStatusPayload {
  status: 'running' | 'stopped' | 'processing';
  uptime: number;
  totalMessages: number;
  messagesPerSecond: number;
}

export interface RollbackReportPayload {
  pluginId: string;
  message: string;
  timestamp: number;
}

export interface MetricsPayload {
  cpu: number;
  memory: number;
  heap: number;
  threads: number;
  messagesPerSecond: number;
  totalMessages: number;
  networkUp: number;
  networkDown: number;
  uptime: number;
  activeConnections: number;
  errorCount: number;
}

export interface FlowMetricsPayload {
  flowId: string;
  throughput: number;
  latency: number;
  errorRate: number;
  connectionStatus: 'connected' | 'disconnected' | 'error' | 'warning';
  lastError?: string;
}

export interface LogPayload {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'data';
  source: string;
  message: string;
  commandId?: string; // Correlated command
}

export interface TracePayload {
  commandId: string;
  type: 'START' | 'END';
  operation: string;
  timestamp: number;
  durationMs?: number;
  status?: 'ok' | 'error';
}

export interface ConnectorPluginDescriptor {
  pluginId: string;
  displayName: string;
  pluginVersion: string;
  coreApiVersion: string;
  configSchema: Record<string, unknown>;
  external: boolean;
}

// ─────────────────────────────────────────────────────────────
// Mensajes de la UI → Core (Comandos)
// ─────────────────────────────────────────────────────────────

export type UICommandType =
  | 'START_SYSTEM'
  | 'STOP_SYSTEM'
  | 'START_GROUP'
  | 'STOP_GROUP'
  | 'PAUSE_GROUP'
  | 'UPDATE_GROUP_CONFIG'
  | 'UPDATE_FLOW_CONFIG'
  | 'UPDATE_VARIABLE'
  | 'CREATE_GROUP'
  | 'DELETE_GROUP'
  | 'CREATE_FLOW'
  | 'DELETE_FLOW'
  | 'CREATE_VARIABLE'
  | 'DELETE_VARIABLE'
  | 'GET_INITIAL_STATE'
  | 'LOAD_STATE'
  | 'SAVE_STATE'
  | 'GET_CONNECTOR_CATALOG'
  | 'GET_LATEST_CONNECTOR'
  | 'SUBSCRIBE_METRICS'
  | 'UNSUBSCRIBE_METRICS'
  | 'VALIDATE_PLUGIN'
  | 'INSTALL_PLUGIN'
  | 'UNINSTALL_PLUGIN'
  | 'IMPORT_STATE'
  | 'PICK_DIRECTORY'
  | 'UI_LOG';

export interface StartGroupCommandPayload {
  groupId: string;
}

export interface StopGroupCommandPayload {
  groupId: string;
}

export interface PauseGroupCommandPayload {
  groupId: string;
}

export interface CreateGroupCommandPayload {
  name: string;
  threads?: number;
  outputMode?: string;
  description?: string;
  clientRequestId?: string; // For optimistic UI correlation
}

export interface DeleteGroupCommandPayload {
  groupId: string;
}

export interface CreateFlowCommandPayload {
  groupId: string;
  name: string;
  technology: string;
  host: string;
  port: number;
  topic?: string;
  interval?: number;
  burst?: number;
  template?: string;
  format?: 'json' | 'xml' | 'csv' | 'plain';
  clientRequestId?: string; // For optimistic UI correlation
}

export interface DeleteFlowCommandPayload {
  flowId: string;
  groupId: string;
}

export interface UpdateGroupCommandPayload {
  groupId: string;
  name?: string;
  threads?: number;
  outputMode?: string;
  description?: string;
  enabled?: boolean;
}

export interface UpdateFlowCommandPayload {
  flowId: string;
  groupId: string;
  name?: string;
  technology?: string;
  host?: string;
  port?: number;
  topic?: string;
  interval?: number;
  burst?: number;
  template?: string;
  format?: 'json' | 'xml' | 'csv' | 'plain';
  enabled?: boolean;
}

export interface CreateVariableCommandPayload {
  name: string;
  type: string;
  scope: 'local' | 'group' | 'global';
  flowId?: string;
  groupId?: string;
  variableId?: string;
  config?: Record<string, unknown>;
  clientRequestId?: string; // For optimistic UI correlation
}

export interface DeleteVariableCommandPayload {
  variableId: string;
}

export interface UpdateVariableCommandPayload {
  variableId: string;
  name?: string;
  type?: string;
  scope?: 'local' | 'group' | 'global';
  groupId?: string;
  config?: Record<string, unknown>;
}

export interface GetLatestConnectorCommandPayload {
  pluginId: string;
}

export interface ImportStateCommandPayload {
  groups: any[];
  variables: any[];
}



export interface UILogCommandPayload {
  level: 'info' | 'warn' | 'error' | 'debug' | 'data';
  source: string;
  message: string;
}

export interface UICommandPayloadMap {
  START_SYSTEM: undefined;
  STOP_SYSTEM: undefined;
  START_GROUP: StartGroupCommandPayload;
  STOP_GROUP: StopGroupCommandPayload;
  PAUSE_GROUP: PauseGroupCommandPayload;
  UPDATE_GROUP_CONFIG: UpdateGroupCommandPayload;
  UPDATE_FLOW_CONFIG: UpdateFlowCommandPayload;
  UPDATE_VARIABLE: UpdateVariableCommandPayload;
  CREATE_GROUP: CreateGroupCommandPayload;
  DELETE_GROUP: DeleteGroupCommandPayload;
  CREATE_FLOW: CreateFlowCommandPayload;
  DELETE_FLOW: DeleteFlowCommandPayload;
  CREATE_VARIABLE: CreateVariableCommandPayload;
  DELETE_VARIABLE: DeleteVariableCommandPayload;
  GET_INITIAL_STATE: undefined;
  LOAD_STATE: undefined;
  SAVE_STATE: undefined;
  GET_CONNECTOR_CATALOG: undefined;
  GET_LATEST_CONNECTOR: GetLatestConnectorCommandPayload;
  SUBSCRIBE_METRICS: undefined;
  UNSUBSCRIBE_METRICS: undefined;
  VALIDATE_PLUGIN: ValidatePluginCommandPayload;
  INSTALL_PLUGIN: InstallPluginCommandPayload;
  UNINSTALL_PLUGIN: UninstallPluginCommandPayload;
  IMPORT_STATE: ImportStateCommandPayload;
  PICK_DIRECTORY: undefined;
  UI_LOG: UILogCommandPayload;
}

export interface UICommand<T extends UICommandType = UICommandType> {
  type: T;
  id: string; // Backward compatibility
  commandId: string; // Normalized correlation ID
  protocolVersion: string;
  payload?: UICommandPayloadMap[T];
}

export interface GroupConfigPayload {
  groupId: string;
  name?: string;
  threads?: number;
  outputMode?: string;
  description?: string;
}

export interface FlowConfigPayload {
  flowId: string;
  groupId: string;
  name?: string;
  technology?: string;
  host?: string;
  port?: number;
  topic?: string;
  interval?: number;
  burst?: number;
  template?: string;
  format?: 'json' | 'xml' | 'csv' | 'plain';
}

export interface VariableConfigPayload {
  variableId: string;
  name?: string;
  type?: string;
  scope?: 'local' | 'group' | 'global';
  groupId?: string;
  config?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// Estado inicial completo del sistema
// ─────────────────────────────────────────────────────────────

export interface InitialStatePayload {
  systemStatus: SystemStatusPayload;
  groups: GroupState[];
  variables: VariableState[];
  metrics: MetricsPayload;
  connectorCatalog: ConnectorPluginDescriptor[];
  rollbackReport?: RollbackReportPayload;
}

export interface GroupState {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'paused';
  throughput: number;
  description: string;
  threads: number;
  outputMode: string;
  enabled: boolean;
  flows: FlowState[];
}

export interface FlowState {
  id: string;
  name: string;
  technology: string;
  connectionStatus: 'connected' | 'disconnected' | 'error' | 'warning';
  throughput: number;
  latency: number;
  hasError: boolean;
  errorMessage?: string;
  interval: number;
  burst: number;
  topic: string;
  host: string;
  port: number;
  template?: string;
  format?: 'json' | 'xml' | 'csv' | 'plain';
  connectorConfig?: Record<string, any>;
  enabled: boolean;
}

export interface VariableState {
  id: string;
  name: string;
  type: 'numeric' | 'list' | 'string' | 'temporal' | 'point' | 'boolean';
  scope: 'local' | 'group' | 'global';
  flowId?: string;
  groupId?: string;
  config: Record<string, unknown>;
  description?: string;
}

// ─────────────────────────────────────────────────────────────
// Plugin Management Types
// ─────────────────────────────────────────────────────────────

export interface ValidatePluginCommandPayload {
  jarBase64: string;
  pluginName: string;
  pluginVersion: string;
}

export interface InstallPluginCommandPayload {
  jarBase64: string;
  pluginName: string;
  pluginVersion: string;
}

export interface UninstallPluginCommandPayload {
  pluginId: string;
  pluginVersion: string;
}

export interface ValidationEntry {
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  context?: string;
}
 
export interface PluginValidationResultPayload {
  commandId?: string;
  status: string;
  valid: boolean;
  pluginId?: string;
  displayName?: string;
  pluginVersion?: string;
  coreApiVersion?: string;
  logs: ValidationEntry[];
}

export interface PluginInstallResultPayload {
  commandId?: string;
  status: string;
  success: boolean;
  message: string;
  restartRequired: boolean;
}

export interface RestartRequiredPayload {
  message: string;
  delaySeconds: number;
}
