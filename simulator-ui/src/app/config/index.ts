/**
 * Configuración de la aplicación SYN·GEN
 * 
 * Esta configuración se usa tanto en desarrollo como en producción (JCEF)
 */

interface AppConfig {
  // Modo de conexión con el Core Java
  bridge: {
    mode: 'auto' | 'websocket' | 'jcef';
    websocketUrl: string;
    reconnectInterval: number;
    maxReconnectAttempts: number;
  };
  
  // Configuración de UI
  ui: {
    defaultTheme: 'light' | 'dark';
    maxLogEntries: number;
    metricsUpdateInterval: number;
  };
  
  // Configuración de desarrollo
  dev: {
    useMockData: boolean;
    enableDebugLogs: boolean;
  };
}

// Configuración por defecto
const defaultConfig: AppConfig = {
  bridge: {
    mode: 'auto',
    websocketUrl: 'ws://localhost:8765',
    reconnectInterval: 3000,
    maxReconnectAttempts: 10,
  },
  ui: {
    defaultTheme: 'light',
    maxLogEntries: 1000,
    metricsUpdateInterval: 1000,
  },
  dev: {
    useMockData: import.meta.env.DEV,
    enableDebugLogs: import.meta.env.DEV,
  },
};

// Configuración específica para producción (JCEF)
const productionConfig: Partial<AppConfig> = {
  bridge: {
    mode: 'jcef',
    websocketUrl: 'ws://localhost:8765', // Fallback
    reconnectInterval: 3000,
    maxReconnectAttempts: 5,
  },
  dev: {
    useMockData: false,
    enableDebugLogs: false,
  },
};

// Merge de configuración según entorno
export const config: AppConfig = import.meta.env.PROD
  ? { ...defaultConfig, ...productionConfig }
  : defaultConfig;

// Exportar configuración individual para conveniencia
export const bridgeConfig = config.bridge;
export const uiConfig = config.ui;
export const devConfig = config.dev;

export default config;
