/**
 * Tipos para la comunicación con el Core Java
 * Estos tipos definen la estructura de los mensajes entre la UI y el núcleo
 */

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
  | 'CONNECTION_STATUS'
  | 'ERROR';

export interface CoreMessage<T = unknown> {
  type: CoreMessageType;
  timestamp: number;
  payload: T;
}

export interface SystemStatusPayload {
  status: 'running' | 'stopped' | 'processing';
  uptime: number;
  totalMessages: number;
  messagesPerSecond: number;
}

export interface MetricsPayload {
  cpu: number;
  memory: number;
  heap: number;
  threads: number;
  messagesPerSecond: number;
  totalMessages: number;
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
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
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
  | 'SUBSCRIBE_METRICS'
  | 'UNSUBSCRIBE_METRICS';

export interface UICommand<T = unknown> {
  type: UICommandType;
  id: string; // ID único para correlacionar respuestas
  payload?: T;
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
}

export interface GroupState {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'paused';
  throughput: number;
  description: string;
  threads: number;
  outputMode: string;
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
}

export interface VariableState {
  id: string;
  name: string;
  type: 'numeric' | 'list' | 'string' | 'temporal' | 'point' | 'boolean';
  scope: 'local' | 'group' | 'global';
  groupId?: string;
  config: Record<string, unknown>;
  description?: string;
}
