/**
 * Bridge de comunicación con el Core Java
 * 
 * Este módulo maneja la comunicación bidireccional entre la UI React
 * y el núcleo Java. Soporta dos modos de comunicación:
 * 
 * 1. WebSocket: Para cuando la UI corre en navegador externo o desarrollo
 * 2. JCEF Bridge: Comunicación directa cuando está embebido en JCEF
 */

import type {
  CoreMessage,
  UICommand,
  UICommandType,
  InitialStatePayload,
  SystemStatusPayload,
  MetricsPayload,
  LogPayload,
  GroupState,
  FlowMetricsPayload,
  ConnectorPluginDescriptor,
} from './types';

// ─────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────

export interface BridgeConfig {
  mode: 'websocket' | 'jcef' | 'auto';
  websocketUrl?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

const DEFAULT_CONFIG: BridgeConfig = {
  mode: 'auto',
  websocketUrl: import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:8765',
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
};

// ─────────────────────────────────────────────────────────────
// Tipos de eventos
// ─────────────────────────────────────────────────────────────

type EventCallback<T = unknown> = (data: T) => void;

interface EventMap {
  'connected': undefined;
  'disconnected': { reason: string };
  'error': { error: Error };
  'system-status': SystemStatusPayload;
  'metrics': MetricsPayload;
  'log': LogPayload;
  'groups-update': GroupState[];
  'flow-update': FlowMetricsPayload;
  'initial-state': InitialStatePayload;
  'connector-catalog': ConnectorPluginDescriptor[];
  'message': CoreMessage;
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
  private pendingCommands: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }> = new Map();
  private commandIdCounter = 0;

  constructor(config: Partial<BridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─────────────────────────────────────────────────────────
  // Conexión
  // ─────────────────────────────────────────────────────────

  /**
   * Inicia la conexión con el Core Java
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
   * Detecta el modo de comunicación disponible
   */
  private detectMode(): 'websocket' | 'jcef' {
    if (this.config.mode !== 'auto') {
      return this.config.mode;
    }

    // Detectar si estamos en JCEF verificando la presencia del bridge global
    if (typeof window !== 'undefined' && (window as JCEFWindow).javaBridge) {
      return 'jcef';
    }

    return 'websocket';
  }

  /**
   * Conexión vía WebSocket
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
          console.log('[Bridge] Conectado al Core Java vía WebSocket');
          resolve();
        };

        this.ws.onclose = (event) => {
          this.connected = false;
          this.emit('disconnected', { reason: event.reason || 'Connection closed' });
          console.log('[Bridge] Desconectado del Core Java');
          this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('[Bridge] Error de WebSocket:', error);
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
   * Conexión vía JCEF Bridge
   */
  private async connectJCEF(): Promise<void> {
    const jcef = (window as JCEFWindow).javaBridge;
    
    if (!jcef) {
      throw new Error('JCEF Bridge no disponible');
    }

    // Registrar callback para recibir mensajes del Core Java
    jcef.registerCallback('onCoreMessage', (messageJson: string) => {
      this.handleMessage(messageJson);
    });

    this.connected = true;
    this.emit('connected', undefined);
    console.log('[Bridge] Conectado al Core Java vía JCEF Bridge');
  }

  /**
   * Desconecta del Core
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
   * Programa un intento de reconexión
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
      console.error('[Bridge] Máximo de intentos de reconexión alcanzado');
      return;
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectAttempts++;
      console.log(`[Bridge] Intento de reconexión ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`);
      this.connectWebSocket().catch(() => {
        // Se manejará en el siguiente ciclo
      });
    }, this.config.reconnectInterval);
  }

  // ─────────────────────────────────────────────────────────
  // Envío de comandos
  // ─────────────────────────────────────────────────────────

  /**
   * Envía un comando al Core Java
   */
  send<T = unknown>(type: UICommandType, payload?: T): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = `cmd_${++this.commandIdCounter}_${Date.now()}`;
      
      const command: UICommand<T> = {
        type,
        id,
        payload,
      };

      this.pendingCommands.set(id, { resolve, reject });

      // Timeout para comandos
      setTimeout(() => {
        if (this.pendingCommands.has(id)) {
          this.pendingCommands.delete(id);
          reject(new Error(`Comando ${type} timeout`));
        }
      }, 30000);

      this.sendRaw(JSON.stringify(command));
    });
  }

  /**
   * Envía datos raw al Core
   */
  private sendRaw(data: string): void {
    const mode = this.detectMode();

    if (mode === 'jcef') {
      const jcef = (window as JCEFWindow).javaBridge;
      jcef?.sendToCore(data);
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      console.warn('[Bridge] No hay conexión activa para enviar');
    }
  }

  // ─────────────────────────────────────────────────────────
  // Recepción de mensajes
  // ─────────────────────────────────────────────────────────

  /**
   * Procesa mensajes recibidos del Core
   */
  private handleMessage(raw: string): void {
    try {
      const message: CoreMessage = JSON.parse(raw);
      
      // Emitir evento genérico
      this.emit('message', message);

      // Emitir evento específico según el tipo
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
      }

      // Verificar si es respuesta a un comando pendiente
      const responseId = (message.payload as { commandId?: string })?.commandId;
      if (responseId && this.pendingCommands.has(responseId)) {
        const { resolve } = this.pendingCommands.get(responseId)!;
        this.pendingCommands.delete(responseId);
        resolve(message.payload);
      }
    } catch (error) {
      console.error('[Bridge] Error parseando mensaje:', error, raw);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Sistema de eventos
  // ─────────────────────────────────────────────────────────

  /**
   * Suscribe a un evento
   */
  on<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback as EventCallback);

    // Devuelve función para desuscribirse
    return () => this.off(event, callback);
  }

  /**
   * Desuscribe de un evento
   */
  off<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): void {
    this.eventListeners.get(event)?.delete(callback as EventCallback);
  }

  /**
   * Emite un evento
   */
  private emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.eventListeners.get(event)?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[Bridge] Error en listener de ${event}:`, error);
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
// Tipos para JCEF
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
// Comandos de conveniencia
// ─────────────────────────────────────────────────────────────

export const CoreCommands = {
  // Sistema
  startSystem: () => bridge.send('START_SYSTEM'),
  stopSystem: () => bridge.send('STOP_SYSTEM'),
  getInitialState: () => bridge.send('GET_INITIAL_STATE'),
  
  // Grupos
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
  createVariable: (config: { name: string; type: string; scope: string; config?: Record<string, unknown> }) =>
    bridge.send('CREATE_VARIABLE', config),
  deleteVariable: (variableId: string) => bridge.send('DELETE_VARIABLE', { variableId }),
  updateVariable: (config: { variableId: string; [key: string]: unknown }) =>
    bridge.send('UPDATE_VARIABLE', config),

  // Catálogo de conectores
  getConnectorCatalog: () => bridge.send('GET_CONNECTOR_CATALOG'),
  getLatestConnector: (pluginId: string) => bridge.send('GET_LATEST_CONNECTOR', { pluginId }),
  
  // Métricas
  subscribeMetrics: () => bridge.send('SUBSCRIBE_METRICS'),
  unsubscribeMetrics: () => bridge.send('UNSUBSCRIBE_METRICS'),
};

export default bridge;
