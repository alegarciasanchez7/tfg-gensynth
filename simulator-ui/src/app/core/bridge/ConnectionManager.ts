import type { BridgeConfig } from './BridgeConfig';
import type { JCEFWindow } from '../jcef';

export interface ConnectionManagerOptions {
  config: BridgeConfig;
  onConnected: () => void;
  onDisconnected: (reason: string) => void;
  onError: (error: Error) => void;
  onMessage: (raw: string) => void;
  resync: () => Promise<void>;
}

export class ConnectionManager {
  private config: BridgeConfig;
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;

  private onConnected: () => void;
  private onDisconnected: (reason: string) => void;
  private onError: (error: Error) => void;
  private onMessage: (raw: string) => void;
  private resync: () => Promise<void>;

  constructor(options: ConnectionManagerOptions) {
    this.config = options.config;
    this.onConnected = options.onConnected;
    this.onDisconnected = options.onDisconnected;
    this.onError = options.onError;
    this.onMessage = options.onMessage;
    this.resync = options.resync;
  }

  async connect(): Promise<void> {
    const mode = this.detectMode();

    if (mode === 'jcef') {
      await this.connectJCEF();
    } else {
      await this.connectWebSocket();
    }
  }

  detectMode(): 'websocket' | 'jcef' {
    if (this.config.mode !== 'auto') {
      return this.config.mode;
    }

    if (typeof window !== 'undefined' && (window as JCEFWindow).javaBridge) {
      return 'jcef';
    }

    return 'websocket';
  }

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
          this.onConnected();
          console.log('[Bridge] Connected to the Java core via WebSocket');
          this.resync().catch(err => console.error('[Bridge] Error during post-connect resync:', err));
          resolve();
        };

        this.ws.onclose = (event) => {
          this.connected = false;
          const reason = event.reason || 'Connection closed';
          
          this.onDisconnected(reason);
          console.log('[Bridge] Disconnected from the Java core');
          this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('[Bridge] WebSocket error:', error);
          this.onError(new Error('WebSocket error'));
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onmessage = (event) => {
          this.onMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private async connectJCEF(): Promise<void> {
    const jcef = (window as JCEFWindow).javaBridge;

    if (!jcef) {
      throw new Error('JCEF Bridge no disponible');
    }

    jcef.registerCallback('onCoreMessage', (messageJson: string) => {
      this.onMessage(messageJson);
    });

    this.connected = true;
    this.onConnected();
    console.log('[Bridge] Connected to the Java core via JCEF Bridge');
  }

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

  sendRaw(data: string): void {
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

  isConnected(): boolean {
    return this.connected;
  }
}
