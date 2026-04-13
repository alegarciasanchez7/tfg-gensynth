export type SystemStatus = 'running' | 'stopped' | 'processing';
export type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'warning';
export type GroupStatus = 'running' | 'stopped' | 'paused';
export type VariableScope = 'local' | 'group' | 'global';
export type VariableType =
  | 'numeric'
  | 'list'
  | 'string'
  | 'temporal'
  | 'point'
  | 'boolean';

export interface Flow {
  id: string;
  name: string;
  technology: string;
  connectionStatus: ConnectionStatus;
  throughput: string;
  hasError: boolean;
  errorMessage?: string;
  interval: number;
  burst: number;
  topic: string;
  host: string;
  port: number;
}

export interface Group {
  id: string;
  name: string;
  status: GroupStatus;
  throughput: string;
  description: string;
  threads: number;
  outputMode: string;
  flows: Flow[];
  expanded: boolean;
}

export interface Variable {
  id: string;
  name: string;
  type: VariableType;
  scope: VariableScope;
  groupId?: string;
  config: Record<string, unknown>;
  description?: string;
}

export type SelectionType = 'none' | 'group' | 'flow' | 'variable';

export interface Selection {
  type: SelectionType;
  groupId?: string;
  flowId?: string;
  variableId?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
}

export type ConnectorHealthStatus = 'healthy' | 'degraded' | 'offline';

export interface ConnectorHealthSummary {
  pluginId: string;
  pluginVersion: string;
  displayName: string;
  status: ConnectorHealthStatus;
  flowCount: number;
  connectedCount: number;
  warningCount: number;
  errorCount: number;
  lastMessage?: string;
}
