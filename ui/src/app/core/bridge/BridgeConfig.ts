export interface BridgeConfig {
  mode: 'websocket' | 'jcef' | 'auto';
  websocketUrl?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  commandTimeoutMs?: number;
  maxCommandRetries?: number;
  retryBackoffMs?: number;
  maxRetryBackoffMs?: number;
}

export const DEFAULT_CONFIG: BridgeConfig = {
  mode: 'auto',
  websocketUrl: import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:8765',
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
  commandTimeoutMs: 30000,
  maxCommandRetries: 2,
  retryBackoffMs: 500,
  maxRetryBackoffMs: 4000,
};
