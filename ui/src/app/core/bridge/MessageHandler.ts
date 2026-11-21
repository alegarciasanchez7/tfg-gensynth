import type { BridgeConfig } from './BridgeConfig';
import { USER_DIALOG_COMMANDS, type PendingCommand, type EventMap } from './BridgeTypes';
import type {
  CoreMessage,
  CoreCommandErrorPayload,
  UICommandType,
  SystemStatusPayload,
  MetricsPayload,
  LogPayload,
  GroupState,
  FlowsMetricsPayload,
  VariableState,
  TracePayload,
  PluginValidationResultPayload,
  PluginInstallResultPayload,
  RestartRequiredPayload,
  RollbackReportPayload,
  InitialStatePayload,
  UpdateStatusPayload,
  OpenProjectRequestedPayload,
} from '../types';
import type { ProjectSettings } from '../../types';

export interface MessageHandlerOptions {
  config: BridgeConfig;
  pendingCommands: Map<string, PendingCommand>;
  emit: <K extends keyof EventMap>(event: K, data: EventMap[K]) => void;
  sendRaw: (data: string) => void;
}

export class MessageHandler {
  private readonly config: BridgeConfig;
  private readonly pendingCommands: Map<string, PendingCommand>;
  private readonly emit: <K extends keyof EventMap>(event: K, data: EventMap[K]) => void;
  private readonly sendRaw: (data: string) => void;

  constructor(options: MessageHandlerOptions) {
    this.config = options.config;
    this.pendingCommands = options.pendingCommands;
    this.emit = options.emit;
    this.sendRaw = options.sendRaw;
  }

  handleMessage(raw: string): void {
    try {
      const message: CoreMessage = JSON.parse(raw);

      this.emit('message', message);
      this.emitTypedEvent(message);
      this.settlePendingCommand(message);
    } catch (error) {
      console.error('[Bridge] Error parsing message:', error, raw);
    }
  }

  /** Emits the typed event of a Core message (nothing for an unknown type). */
  private emitTypedEvent(message: CoreMessage): void {
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
      case 'FLOWS_METRICS':
        this.emit('flows-metrics', (message.payload as FlowsMetricsPayload)?.flows ?? []);
        break;
      case 'VARIABLE_UPDATE':
        this.emit('variables-update', message.payload as VariableState[]);
        break;
      case 'VARIABLE_CHANGED':
        this.emit('variable-changed', message.payload as VariableState);
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
      case 'SETTINGS_UPDATE':
        this.emit('settings-update', message.payload as ProjectSettings);
        break;
      case 'UPDATE_STATUS':
        this.emit('update-status', message.payload as UpdateStatusPayload);
        break;
      case 'OPEN_PROJECT_REQUESTED':
        this.emit('open-project-requested', (message.payload ?? {}) as OpenProjectRequestedPayload);
        break;
    }
  }

  /** Resolves, rejects or retries the pending command a Core message answers (trace events never settle it). */
  private settlePendingCommand(message: CoreMessage): void {
    const responsePayload = message.payload as { commandId?: string; status?: string } | null;
    const responseId = message.commandId || responsePayload?.commandId;
    if (!responseId || !this.pendingCommands.has(responseId) || message.type === 'TRACE_EVENT') {
      return;
    }
    const pending = this.pendingCommands.get(responseId)!;
    window.clearTimeout(pending.timerId);

    const isError = message.type === 'ERROR' || responsePayload?.status === 'error';
    if (!isError) {
      this.notifyResponse(pending, message.payload);
      this.pendingCommands.delete(responseId);
      pending.resolve(message.payload);
      return;
    }

    const errorPayload = message.payload as CoreCommandErrorPayload;
    const commandError = this.createError(errorPayload, responseId);
    if (this.shouldRetryAfterError(pending, errorPayload)) {
      this.retryAfterError(responseId, pending, errorPayload, commandError);
      return;
    }
    this.pendingCommands.delete(responseId);
    pending.reject(commandError);
  }

  /** Calls the onResponse callback of a command, if any, logging what it throws. */
  private notifyResponse(pending: PendingCommand, payload: unknown): void {
    if (!pending.onResponse) {
      return;
    }
    try {
      pending.onResponse(payload);
    } catch (err) {
      console.error('[Bridge] Error in onResponse callback:', err);
    }
  }

  /** Whether a command answered with an error is sent again: recoverable, resendable and retries left. */
  private shouldRetryAfterError(pending: PendingCommand, payload: CoreCommandErrorPayload): boolean {
    const recoverable = payload?.recoverable ?? false;
    const resendable = !USER_DIALOG_COMMANDS.has(pending.command.type);
    return recoverable && resendable && pending.attempts < (this.config.maxCommandRetries ?? 0);
  }

  /** Reports a recoverable error and sends the command again after the backoff delay. */
  private retryAfterError(
    responseId: string,
    pending: PendingCommand,
    payload: CoreCommandErrorPayload,
    commandError: Error,
  ): void {
    pending.attempts += 1;
    const delay = this.retryDelay(pending.attempts);

    this.emit('error', {
      error: commandError,
      commandId: responseId,
      code: payload.code,
      details: payload.details,
      recoverable: true,
    });

    window.setTimeout(() => {
      this.sendRaw(JSON.stringify(pending.command));
      pending.timerId = window.setTimeout(() => {
        this.handleRetryTimeout(responseId, pending, pending.command.type, reject => pending.reject(reject));
      }, this.config.commandTimeoutMs ?? 30000);
    }, delay);
  }

  /** Exponential backoff delay before the given retry attempt (1-based), capped by the config. */
  private retryDelay(attempt: number): number {
    return Math.min(
      (this.config.retryBackoffMs ?? 500) * (2 ** (attempt - 1)),
      this.config.maxRetryBackoffMs ?? 4000,
    );
  }

  handleRetryTimeout(
    commandId: string,
    pending: PendingCommand,
    type: UICommandType,
    reject: (error: Error) => void
  ): void {
    if (!this.pendingCommands.has(commandId)) {
      return;
    }

    if (pending.attempts < (this.config.maxCommandRetries ?? 0)) {
      pending.attempts += 1;
      const delay = this.retryDelay(pending.attempts);

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

  createError(
    payload: CoreCommandErrorPayload | { message?: string } | null | undefined,
    commandId?: string
  ): Error {
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

  createErrorEvent(payload: CoreCommandErrorPayload): {
    error: Error;
    commandId?: string;
    code?: string;
    details?: Record<string, unknown>;
    recoverable?: boolean;
  } {
    return {
      error: this.createError(payload, payload.commandId),
      commandId: payload.commandId,
      code: payload.code,
      details: payload.details,
      recoverable: payload.recoverable,
    };
  }
}
