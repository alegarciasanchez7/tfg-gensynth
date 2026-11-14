import type { UICommandType, UICommandPayloadMap } from '../types';
import { SUPPORTED_COMMANDS } from './BridgeTypes';

/** Reads the fields of a command payload; every field is undefined when the payload is not an object. */
type FieldReader = (field: string) => unknown;

/** Validates the payload of one command type; returns the error, or null when the payload is valid. */
type PayloadValidator = (read: FieldReader, type: UICommandType) => Error | null;

/** Whether a value is a plain object (not null, not an array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A reader of the fields of a value, which reads nothing when the value is not a plain object. */
function fieldReader(value: unknown): FieldReader {
  return (field) => (isPlainObject(value) ? value[field] : undefined);
}

/** Whether every field is a string. */
function hasStrings(read: FieldReader, fields: string[]): boolean {
  return fields.every(field => typeof read(field) === 'string');
}

/** The error unless the field is a non-blank string. */
function requireStringField(read: FieldReader, field: string, message: string): Error | null {
  const value = read(field);
  return typeof value === 'string' && value.trim().length > 0 ? null : new Error(message);
}

/** The error unless every field is a string. */
function requireStrings(read: FieldReader, fields: string[], message: string): Error | null {
  return hasStrings(read, fields) ? null : new Error(message);
}

/** everyTicks (optional): an integer >= 1. */
function validateEveryTicks(read: FieldReader): Error | null {
  const everyTicks = read('everyTicks');
  return everyTicks !== undefined && !(Number.isInteger(everyTicks) && (everyTicks as number) >= 1)
    ? new Error('everyTicks must be an integer >= 1')
    : null;
}

/** Event loss fields (optional): a percentage in [0, 100] and two tick counts >= 0. */
function validateEventLoss(read: FieldReader): Error | null {
  const lossPercent = read('lossPercent');
  if (lossPercent !== undefined
    && !(typeof lossPercent === 'number' && Number.isFinite(lossPercent) && lossPercent >= 0 && lossPercent <= 100)) {
    return new Error('lossPercent must be a number between 0 and 100');
  }
  for (const field of ['outageEveryTicks', 'outageDurationTicks']) {
    const value = read(field);
    if (value !== undefined && !(Number.isInteger(value) && (value as number) >= 0)) {
      return new Error(`${field} must be an integer >= 0`);
    }
  }
  return null;
}

/** Sequential order (optional): one of the values the Core accepts. */
function validateSequentialOrder(read: FieldReader): Error | null {
  const sequentialOrder = read('sequentialOrder');
  return sequentialOrder !== undefined
    && !(sequentialOrder === 'flow' || sequentialOrder === 'random' || sequentialOrder === 'generated')
    ? new Error("sequentialOrder must be 'flow', 'random' or 'generated'")
    : null;
}

/** The tick timing fields shared by CREATE_FLOW and UPDATE_FLOW_CONFIG. */
function validateFlowTiming(read: FieldReader): Error | null {
  return validateEveryTicks(read) ?? validateEventLoss(read);
}

const noPayload: PayloadValidator = () => null;

const requireGroupId: PayloadValidator = (read, type) =>
  requireStringField(read, 'groupId', `El comando ${type} requiere groupId`);

const validatePluginJar: PayloadValidator = (read, type) =>
  requireStrings(read, ['jarBase64', 'pluginName', 'pluginVersion'],
    `El comando ${type} requiere jarBase64, pluginName y pluginVersion`);

