/**
 * Bridge Communication Policy
 * 
 * Defines per-command retry, timeout, and error handling policies.
 * Single source of truth for bridge behavior.
 */

export type UICommandType =
  | 'START_SYSTEM'
  | 'STOP_SYSTEM'
  | 'START_GROUP'
  | 'STOP_GROUP'
  | 'PAUSE_GROUP'
  | 'CREATE_GROUP'
  | 'DELETE_GROUP'
  | 'UPDATE_GROUP_CONFIG'
  | 'CREATE_FLOW'
  | 'DELETE_FLOW'
  | 'UPDATE_FLOW_CONFIG'
  | 'CREATE_VARIABLE'
  | 'DELETE_VARIABLE'
  | 'UPDATE_VARIABLE'
  | 'GET_INITIAL_STATE'
  | 'LOAD_STATE'
  | 'SAVE_STATE'
  | 'GET_CONNECTOR_CATALOG'
  | 'GET_LATEST_CONNECTOR'
  | 'SUBSCRIBE_METRICS'
  | 'UNSUBSCRIBE_METRICS';

export interface CommandPolicy {
  /**
   * Timeout in ms for this command.
   * After timeout, a recoverable error is emitted and the command will be retried.
   */
  timeoutMs: number;

  /**
   * Maximum number of retries (does not count the initial attempt).
   * 0 = no retries, fail immediately on timeout.
   */
  maxRetries: number;

  /**
   * Initial backoff in ms between retries.
   * Doubles on each retry until maxRetryBackoffMs.
   */
  initialBackoffMs: number;

  /**
   * Maximum backoff in ms between retries.
   */
  maxRetryBackoffMs: number;

  /**
   * Error codes that can be retried.
   * If the error is not in this set, it fails without retrying.
   */
  retryableErrors: Set<string>;

  /**
   * If true, emit a visible user notification on failure (non-recoverable).
   * If false, only technical log.
   */
  notifyOnFail: boolean;

  /**
   * TTL in ms for a pending optimistic operation.
   * Used post-reconnect to decide whether to retry or rollback.
   */
  optimisticTtlMs: number;
}

/**
 * Default policy for commands not explicitly configured.
 */
const DEFAULT_POLICY: CommandPolicy = {
  timeoutMs: 30000,
  maxRetries: 2,
  initialBackoffMs: 500,
  maxRetryBackoffMs: 4000,
  retryableErrors: new Set([
    'BRIDGE_TIMEOUT',
    'BRIDGE_RECONNECTING',
  ]),
  notifyOnFail: false,
  optimisticTtlMs: 20000,
};

/**
 * Per-command configurable policies.
 * Commands not present use DEFAULT_POLICY.
 */
