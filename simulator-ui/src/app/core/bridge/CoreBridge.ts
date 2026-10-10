import { CORE_PROTOCOL_VERSION } from '../types';
import type { UICommandType, UICommandPayloadMap, UICommand } from '../types';
import { BridgeConfig, DEFAULT_CONFIG } from './BridgeConfig';
import { PendingCommand, EventMap, EventCallback } from './BridgeTypes';
import { BridgeEventEmitter } from './BridgeEventEmitter';
import { ConnectionManager } from './ConnectionManager';
import { MessageHandler } from './MessageHandler';
import { validateCommand } from './CommandValidator';

export class CoreBridge {
  private config: BridgeConfig;
  private emitter: BridgeEventEmitter;
  private connectionManager: ConnectionManager;
  private messageHandler: MessageHandler;
  private pendingCommands: Map<string, PendingCommand> = new Map();
  private commandIdCounter = 0;

  constructor(config: Partial<BridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.emitter = new BridgeEventEmitter();

    this.connectionManager = new ConnectionManager({
      config: this.config,
      onConnected: () => {
        this.emitter.emit('connected', undefined);
      },
      onDisconnected: (reason) => {
        this.pendingCommands.forEach(pending => {
          window.clearTimeout(pending.timerId);
          pending.reject(new Error('Connection lost'));
        });
        this.pendingCommands.clear();

        this.emitter.emit('disconnected', { reason });
      },
      onError: (error) => {
        this.emitter.emit('error', { error });
      },
      onMessage: (raw) => {
        this.messageHandler.handleMessage(raw);
      },
      resync: () => this.resync()
    });

    this.messageHandler = new MessageHandler({
      config: this.config,
      pendingCommands: this.pendingCommands,
      emit: (event, data) => this.emitter.emit(event, data),
      sendRaw: (data) => this.connectionManager.sendRaw(data)
    });
  }

  async connect(): Promise<void> {
    await this.connectionManager.connect();
  }

  disconnect(): void {
    this.connectionManager.disconnect();
  }

  private async resync(): Promise<void> {
    if (!this.isConnected()) return;

    console.log('[Bridge] Resyncing system state...');
    try {
      await this.send('GET_INITIAL_STATE');
      await this.send('GET_CONNECTOR_CATALOG');
      await this.send('SUBSCRIBE_METRICS');

      console.log('[Bridge] Resync complete');
    } catch (error) {
      console.error('[Bridge] Resync failed:', error);
    }
  }

  send<T extends UICommandType, R = any>(
    type: T,
    payload?: UICommandPayloadMap[T],
    onResponse?: (data: R) => void
  ): Promise<R> {
    const validationError = validateCommand(type, payload);
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

            this.emitter.emit('error', {
              error: this.messageHandler.createError({
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
              this.connectionManager.sendRaw(JSON.stringify(pending.command));
              scheduleAttempt();
            }, delay);
            return;
          }

          this.pendingCommands.delete(id);
          reject(this.messageHandler.createError({
            status: 'error',
            code: 'BRIDGE_TIMEOUT',
            message: `Comando ${type} timeout`,
            recoverable: false,
            commandId: id,
          }, id));
        }, this.config.commandTimeoutMs ?? 30000);
      };

      this.pendingCommands.set(id, pending);
      this.connectionManager.sendRaw(JSON.stringify(command));
      scheduleAttempt();
    });
  }

  on<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): () => void {
    return this.emitter.on(event, callback);
  }

  off<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): void {
    this.emitter.off(event, callback);
  }

  isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  getMode(): 'websocket' | 'jcef' {
    return this.connectionManager.detectMode();
  }
}
