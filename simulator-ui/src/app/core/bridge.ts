/**
 * Communication bridge with the Java core
 * 
 * This module handles bidirectional communication between the React UI
 * and the Java core. It supports two communication modes:
 * 
 * 1. WebSocket: For when the UI runs in an external browser or in development
 * 2. JCEF Bridge: Direct communication when embedded in JCEF
 */

import { CORE_PROTOCOL_VERSION } from './types';
import type {
  CoreMessage,
  CoreCommandErrorPayload,
  UICommand,
  UICommandType,
  UICommandPayloadMap,
  InitialStatePayload,
  SystemStatusPayload,
  MetricsPayload,
  LogPayload,
  GroupState,
  FlowMetricsPayload,
  VariableState,
  ConnectorPluginDescriptor,
  TracePayload,
  PluginValidationResultPayload,
  PluginInstallResultPayload,
  RestartRequiredPayload,
  RollbackReportPayload,
} from './types';

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

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

const DEFAULT_CONFIG: BridgeConfig = {
  mode: 'auto',
  websocketUrl: import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:8765',
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
  commandTimeoutMs: 30000,
  maxCommandRetries: 2,
  retryBackoffMs: 500,
  maxRetryBackoffMs: 4000,
};

// ─────────────────────────────────────────────────────────────
// Event types
// ─────────────────────────────────────────────────────────────

type EventCallback<T = unknown> = (data: T) => void;

type PendingCommand = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timerId: number;
  command: UICommand;
  attempts: number;
  onResponse?: (payload: any) => void;
};

const SUPPORTED_COMMANDS = new Set<UICommandType>([
  'START_SYSTEM',
  'STOP_SYSTEM',
  'START_GROUP',
  'STOP_GROUP',
  'GET_INITIAL_STATE',
  'LOAD_STATE',
  'SAVE_STATE',
  'GET_CONNECTOR_CATALOG',
  'GET_LATEST_CONNECTOR',
  'SUBSCRIBE_METRICS',
  'UNSUBSCRIBE_METRICS',
  'CREATE_GROUP',
  'DELETE_GROUP',
  'UPDATE_GROUP_CONFIG',
  'CREATE_FLOW',
  'DELETE_FLOW',
  'UPDATE_FLOW_CONFIG',
  'CREATE_VARIABLE',
  'DELETE_VARIABLE',
  'UPDATE_VARIABLE',
  'VALIDATE_PLUGIN',
  'INSTALL_PLUGIN',
  'UNINSTALL_PLUGIN',
  'IMPORT_STATE',
  'PICK_DIRECTORY',
  'CLONE_GROUP',
  'CLONE_FLOW',
  'EXPORT_STATE',
  'PAUSE_GROUP',
  'UI_LOG',
]);

interface EventMap {
  'connected': undefined;
  'disconnected': { reason: string };
  'error': { error: Error; commandId?: string; code?: string; details?: Record<string, unknown>; recoverable?: boolean };
  'system-status': SystemStatusPayload;
  'metrics': MetricsPayload;
  'log': LogPayload;
  'groups-update': GroupState[];
  'flow-update': FlowMetricsPayload;
  'variables-update': VariableState[];
  'initial-state': InitialStatePayload;
  'connector-catalog': ConnectorPluginDescriptor[];
  'message': CoreMessage;
  'trace': TracePayload;
  'plugin-validation-result': PluginValidationResultPayload;
  'plugin-install-result': PluginInstallResultPayload;
  'restart-required': RestartRequiredPayload;
  'rollback-report': RollbackReportPayload;
}

// ─────────────────────────────────────────────────────────────
// Clase Bridge
// ─────────────────────────────────────────────────────────────

class CoreBridge {
  private config: BridgeConfig;
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private eventListeners: Map<string, Set<EventCallback>> = new Map();
  private pendingCommands: Map<string, PendingCommand> = new Map();
  private commandIdCounter = 0;

