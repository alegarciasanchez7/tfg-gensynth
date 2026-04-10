/**
 * Utilidades para la integración con JCEF
 * 
 * Este módulo proporciona funciones helper para trabajar con JCEF
 * cuando la aplicación está embebida en una aplicación Java
 */

// ─────────────────────────────────────────────────────────────
// Tipos JCEF
// ─────────────────────────────────────────────────────────────

export interface JCEFBridge {
  /**
   * Envía un mensaje al Core Java
   */
  sendToCore: (data: string) => void;
  
  /**
   * Registra un callback para recibir mensajes del Core
   */
  registerCallback: (name: string, callback: (data: string) => void) => void;
  
  /**
   * Obtiene información del entorno Java
   */
  getJavaInfo?: () => string;
  
  /**
   * Solicita cierre de la aplicación
   */
  requestClose?: () => void;
  
  /**
   * Minimiza la ventana
   */
  minimize?: () => void;
  
  /**
   * Maximiza/restaura la ventana
   */
  toggleMaximize?: () => void;
}

export interface JCEFWindow extends Window {
  javaBridge?: JCEFBridge;
}

// ─────────────────────────────────────────────────────────────
// Detección de entorno
// ─────────────────────────────────────────────────────────────

/**
 * Detecta si la aplicación está corriendo dentro de JCEF
 */
export function isRunningInJCEF(): boolean {
  return typeof window !== 'undefined' && !!(window as JCEFWindow).javaBridge;
}

/**
 * Obtiene el bridge de JCEF si está disponible
 */
export function getJCEFBridge(): JCEFBridge | null {
  if (isRunningInJCEF()) {
    return (window as JCEFWindow).javaBridge!;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Acciones de ventana (solo disponibles en JCEF)
// ─────────────────────────────────────────────────────────────

/**
 * Solicita cerrar la aplicación
 */
export function requestClose(): boolean {
  const bridge = getJCEFBridge();
  if (bridge?.requestClose) {
    bridge.requestClose();
    return true;
  }
  return false;
}

/**
 * Minimiza la ventana
 */
export function minimize(): boolean {
  const bridge = getJCEFBridge();
  if (bridge?.minimize) {
    bridge.minimize();
    return true;
  }
  return false;
}

/**
 * Maximiza o restaura la ventana
 */
export function toggleMaximize(): boolean {
  const bridge = getJCEFBridge();
  if (bridge?.toggleMaximize) {
    bridge.toggleMaximize();
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Información de entorno
// ─────────────────────────────────────────────────────────────

interface EnvironmentInfo {
  isJCEF: boolean;
  isDevelopment: boolean;
  platform: string;
  javaInfo?: string;
}

/**
 * Obtiene información del entorno actual
 */
export function getEnvironmentInfo(): EnvironmentInfo {
  const bridge = getJCEFBridge();
  
  return {
    isJCEF: isRunningInJCEF(),
    isDevelopment: import.meta.env.DEV,
    platform: navigator.platform,
    javaInfo: bridge?.getJavaInfo?.(),
  };
}

// ─────────────────────────────────────────────────────────────
// Inicialización de JCEF
// ─────────────────────────────────────────────────────────────

/**
 * Espera a que el bridge de JCEF esté disponible
 * Útil cuando la aplicación necesita esperar a que Java inicialice el bridge
 */
export function waitForJCEFBridge(timeout = 5000): Promise<JCEFBridge> {
  return new Promise((resolve, reject) => {
    // Si ya está disponible, resolver inmediatamente
    const bridge = getJCEFBridge();
    if (bridge) {
      resolve(bridge);
      return;
    }

    // Esperar a que esté disponible
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      const bridge = getJCEFBridge();
      if (bridge) {
        clearInterval(checkInterval);
        resolve(bridge);
        return;
      }

      if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        reject(new Error('Timeout esperando JCEF Bridge'));
      }
    }, 100);
  });
}

// ─────────────────────────────────────────────────────────────
// Integración con el ciclo de vida
// ─────────────────────────────────────────────────────────────

/**
 * Registra handlers para eventos del ciclo de vida de la aplicación
 */
export function registerLifecycleHandlers(handlers: {
  onBeforeClose?: () => boolean | void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onRestore?: () => void;
}): void {
  const bridge = getJCEFBridge();
  if (!bridge) return;

  // Registrar callbacks con el bridge de Java
  if (handlers.onBeforeClose) {
    bridge.registerCallback('onBeforeClose', () => {
      const shouldClose = handlers.onBeforeClose!();
      // Enviar respuesta a Java
      bridge.sendToCore(JSON.stringify({
        type: 'LIFECYCLE_RESPONSE',
        event: 'beforeClose',
        allowClose: shouldClose !== false,
      }));
    });
  }

  if (handlers.onMinimize) {
    bridge.registerCallback('onMinimize', handlers.onMinimize);
  }

  if (handlers.onMaximize) {
    bridge.registerCallback('onMaximize', handlers.onMaximize);
  }

  if (handlers.onRestore) {
    bridge.registerCallback('onRestore', handlers.onRestore);
  }
}
