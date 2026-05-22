import type { EventMap, EventCallback } from './BridgeTypes';

export class BridgeEventEmitter {
  private eventListeners: Map<string, Set<EventCallback>> = new Map();

  on<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback as EventCallback);

    // Returns an unsubscribe function
    return () => this.off(event, callback);
  }

  off<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): void {
    this.eventListeners.get(event)?.delete(callback as EventCallback);
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.eventListeners.get(event)?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[Bridge] Error in ${event} listener:`, error);
      }
    });
  }
}
