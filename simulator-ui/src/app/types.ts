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
  prefix?: string;
  suffix?: string;
  initialValue?: number;
  step?: number;
  constantValue?: number;
  constantMargin?: number;
  sequentialGraph?: Array<{ x: number; y: number }>;
  distributionType?: 'UNIFORM' | 'NORMAL' | 'EXPONENTIAL' | 'CUSTOM';
  customDistributionGraph?: Array<{ value?: number; from?: number; to?: number; weight: number }>;
  boundaryMode?: 'LEFT' | 'RIGHT' | 'SPLIT';

  // Sinusoidal / Periodic Wave Pattern
  sineFrequency?: number;
  sineAmplitude?: number;
  sinePhase?: number;
  sineOffset?: number;

  // Drift Pattern
  driftRate?: number;
  driftInitialValue?: number;
  driftLimitMode?: 'CLAMP' | 'WRAP' | 'RESET' | 'BOUNCE';

  // Virtual Simulation Clock
  simulationTimeStep?: number;

  // Noise Modifier Layer
  noiseEnabled?: boolean;
  noiseType?: 'GAUSSIAN' | 'UNIFORM';
  noiseAmplitude?: number;
  noiseStdDev?: number;

  // Spike Anomaly Modifier Layer
  spikeEnabled?: boolean;
  spikeProbability?: number;
  spikeMode?: 'FIXED_OFFSET' | 'RANGE_SPIKE' | 'MULTIPLIER';
  spikeMagnitude?: number;
  spikeMin?: number;
  spikeMax?: number;
  spikeMultiplier?: number;
}

export type StringFormattedMaskType = 'MAC_ADDRESS' | 'IPV4' | 'IPV6' | 'UUID_V4' | 'CUSTOM_MASK' | 'ALPHANUMERIC';
export type StringCorruptionMode = 'TRUNCATE' | 'INJECT_ANOMALOUS' | 'REPLACE_CHAR' | 'NULL_BYTE' | 'MIXED';

export interface StringVariableConfig extends BaseVariableConfig {
  fixedLength?: number;
  regexPattern?: string;
  constantValue?: string;
  
  template?: string;
  formattedMaskType?: StringFormattedMaskType;
  customMask?: string;
  alphanumericCase?: 'UPPER' | 'LOWER' | 'MIXED';
  
  corruptionEnabled?: boolean;
  corruptionProbability?: number;
  corruptionMode?: StringCorruptionMode;
  corruptionMagnitude?: number;
}

export type ListSelectionStrategy = 'WEIGHTED_RANDOM' | 'SEQUENTIAL' | 'SHUFFLE' | 'MARKOV_CHAIN';

export interface ListItemConfig {
  id: string;
  value?: any;
  weight?: number;
  isEmbedded?: boolean;
  embeddedType?: VariableType;
  embeddedConfig?: VariableConfig;
}

export interface ListVariableConfig extends BaseVariableConfig {
  selectionStrategy?: ListSelectionStrategy;
  items?: ListItemConfig[];
  transitionMatrix?: Record<string, Record<string, number>>;
  shuffle?: boolean;
}

export interface BooleanVariableConfig extends BaseVariableConfig {
  currentValue?: boolean;
}

export type TemporalType = 'DATE' | 'TIMESTAMP' | 'TIME';
export type TimeAdvanceMode = 'WALL_CLOCK' | 'SIMULATED_STEP' | 'BACKFILL_HISTORICAL' | 'FIXED';
export type ClockDriftType = 'RANDOM_JITTER' | 'CONSTANT_OFFSET' | 'PROGRESSIVE_DRIFT';
export type BackfillStrategy = 'SEQUENTIAL_STEP' | 'RANDOM_IN_RANGE';

export interface TemporalVariableConfig extends BaseVariableConfig {
  temporalType?: TemporalType;
  timeAdvanceMode?: TimeAdvanceMode;
  dateFormat?: string;
  timeZone?: string;
  startDate?: string;
  incrementMs?: number;
  fixedDate?: string;
  rangeStart?: string;
  rangeEnd?: string;
  backfillStrategy?: BackfillStrategy;
  clockDriftEnabled?: boolean;
  maxDriftMs?: number;
  driftType?: ClockDriftType;
  driftRateMsPerTick?: number;
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

export interface StartGroupErrorPayload {
  errorType: 'VALIDATION_ERROR' | 'CYCLIC_DEPENDENCY_ERROR' | 'BROKEN_REFERENCE_ERROR';
  commandId?: string;
  message: string;
  variableId?: string;
  errors?: string[];
  cycle?: string[];
}
