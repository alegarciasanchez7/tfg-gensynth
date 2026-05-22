import { bridge } from '../bridge';
import type { PluginValidationResultPayload, PluginInstallResultPayload } from '../types';

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
  cloneGroup: (groupId: string, count: number, namingPattern?: string) => bridge.send('CLONE_GROUP', { groupId, count, namingPattern }),
  cloneFlow: (groupId: string, flowId: string, count: number, namingPattern?: string) => bridge.send('CLONE_FLOW', { groupId, flowId, count, namingPattern }),
};
