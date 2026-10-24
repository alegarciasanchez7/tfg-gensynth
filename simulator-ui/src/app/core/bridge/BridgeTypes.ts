import type {
  CoreMessage,
  UICommand,
  UICommandType,
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
  InitialStatePayload,
} from '../types';
import type { ProjectSettings } from '../../types';

export type EventCallback<T = unknown> = (data: T) => void;

export type PendingCommand = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timerId: number;
  command: UICommand;
  attempts: number;
  onResponse?: (payload: any) => void;
};

export const SUPPORTED_COMMANDS = new Set<UICommandType>([
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
  'UPDATE_SETTINGS',
]);

/**
 * Commands answered only when the user closes a native file or folder dialog (desktop app).
 * They never time out and are never sent again: the user may take as long as needed, and a
 * second send would open a second dialog over the first one. A lost connection still rejects them.
 */
export const USER_DIALOG_COMMANDS: ReadonlySet<UICommandType> = new Set<UICommandType>([
  'LOAD_STATE',
  'SAVE_STATE',
  'PICK_DIRECTORY',
]);

export interface EventMap {
  'connected': undefined;
  'disconnected': { reason: string };
  'error': { error: Error; commandId?: string; code?: string; details?: Record<string, unknown>; recoverable?: boolean };
  'system-status': SystemStatusPayload;
  'metrics': MetricsPayload;
  'log': LogPayload;
  'groups-update': GroupState[];
  'flows-metrics': FlowMetricsPayload[];
  'variables-update': VariableState[];
  'initial-state': InitialStatePayload;
  'connector-catalog': ConnectorPluginDescriptor[];
  'message': CoreMessage;
  'trace': TracePayload;
  'plugin-validation-result': PluginValidationResultPayload;
  'plugin-install-result': PluginInstallResultPayload;
  'restart-required': RestartRequiredPayload;
  'rollback-report': RollbackReportPayload;
  'settings-update': ProjectSettings;
  'NATIVE_FILE_DROPPED': { filename: string; base64: string };
}