const COMMAND_POLICIES: Partial<Record<UICommandType, CommandPolicy>> = {
  // Critical startup/shutdown operations: long timeout, few retries
  START_SYSTEM: {
    ...DEFAULT_POLICY,
    timeoutMs: 60000,
    maxRetries: 1,
    notifyOnFail: true,
  },
  STOP_SYSTEM: {
    ...DEFAULT_POLICY,
    timeoutMs: 60000,
    maxRetries: 1,
    notifyOnFail: true,
  },

  // Group operations: moderate
  START_GROUP: {
    ...DEFAULT_POLICY,
    timeoutMs: 30000,
    maxRetries: 2,
  },
  STOP_GROUP: {
    ...DEFAULT_POLICY,
    timeoutMs: 30000,
    maxRetries: 2,
  },
  PAUSE_GROUP: {
    ...DEFAULT_POLICY,
    timeoutMs: 30000,
    maxRetries: 2,
  },

  // CRUD operations: fast, retryable
  CREATE_GROUP: {
    ...DEFAULT_POLICY,
    timeoutMs: 10000,
    maxRetries: 2,
    optimisticTtlMs: 15000,
  },
  DELETE_GROUP: {
    ...DEFAULT_POLICY,
    timeoutMs: 10000,
    maxRetries: 2,
    optimisticTtlMs: 15000,
  },
  UPDATE_GROUP_CONFIG: {
    ...DEFAULT_POLICY,
    timeoutMs: 5000,
    maxRetries: 3,
    optimisticTtlMs: 10000,
  },

  CREATE_FLOW: {
    ...DEFAULT_POLICY,
    timeoutMs: 10000,
    maxRetries: 2,
    optimisticTtlMs: 15000,
  },
  DELETE_FLOW: {
    ...DEFAULT_POLICY,
    timeoutMs: 10000,
    maxRetries: 2,
    optimisticTtlMs: 15000,
  },
  UPDATE_FLOW_CONFIG: {
    ...DEFAULT_POLICY,
    timeoutMs: 5000,
    maxRetries: 3,
    optimisticTtlMs: 10000,
  },

  CREATE_VARIABLE: {
    ...DEFAULT_POLICY,
    timeoutMs: 5000,
    maxRetries: 3,
    optimisticTtlMs: 10000,
  },
  DELETE_VARIABLE: {
    ...DEFAULT_POLICY,
    timeoutMs: 5000,
    maxRetries: 3,
    optimisticTtlMs: 10000,
  },
  UPDATE_VARIABLE: {
    ...DEFAULT_POLICY,
    timeoutMs: 5000,
    maxRetries: 3,
    optimisticTtlMs: 10000,
  },

  // Sync operations: critical, long timeout
  GET_INITIAL_STATE: {
    ...DEFAULT_POLICY,
    timeoutMs: 30000,
    maxRetries: 2,
  },
  LOAD_STATE: {
    ...DEFAULT_POLICY,
    timeoutMs: 30000,
    maxRetries: 1,
  },
  SAVE_STATE: {
    ...DEFAULT_POLICY,
    timeoutMs: 30000,
    maxRetries: 1,
  },

  // Catalog operations: non-critical
  GET_CONNECTOR_CATALOG: {
    ...DEFAULT_POLICY,
    timeoutMs: 15000,
    maxRetries: 2,
  },
  GET_LATEST_CONNECTOR: {
    ...DEFAULT_POLICY,
    timeoutMs: 15000,
    maxRetries: 2,
  },

  // Subscriptions: best-effort
  SUBSCRIBE_METRICS: {
    ...DEFAULT_POLICY,
    timeoutMs: 5000,
    maxRetries: 1,
    notifyOnFail: false,
  },
  UNSUBSCRIBE_METRICS: {
    ...DEFAULT_POLICY,
    timeoutMs: 5000,
    maxRetries: 1,
    notifyOnFail: false,
  },
};

/**
 * Get the policy for a command.
 * Uses specific configuration or default.
 */
export function getPolicyForCommand(type: UICommandType): CommandPolicy {
  return COMMAND_POLICIES[type] ?? DEFAULT_POLICY;
}

/**
 * Normalized bridge error structure.
 * Used internally to categorize and handle errors uniformly.
 */
export interface BridgeError {
  code: 'TRANSPORT' | 'TIMEOUT' | 'VALIDATION' | 'CONFLICT' | 'BUSINESS' | 'UNKNOWN';
  message: string;
  originalCode?: string;
  retryable: boolean;
  userVisible: boolean;
  details?: Record<string, unknown>;
}

/**
 * Normalize a backend error to the BridgeError schema.
 * Classify as TRANSPORT, TIMEOUT, VALIDATION, CONFLICT, BUSINESS, or UNKNOWN.
 */
export function normalizeBridgeError(rawPayload: any): BridgeError {
  const code = rawPayload?.code || 'UNKNOWN';
  const message = rawPayload?.message || 'Unknown error';

  if (code === 'BRIDGE_TIMEOUT' || code === 'BRIDGE_RECONNECTING') {
    return {
      code: 'TIMEOUT',
      message,
      originalCode: code,
      retryable: true,
      userVisible: false,
    };
  }

  if (code === 'INVALID_ENVELOPE' || code === 'INVALID_PAYLOAD' || code === 'PROTOCOL_VERSION_MISMATCH') {
    return {
      code: 'VALIDATION',
      message,
      originalCode: code,
      retryable: false,
      userVisible: true,
      details: rawPayload?.details,
    };
  }

  if (code === 'NOT_FOUND') {
    return {
      code: 'CONFLICT',
      message: `Resource not found: ${message}`,
      originalCode: code,
      retryable: false,
      userVisible: true,
      details: rawPayload?.details,
    };
  }

  if (code === 'UNSUPPORTED_COMMAND') {
    return {
      code: 'VALIDATION',
      message,
      originalCode: code,
      retryable: false,
      userVisible: false,
    };
  }

  if (code === 'INTERNAL_ERROR') {
    return {
      code: 'BUSINESS',
      message,
      originalCode: code,
      retryable: true,
      userVisible: true,
      details: rawPayload?.details,
    };
  }

  // Default: treat as business/unknown
  return {
    code: 'BUSINESS',
    message,
    originalCode: code,
    retryable: true,
    userVisible: true,
    details: rawPayload?.details,
  };
}