/** The validator of every supported command. */
const VALIDATORS: Partial<Record<UICommandType, PayloadValidator>> = {
  START_SYSTEM: noPayload,
  STOP_SYSTEM: noPayload,
  GET_INITIAL_STATE: noPayload,
  LOAD_STATE: noPayload,
  SAVE_STATE: noPayload,
  GET_CONNECTOR_CATALOG: noPayload,
  SUBSCRIBE_METRICS: noPayload,
  UNSUBSCRIBE_METRICS: noPayload,
  CHECK_FOR_UPDATES: noPayload,
  CANCEL_UPDATE: noPayload,
  PICK_DIRECTORY: noPayload,
  EXPORT_STATE: noPayload,
  START_GROUP: requireGroupId,
  STOP_GROUP: requireGroupId,
  PAUSE_GROUP: requireGroupId,
  DELETE_GROUP: requireGroupId,
  DELETE_VARIABLE: (read) =>
    requireStringField(read, 'variableId', 'El comando DELETE_VARIABLE requiere variableId'),
  GET_LATEST_CONNECTOR: (read) =>
    requireStringField(read, 'pluginId', 'El comando GET_LATEST_CONNECTOR requiere pluginId'),
  DELETE_FLOW: (read) =>
    requireStrings(read, ['flowId', 'groupId'], 'El comando DELETE_FLOW requiere flowId y groupId'),
  CREATE_GROUP: (read) =>
    validateSequentialOrder(read) ?? requireStringField(read, 'name', 'El comando CREATE_GROUP requiere name'),
  CREATE_FLOW: (read) =>
    validateFlowTiming(read)
    ?? requireStrings(read, ['groupId', 'name', 'technology'], 'El comando CREATE_FLOW requiere groupId, name y technology'),
  UPDATE_GROUP_CONFIG: (read) => {
    const orderError = validateSequentialOrder(read);
    if (orderError) return orderError;
    const flowIds = read('flowIds');
    if (flowIds !== undefined && !(Array.isArray(flowIds) && flowIds.every(id => typeof id === 'string'))) {
      return new Error('flowIds must be a list of flow ids');
    }
    return requireStringField(read, 'groupId', 'El comando UPDATE_GROUP_CONFIG requiere groupId');
  },
  UPDATE_FLOW_CONFIG: (read) =>
    validateFlowTiming(read)
    ?? requireStrings(read, ['flowId', 'groupId'], 'El comando UPDATE_FLOW_CONFIG requiere flowId y groupId'),
  CREATE_VARIABLE: (read) =>
    requireStrings(read, ['name', 'type', 'scope'], 'El comando CREATE_VARIABLE requiere name, type y scope'),
  UPDATE_VARIABLE: (read) =>
    requireStringField(read, 'variableId', 'El comando UPDATE_VARIABLE requiere variableId'),
  VALIDATE_PLUGIN: validatePluginJar,
  INSTALL_PLUGIN: validatePluginJar,
  UNINSTALL_PLUGIN: (read) =>
    requireStrings(read, ['pluginId', 'pluginVersion'], 'El comando UNINSTALL_PLUGIN requiere pluginId y pluginVersion'),
  IMPORT_STATE: (read) =>
    Array.isArray(read('groups')) && Array.isArray(read('variables'))
      ? null
      : new Error('El comando IMPORT_STATE requiere un payload con groups y variables (arrays)'),
  CLONE_GROUP: (read) =>
    requireStringField(read, 'groupId', 'El comando CLONE_GROUP requiere groupId'),
  CLONE_FLOW: (read) =>
    requireStrings(read, ['groupId', 'flowId'], 'El comando CLONE_FLOW requiere groupId y flowId'),
  UI_LOG: (read) =>
    requireStrings(read, ['message'], 'El comando UI_LOG requiere message'),
  UPDATE_SETTINGS: (read) => {
    const tick = read('tick');
    const readTick = fieldReader(tick);
    return isPlainObject(tick)
      && typeof readTick('mode') === 'string'
      && typeof readTick('value') === 'number'
      && typeof readTick('unit') === 'string'
      ? null
      : new Error('El comando UPDATE_SETTINGS requiere tick con mode, value y unit');
  },
  UPDATE_OUTPUT_FOLDER: (read) => {
    const path = read('path');
    return typeof path === 'string' || path === null
      ? null
      : new Error('El comando UPDATE_OUTPUT_FOLDER requiere path (texto o null)');
  },
  INSTALL_UPDATE: (read) =>
    requireStringField(read, 'version', 'El comando INSTALL_UPDATE requiere version'),
};

export function validateCommand<T extends UICommandType>(
  type: T,
  payload?: UICommandPayloadMap[T]
): Error | null {
  if (!SUPPORTED_COMMANDS.has(type)) {
    return new Error(`The command ${type} is not supported by the current bridge`);
  }
  const validator = VALIDATORS[type];
  if (!validator) {
    return new Error(`Validation not implemented for ${type}`);
  }
  return validator(fieldReader(payload), type);
}