  constructor(config: Partial<BridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─────────────────────────────────────────────────────────
  // Connection
  // ─────────────────────────────────────────────────────────

  /**
   * Starts the connection to the Java core
   */
  async connect(): Promise<void> {
    const mode = this.detectMode();
    
    if (mode === 'jcef') {
      await this.connectJCEF();
    } else {
      await this.connectWebSocket();
    }
  }

  /**
   * Detects the available communication mode
   */
  private detectMode(): 'websocket' | 'jcef' {
    if (this.config.mode !== 'auto') {
      return this.config.mode;
    }

    // Detect whether we are running in JCEF by checking for the global bridge
    if (typeof window !== 'undefined' && (window as JCEFWindow).javaBridge) {
      return 'jcef';
    }

    return 'websocket';
  }

  /**
   * WebSocket connection
   */
  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      try {
        this.ws = new WebSocket(this.config.websocketUrl!);

        this.ws.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.emit('connected', undefined);
          console.log('[Bridge] Connected to the Java core via WebSocket');
          this.resync().catch(err => console.error('[Bridge] Error during post-connect resync:', err));
          resolve();
        };

        this.ws.onclose = (event) => {
          this.connected = false;
          
          // Reject all pending commands
          this.pendingCommands.forEach(pending => {
            window.clearTimeout(pending.timerId);
            pending.reject(new Error('Connection lost'));
          });
          this.pendingCommands.clear();

          this.emit('disconnected', { reason: event.reason || 'Connection closed' });
          console.log('[Bridge] Disconnected from the Java core');
          this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('[Bridge] WebSocket error:', error);
          this.emit('error', { error: new Error('WebSocket error') });
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * JCEF Bridge connection
   */
  private async connectJCEF(): Promise<void> {
    const jcef = (window as JCEFWindow).javaBridge;
    
    if (!jcef) {
      throw new Error('JCEF Bridge no disponible');
    }

    // Register the callback to receive messages from the Java core
    jcef.registerCallback('onCoreMessage', (messageJson: string) => {
      this.handleMessage(messageJson);
    });

    this.connected = true;
    this.emit('connected', undefined);
    console.log('[Bridge] Connected to the Java core via JCEF Bridge');
  }

  /**
   * Disconnects from the core
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
  }

  /**
   * Schedules a reconnect attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
      console.error('[Bridge] Maximum reconnect attempts reached');
      return;
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectAttempts++;
      console.log(`[Bridge] Reconnect attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`);
      this.connectWebSocket().catch(() => {
        // Will be handled on the next cycle
      });
    }, this.config.reconnectInterval);
  }

  /**
   * Resynchronizes state after reconnection
   */
  private async resync(): Promise<void> {
    if (!this.connected) return;
    
    console.log('[Bridge] Resyncing system state...');
    try {
      // Execute required resync commands
      await CoreCommands.getInitialState();
      await CoreCommands.getConnectorCatalog();
      await CoreCommands.subscribeMetrics();
      
      console.log('[Bridge] Resync complete');
    } catch (error) {
      console.error('[Bridge] Resync failed:', error);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Command sending
  // ─────────────────────────────────────────────────────────

  /**
   * Sends a command to the Java core
   */
  send<T extends UICommandType, R = any>(
    type: T, 
    payload?: UICommandPayloadMap[T],
    onResponse?: (data: R) => void
  ): Promise<R> {
    const validationError = this.validateCommand(type, payload);
    if (validationError) {
      return Promise.reject(validationError);
    }

    return new Promise((resolve, reject) => {
      const id = `cmd_${++this.commandIdCounter}_${Date.now()}`;

      const command: UICommand<T> = {
        type,
        id,
        commandId: id,
        protocolVersion: CORE_PROTOCOL_VERSION,
        payload,
      };

      const pending: PendingCommand = {
        resolve,
        reject,
        timerId: 0,
        command,
        attempts: 0,
        onResponse,
      };

      const scheduleAttempt = () => {
        if (pending.timerId) {
          window.clearTimeout(pending.timerId);
        }

        pending.timerId = window.setTimeout(() => {
          if (!this.pendingCommands.has(id)) {
            return;
          }

          if (pending.attempts < (this.config.maxCommandRetries ?? 0)) {
            pending.attempts += 1;
            const delay = Math.min(
              (this.config.retryBackoffMs ?? 500) * (2 ** (pending.attempts - 1)),
              this.config.maxRetryBackoffMs ?? 4000,
            );

            this.emit('error', {
              error: this.createError({
                status: 'error',
                code: 'BRIDGE_TIMEOUT',
                message: `Timeout en ${type}; reintentando en ${delay} ms`,
                recoverable: true,
                commandId: id,
              }, id),
              commandId: id,
              code: 'BRIDGE_TIMEOUT',
              recoverable: true,
            });

            window.setTimeout(() => {
              this.sendRaw(JSON.stringify(pending.command));
              scheduleAttempt();
            }, delay);
            return;
          }

          this.pendingCommands.delete(id);
          reject(this.createError({
            status: 'error',
            code: 'BRIDGE_TIMEOUT',
            message: `Comando ${type} timeout`,
            recoverable: false,
            commandId: id,
          }, id));
        }, this.config.commandTimeoutMs ?? 30000);
      };

      this.pendingCommands.set(id, pending);
      this.sendRaw(JSON.stringify(command));
      scheduleAttempt();
    });
  }

  private validateCommand<T extends UICommandType>(type: T, payload?: UICommandPayloadMap[T]): Error | null {
    if (!SUPPORTED_COMMANDS.has(type)) {
      return new Error(`The command ${type} is not supported by the current bridge`);
    }

    const isObjectPayload = typeof payload === 'object' && payload !== null && !Array.isArray(payload);
    const readField = (field: string): unknown => (isObjectPayload ? ((payload as unknown) as Record<string, unknown>)[field] : undefined);

    const requireStringField = (field: string, message: string) => {
      const value = readField(field);
      return typeof value === 'string' && value.trim().length > 0 ? null : new Error(message);
    };

    switch (type) {
      case 'START_SYSTEM':
      case 'STOP_SYSTEM':
      case 'GET_INITIAL_STATE':
      case 'LOAD_STATE':
      case 'SAVE_STATE':
      case 'GET_CONNECTOR_CATALOG':
      case 'SUBSCRIBE_METRICS':
      case 'UNSUBSCRIBE_METRICS':
        return null;
      case 'START_GROUP':
      case 'STOP_GROUP':
      case 'PAUSE_GROUP':
      case 'DELETE_GROUP':
        return requireStringField('groupId', `El comando ${type} requiere groupId`);
      case 'DELETE_VARIABLE':
        return requireStringField('variableId', 'El comando DELETE_VARIABLE requiere variableId');
      case 'GET_LATEST_CONNECTOR':
        return requireStringField('pluginId', 'El comando GET_LATEST_CONNECTOR requiere pluginId');
      case 'DELETE_FLOW':
        return isObjectPayload
          && typeof readField('flowId') === 'string'
          && typeof readField('groupId') === 'string'
          ? null
          : new Error('El comando DELETE_FLOW requiere flowId y groupId');
      case 'CREATE_GROUP':
        return requireStringField('name', 'El comando CREATE_GROUP requiere name');
      case 'CREATE_FLOW':
        return isObjectPayload
          && typeof readField('groupId') === 'string'
          && typeof readField('name') === 'string'
          && typeof readField('technology') === 'string'
          && typeof readField('host') === 'string'
          && typeof readField('port') === 'number'
          ? null
          : new Error('El comando CREATE_FLOW requiere groupId, name, technology, host y port');
      case 'UPDATE_GROUP_CONFIG':
        return requireStringField('groupId', 'El comando UPDATE_GROUP_CONFIG requiere groupId');
      case 'UPDATE_FLOW_CONFIG':
        return isObjectPayload
          && typeof readField('flowId') === 'string'
          && typeof readField('groupId') === 'string'
          ? null
          : new Error('El comando UPDATE_FLOW_CONFIG requiere flowId y groupId');
      case 'CREATE_VARIABLE':
        return isObjectPayload
          && typeof readField('name') === 'string'
          && typeof readField('type') === 'string'
          && typeof readField('scope') === 'string'
          ? null
          : new Error('El comando CREATE_VARIABLE requiere name, type y scope');
      case 'UPDATE_VARIABLE':
        return requireStringField('variableId', 'El comando UPDATE_VARIABLE requiere variableId');
      case 'VALIDATE_PLUGIN':
      case 'INSTALL_PLUGIN':
        return isObjectPayload
          && typeof readField('jarBase64') === 'string'
          && typeof readField('pluginName') === 'string'
          && typeof readField('pluginVersion') === 'string'
          ? null
          : new Error(`El comando ${type} requiere jarBase64, pluginName y pluginVersion`);
      case 'UNINSTALL_PLUGIN':
        return isObjectPayload
          && typeof readField('pluginId') === 'string'
          && typeof readField('pluginVersion') === 'string'
          ? null
          : new Error('El comando UNINSTALL_PLUGIN requiere pluginId y pluginVersion');
      case 'IMPORT_STATE':
        return isObjectPayload
          && Array.isArray(readField('groups'))
          && Array.isArray(readField('variables'))
          ? null
          : new Error('El comando IMPORT_STATE requiere un payload con groups y variables (arrays)');
      case 'CLONE_GROUP':
        return requireStringField('groupId', 'El comando CLONE_GROUP requiere groupId');
      case 'CLONE_FLOW':
        return isObjectPayload
          && typeof readField('groupId') === 'string'
          && typeof readField('flowId') === 'string'
          ? null
          : new Error('El comando CLONE_FLOW requiere groupId y flowId');
      case 'UI_LOG':
        return isObjectPayload && typeof readField('message') === 'string'
          ? null
          : new Error('El comando UI_LOG requiere message');
      case 'PICK_DIRECTORY':
      case 'EXPORT_STATE':
        return null;
      default:
        return new Error(`Validation not implemented for ${type}`);
    }
  }

  /**
   * Sends raw data to the core
   */
  private sendRaw(data: string): void {
    const mode = this.detectMode();

    if (mode === 'jcef') {
      const jcef = (window as JCEFWindow).javaBridge;
      jcef?.sendToCore(data);
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      console.warn('[Bridge] No active connection available to send data');
    }
  }

  // ─────────────────────────────────────────────────────────
  // Message handling
  // ─────────────────────────────────────────────────────────

  /**
   * Processes messages received from the core
   */
  private handleMessage(raw: string): void {
    try {
      const message: CoreMessage = JSON.parse(raw);
      
      // Emit the generic event
      this.emit('message', message);

      // Emit the specific event according to its type
      switch (message.type) {
        case 'SYSTEM_STATUS':
          this.emit('system-status', message.payload as SystemStatusPayload);
          break;
        case 'METRICS_UPDATE':
          this.emit('metrics', message.payload as MetricsPayload);
          break;
        case 'LOG_ENTRY':
          this.emit('log', message.payload as LogPayload);
          break;
        case 'GROUPS_UPDATE':
          this.emit('groups-update', message.payload as GroupState[]);
          break;
        case 'FLOW_UPDATE':
          this.emit('flow-update', message.payload as FlowMetricsPayload);
          break;
        case 'VARIABLE_UPDATE':
          this.emit('variables-update', message.payload as VariableState[]);
          break;
        case 'INITIAL_STATE':
          this.emit('initial-state', message.payload as InitialStatePayload);
          break;
        case 'ERROR':
          this.emit('error', this.createErrorEvent(message.payload as CoreCommandErrorPayload));
          break;
        case 'TRACE_EVENT':
          this.emit('trace', message.payload as TracePayload);
          break;
        case 'PLUGIN_VALIDATION_RESULT':
          this.emit('plugin-validation-result', message.payload as PluginValidationResultPayload);
          break;
        case 'PLUGIN_INSTALL_RESULT':
          this.emit('plugin-install-result', message.payload as PluginInstallResultPayload);
          break;
        case 'RESTART_REQUIRED':
          this.emit('restart-required', message.payload as RestartRequiredPayload);
          break;
        case 'ROLLBACK_REPORT':
          this.emit('rollback-report', message.payload as RollbackReportPayload);
          break;
      }

      // Check whether this is a response to a pending command
      const responsePayload = message.payload as { commandId?: string; status?: string } | null;
      const responseId = message.commandId || responsePayload?.commandId;
      if (responseId && this.pendingCommands.has(responseId)) {
        if (message.type === 'TRACE_EVENT') {
          return; // Skip trace events for command resolution
        }
        const pending = this.pendingCommands.get(responseId)!;
        window.clearTimeout(pending.timerId);

        if (pending.onResponse && message.type !== 'ERROR' && responsePayload?.status !== 'error') {
          try {
            pending.onResponse(message.payload);
          } catch (err) {
            console.error('[Bridge] Error in onResponse callback:', err);
          }
        }

        if (message.type === 'ERROR' || responsePayload?.status === 'error') {
          const commandError = this.createError(message.payload as CoreCommandErrorPayload, responseId);
          const recoverable = (message.payload as CoreCommandErrorPayload)?.recoverable ?? false;

          if (recoverable && pending.attempts < (this.config.maxCommandRetries ?? 0)) {
            pending.attempts += 1;
            const delay = Math.min(
              (this.config.retryBackoffMs ?? 500) * (2 ** (pending.attempts - 1)),
              this.config.maxRetryBackoffMs ?? 4000,
            );

            this.emit('error', {
              error: commandError,
              commandId: responseId,
              code: (message.payload as CoreCommandErrorPayload).code,
              details: (message.payload as CoreCommandErrorPayload).details,
              recoverable: true,
            });

            window.setTimeout(() => {
              this.sendRaw(JSON.stringify(pending.command));
              pending.timerId = window.setTimeout(() => {
                this.handleRetryTimeout(responseId, pending, pending.command.type, reject => pending.reject(reject));
              }, this.config.commandTimeoutMs ?? 30000);
            }, delay);
            return;
          }

          this.pendingCommands.delete(responseId);
          pending.reject(commandError);
          return;
        }

        this.pendingCommands.delete(responseId);
        pending.resolve(message.payload);
      }
    } catch (error) {
      console.error('[Bridge] Error parsing message:', error, raw);
    }
  }

  private handleRetryTimeout(commandId: string, pending: PendingCommand, type: UICommandType, reject: (error: Error) => void): void {
    if (!this.pendingCommands.has(commandId)) {
      return;
    }

    if (pending.attempts < (this.config.maxCommandRetries ?? 0)) {
      pending.attempts += 1;
      const delay = Math.min(
        (this.config.retryBackoffMs ?? 500) * (2 ** (pending.attempts - 1)),
        this.config.maxRetryBackoffMs ?? 4000,
      );

      this.emit('error', {
        error: this.createError({
          status: 'error',
          code: 'BRIDGE_TIMEOUT',
          message: `Timeout en ${type}; reintentando en ${delay} ms`,
          recoverable: true,
          commandId,
        }, commandId),
        commandId,
        code: 'BRIDGE_TIMEOUT',
        recoverable: true,
      });

      window.setTimeout(() => {
        this.sendRaw(JSON.stringify(pending.command));
        pending.timerId = window.setTimeout(() => {
          this.handleRetryTimeout(commandId, pending, type, reject);
        }, this.config.commandTimeoutMs ?? 30000);
      }, delay);
      return;
    }

    this.pendingCommands.delete(commandId);
    reject(this.createError({
      status: 'error',
      code: 'BRIDGE_TIMEOUT',
      message: `Comando ${type} timeout`,
      recoverable: false,
      commandId,
    }, commandId));
  }

  private createError(payload: CoreCommandErrorPayload | { message?: string } | null | undefined, commandId?: string): Error {
    const message = payload && 'message' in payload && typeof payload.message === 'string'
      ? payload.message
      : 'Error no especificado por el Core';
    const error = new Error(message);
    const code = payload && 'code' in payload && typeof payload.code === 'string' ? payload.code : undefined;
    const details = payload && 'details' in payload && payload.details && typeof payload.details === 'object'
      ? (payload.details as Record<string, unknown>)
      : undefined;

    if (code) {
      (error as Error & { code?: string }).code = code;
    }
    if (commandId) {
      (error as Error & { commandId?: string }).commandId = commandId;
    }
    if (details) {
      (error as Error & { details?: Record<string, unknown> }).details = details;
    }

    return error;
  }

  private createErrorEvent(payload: CoreCommandErrorPayload): { error: Error; commandId?: string; code?: string; details?: Record<string, unknown>; recoverable?: boolean } {
    return {
      error: this.createError(payload, payload.commandId),
      commandId: payload.commandId,
      code: payload.code,
      details: payload.details,
      recoverable: payload.recoverable,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Event system
  // ─────────────────────────────────────────────────────────

  /**
   * Subscribes to an event
   */
  on<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback as EventCallback);

    // Returns an unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribes from an event
   */
  off<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): void {
    this.eventListeners.get(event)?.delete(callback as EventCallback);
  }

  /**
   * Emits an event
   */
  private emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.eventListeners.get(event)?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[Bridge] Error in ${event} listener:`, error);
      }
    });
  }

  // ─────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────

  isConnected(): boolean {
    return this.connected;
  }

  getMode(): 'websocket' | 'jcef' {
    return this.detectMode();
  }
}

// ─────────────────────────────────────────────────────────────
// JCEF types
// ─────────────────────────────────────────────────────────────

interface JCEFBridge {
  sendToCore: (data: string) => void;
  registerCallback: (name: string, callback: (data: string) => void) => void;
}

interface JCEFWindow extends Window {
  javaBridge?: JCEFBridge;
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

export const bridge = new CoreBridge();

// ─────────────────────────────────────────────────────────────
// Convenience commands
// ─────────────────────────────────────────────────────────────

export const CoreCommands = {
  // System
  startSystem: () => bridge.send('START_SYSTEM'),
  stopSystem: () => bridge.send('STOP_SYSTEM'),
  getInitialState: () => bridge.send('GET_INITIAL_STATE'),
  loadState: () => bridge.send('LOAD_STATE'),
  saveState: () => bridge.send('SAVE_STATE'),
  
  // Groups
  startGroup: (groupId: string) => bridge.send('START_GROUP', { groupId }),
  stopGroup: (groupId: string) => bridge.send('STOP_GROUP', { groupId }),
  pauseGroup: (groupId: string) => bridge.send('PAUSE_GROUP', { groupId }),
  createGroup: (config: { name: string; threads?: number; outputMode?: string }) => 
    bridge.send('CREATE_GROUP', config),
  deleteGroup: (groupId: string) => bridge.send('DELETE_GROUP', { groupId }),
  updateGroup: (config: { groupId: string; name?: string; threads?: number; outputMode?: string }) =>
    bridge.send('UPDATE_GROUP_CONFIG', config),
  
  // Flows
  createFlow: (config: { groupId: string; name: string; technology: string; host: string; port: number }) =>
    bridge.send('CREATE_FLOW', config),
  deleteFlow: (flowId: string, groupId: string) => bridge.send('DELETE_FLOW', { flowId, groupId }),
  updateFlow: (config: { flowId: string; groupId: string; [key: string]: unknown }) =>
    bridge.send('UPDATE_FLOW_CONFIG', config),
  
  // Variables
  createVariable: (config: { name: string; type: string; scope: 'global' | 'group' | 'local'; config?: Record<string, unknown> }) =>
    bridge.send('CREATE_VARIABLE', config),
  deleteVariable: (variableId: string) => bridge.send('DELETE_VARIABLE', { variableId }),
  updateVariable: (config: { variableId: string; [key: string]: unknown }) =>
    bridge.send('UPDATE_VARIABLE', config),

  // Connector catalog
  getConnectorCatalog: () => bridge.send('GET_CONNECTOR_CATALOG'),
  getLatestConnector: (pluginId: string) => bridge.send('GET_LATEST_CONNECTOR', { pluginId }),
  
  // Metrics
  subscribeMetrics: () => bridge.send('SUBSCRIBE_METRICS'),
  unsubscribeMetrics: () => bridge.send('UNSUBSCRIBE_METRICS'),

  // Plugin management
  validatePlugin: (jarBase64: string, pluginName: string, pluginVersion: string): Promise<PluginValidationResultPayload> =>
    bridge.send<'VALIDATE_PLUGIN', PluginValidationResultPayload>('VALIDATE_PLUGIN', { jarBase64, pluginName, pluginVersion }),
  installPlugin: (jarBase64: string, pluginName: string, pluginVersion: string): Promise<PluginInstallResultPayload> =>
    bridge.send<'INSTALL_PLUGIN', PluginInstallResultPayload>('INSTALL_PLUGIN', { jarBase64, pluginName, pluginVersion }),
  uninstallPlugin: (pluginId: string, pluginVersion: string): Promise<PluginInstallResultPayload> =>
    bridge.send<'UNINSTALL_PLUGIN', PluginInstallResultPayload>('UNINSTALL_PLUGIN', { pluginId, pluginVersion }),
  
  // State management
  importState: (groups: any[], variables: any[]) => bridge.send('IMPORT_STATE', { groups, variables }),
  
  // Desktop specific
  pickDirectory: () => bridge.send('PICK_DIRECTORY'),

  // Cloning
  cloneGroup: (groupId: string, count: number) => bridge.send('CLONE_GROUP', { groupId, count }),
  cloneFlow: (groupId: string, flowId: string, count: number) => bridge.send('CLONE_FLOW', { groupId, flowId, count }),
};

export default bridge;
