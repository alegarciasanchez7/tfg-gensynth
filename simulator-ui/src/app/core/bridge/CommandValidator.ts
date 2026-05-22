import type { UICommandType, UICommandPayloadMap } from '../types';
import { SUPPORTED_COMMANDS } from './BridgeTypes';

export function validateCommand<T extends UICommandType>(
  type: T,
  payload?: UICommandPayloadMap[T]
): Error | null {
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
