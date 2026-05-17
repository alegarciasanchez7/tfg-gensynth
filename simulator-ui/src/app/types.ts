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

export interface ConditionalRule {
  targetVariable: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'CONTAINS';
  value: any;
  overrides: Record<string, any>;
}

export interface BaseVariableConfig {
  pattern?: string;
  conditionalRules?: ConditionalRule[];
  [key: string]: any;
}

export interface NumericVariableConfig extends BaseVariableConfig {
  min?: number;
  max?: number;
  precision?: 'INTEGER' | 'FLOAT' | 'DOUBLE';
  formula?: string;
  decimalPlaces?: number;
  integerFormat?: string;
  initialValue?: number;
  step?: number;
  constantValue?: number;
  constantMargin?: number;
  sequentialGraph?: Array<{ x: number; y: number }>;
  distributionType?: 'UNIFORM' | 'NORMAL' | 'EXPONENTIAL' | 'CUSTOM';
  customDistributionGraph?: Array<{ value?: number; from?: number; to?: number; weight: number }>;
  boundaryMode?: 'LEFT' | 'RIGHT' | 'SPLIT';
}

export interface StringVariableConfig extends BaseVariableConfig {
  fixedLength?: number;
  regexPattern?: string;
}

export interface ListVariableConfig extends BaseVariableConfig {
  items?: Array<any | { value: any; weight: number }>;
}

export interface BooleanVariableConfig extends BaseVariableConfig {
  currentValue?: boolean;
}

export interface TemporalVariableConfig extends BaseVariableConfig {
  temporalType?: 'DATE' | 'TIMESTAMP' | 'TIME';
  dateFormat?: string;
  timeZone?: string;
}

export interface PointVariableConfig extends BaseVariableConfig {
  maxStepDistance?: number;
}

export type VariableConfig = 
  | NumericVariableConfig 
  | StringVariableConfig 
  | ListVariableConfig 
  | BooleanVariableConfig 
  | TemporalVariableConfig 
  | PointVariableConfig;

export interface Flow {
  id: string;
  name: string;
  technology: string;
  connectionStatus: ConnectionStatus;
  throughput: string;
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
  connectorVersion?: string;
  enabled: boolean;
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
  enabled: boolean;
}

export interface Variable {
  id: string;
  name: string;
  type: VariableType;
  scope: VariableScope;
  flowId?: string;
  groupId?: string;
  config: VariableConfig;
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
  level: 'info' | 'warn' | 'error' | 'debug' | 'data';
  source: string;
  message: string;
  commandId?: string;
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
