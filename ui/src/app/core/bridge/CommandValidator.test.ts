import { describe, expect, it } from 'vitest';
import { validateCommand } from './CommandValidator';
import type { CreateFlowCommandPayload, UpdateFlowCommandPayload } from '../types';

const create = (overrides: Partial<CreateFlowCommandPayload> = {}): CreateFlowCommandPayload => ({
  groupId: 'g1',
  name: 'Flow',
  technology: 'file',
  host: 'localhost',
  port: 0,
  ...overrides,
});

const update = (overrides: Partial<UpdateFlowCommandPayload> = {}): UpdateFlowCommandPayload => ({
  groupId: 'g1',
  flowId: 'f1',
  ...overrides,
});

describe('validateCommand event loss fields', () => {
  it('accepts valid or missing event loss fields', () => {
    expect(validateCommand('CREATE_FLOW', create())).toBeNull();
    expect(validateCommand('CREATE_FLOW', create({ lossPercent: 0, outageEveryTicks: 0, outageDurationTicks: 0 }))).toBeNull();
    expect(validateCommand('UPDATE_FLOW_CONFIG', update({ lossPercent: 100 }))).toBeNull();
    expect(validateCommand('UPDATE_FLOW_CONFIG', update({ lossPercent: 12.5, outageEveryTicks: 10, outageDurationTicks: 3 }))).toBeNull();
  });

  it('rejects a loss percentage outside [0, 100] or not finite', () => {
    for (const lossPercent of [-1, 100.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateCommand('UPDATE_FLOW_CONFIG', update({ lossPercent }))?.message).toMatch(/lossPercent/);
      expect(validateCommand('CREATE_FLOW', create({ lossPercent }))?.message).toMatch(/lossPercent/);
    }
  });

  it('rejects outage values that are not integers >= 0', () => {
    expect(validateCommand('UPDATE_FLOW_CONFIG', update({ outageEveryTicks: -1 }))?.message).toMatch(/outageEveryTicks/);
    expect(validateCommand('UPDATE_FLOW_CONFIG', update({ outageDurationTicks: 1.5 }))?.message).toMatch(/outageDurationTicks/);
    expect(validateCommand('CREATE_FLOW', create({ outageEveryTicks: 2.5 }))?.message).toMatch(/outageEveryTicks/);
  });
});

describe('validateCommand UPDATE_OUTPUT_FOLDER', () => {
  it('accepts a path or null (back to the default folder)', () => {
    expect(validateCommand('UPDATE_OUTPUT_FOLDER', { path: '/home/ana/results' })).toBeNull();
    expect(validateCommand('UPDATE_OUTPUT_FOLDER', { path: null })).toBeNull();
  });

  it('rejects a missing payload or a path that is not text', () => {
    expect(validateCommand('UPDATE_OUTPUT_FOLDER', undefined)?.message).toMatch(/UPDATE_OUTPUT_FOLDER/);
    expect(validateCommand('UPDATE_OUTPUT_FOLDER', { path: 42 } as unknown as { path: string })?.message)
      .toMatch(/UPDATE_OUTPUT_FOLDER/);
  });
});

describe('validateCommand group order fields', () => {
  it('accepts a known sequential order and a list of flow ids', () => {
    expect(validateCommand('UPDATE_GROUP_CONFIG', { groupId: 'g1', sequentialOrder: 'generated', flowIds: ['f2', 'f1'] })).toBeNull();
    expect(validateCommand('CREATE_GROUP', { name: 'G', sequentialOrder: 'random' })).toBeNull();
  });

  it('rejects an unknown sequential order or flow ids that are not a list of texts', () => {
    expect(validateCommand('UPDATE_GROUP_CONFIG', { groupId: 'g1', sequentialOrder: 'fifo' })?.message).toMatch(/sequentialOrder/);
    expect(validateCommand('CREATE_GROUP', { name: 'G', sequentialOrder: 'fifo' })?.message).toMatch(/sequentialOrder/);
    expect(validateCommand('UPDATE_GROUP_CONFIG', { groupId: 'g1', flowIds: 'f1,f2' } as unknown as { groupId: string })?.message)
      .toMatch(/flowIds/);
    expect(validateCommand('UPDATE_GROUP_CONFIG', { groupId: 'g1', flowIds: [1, 2] } as unknown as { groupId: string })?.message)
      .toMatch(/flowIds/);
  });
});

describe('validateCommand update commands', () => {
  it('needs the version the user accepted to install an update', () => {
    expect(validateCommand('CHECK_FOR_UPDATES', undefined)).toBeNull();
    expect(validateCommand('CANCEL_UPDATE', undefined)).toBeNull();
    expect(validateCommand('INSTALL_UPDATE', { version: '0.5.3' })).toBeNull();
    expect(validateCommand('INSTALL_UPDATE', { version: '' })?.message).toMatch(/version/);
  });
});

describe('validateCommand per command type', () => {
  /** Sends a payload whose shape the test chooses freely (also invalid ones). */
  const validate = (type: Parameters<typeof validateCommand>[0], payload: unknown) =>
    validateCommand(type, payload as never)?.message ?? null;

  it('accepts the commands without payload', () => {
    for (const type of ['START_SYSTEM', 'STOP_SYSTEM', 'GET_INITIAL_STATE', 'LOAD_STATE', 'SAVE_STATE',
      'GET_CONNECTOR_CATALOG', 'SUBSCRIBE_METRICS', 'UNSUBSCRIBE_METRICS', 'PICK_DIRECTORY', 'EXPORT_STATE'] as const) {
      expect(validate(type, undefined)).toBeNull();
    }
  });

  it('rejects a command the bridge does not support', () => {
    expect(validate('NOT_A_COMMAND' as never, undefined)).toBe('The command NOT_A_COMMAND is not supported by the current bridge');
  });

  it('reports the missing fields of every command with a payload', () => {
    const cases: Array<[Parameters<typeof validateCommand>[0], string]> = [
      ['START_GROUP', 'El comando START_GROUP requiere groupId'],
      ['STOP_GROUP', 'El comando STOP_GROUP requiere groupId'],
      ['PAUSE_GROUP', 'El comando PAUSE_GROUP requiere groupId'],
      ['DELETE_GROUP', 'El comando DELETE_GROUP requiere groupId'],
      ['DELETE_VARIABLE', 'El comando DELETE_VARIABLE requiere variableId'],
      ['GET_LATEST_CONNECTOR', 'El comando GET_LATEST_CONNECTOR requiere pluginId'],
      ['DELETE_FLOW', 'El comando DELETE_FLOW requiere flowId y groupId'],
      ['CREATE_GROUP', 'El comando CREATE_GROUP requiere name'],
      ['CREATE_FLOW', 'El comando CREATE_FLOW requiere groupId, name y technology'],
      ['UPDATE_GROUP_CONFIG', 'El comando UPDATE_GROUP_CONFIG requiere groupId'],
      ['UPDATE_FLOW_CONFIG', 'El comando UPDATE_FLOW_CONFIG requiere flowId y groupId'],
      ['CREATE_VARIABLE', 'El comando CREATE_VARIABLE requiere name, type y scope'],
      ['UPDATE_VARIABLE', 'El comando UPDATE_VARIABLE requiere variableId'],
      ['VALIDATE_PLUGIN', 'El comando VALIDATE_PLUGIN requiere jarBase64, pluginName y pluginVersion'],
      ['INSTALL_PLUGIN', 'El comando INSTALL_PLUGIN requiere jarBase64, pluginName y pluginVersion'],
      ['UNINSTALL_PLUGIN', 'El comando UNINSTALL_PLUGIN requiere pluginId y pluginVersion'],
      ['IMPORT_STATE', 'El comando IMPORT_STATE requiere un payload con groups y variables (arrays)'],
      ['CLONE_GROUP', 'El comando CLONE_GROUP requiere groupId'],
      ['CLONE_FLOW', 'El comando CLONE_FLOW requiere groupId y flowId'],
      ['UI_LOG', 'El comando UI_LOG requiere message'],
      ['UPDATE_SETTINGS', 'El comando UPDATE_SETTINGS requiere tick con mode, value y unit'],
      ['INSTALL_UPDATE', 'El comando INSTALL_UPDATE requiere version'],
    ];
    for (const [type, message] of cases) {
      expect(validate(type, undefined)).toBe(message);
      expect(validate(type, [])).toBe(message);
      expect(validate(type, {})).toBe(message);
    }
  });

  it('rejects blank texts where a non-blank one is required', () => {
    expect(validate('START_GROUP', { groupId: '   ' })).toBe('El comando START_GROUP requiere groupId');
    expect(validate('CREATE_GROUP', { name: '' })).toBe('El comando CREATE_GROUP requiere name');
    expect(validate('DELETE_FLOW', { flowId: 'f1', groupId: 7 })).toBe('El comando DELETE_FLOW requiere flowId y groupId');
  });

  it('accepts the valid payload of every command', () => {
    expect(validate('START_GROUP', { groupId: 'g1' })).toBeNull();
    expect(validate('DELETE_VARIABLE', { variableId: 'v1' })).toBeNull();
    expect(validate('GET_LATEST_CONNECTOR', { pluginId: 'p' })).toBeNull();
    expect(validate('DELETE_FLOW', { flowId: 'f1', groupId: 'g1' })).toBeNull();
    expect(validate('CREATE_GROUP', { name: 'G' })).toBeNull();
    expect(validate('UPDATE_GROUP_CONFIG', { groupId: 'g1' })).toBeNull();
    expect(validate('CREATE_VARIABLE', { name: 'v', type: 'numeric', scope: 'global' })).toBeNull();
    expect(validate('UPDATE_VARIABLE', { variableId: 'v1' })).toBeNull();
    expect(validate('VALIDATE_PLUGIN', { jarBase64: 'AA==', pluginName: 'p', pluginVersion: '1' })).toBeNull();
    expect(validate('UNINSTALL_PLUGIN', { pluginId: 'p', pluginVersion: '1' })).toBeNull();
    expect(validate('IMPORT_STATE', { groups: [], variables: [] })).toBeNull();
    expect(validate('CLONE_GROUP', { groupId: 'g1' })).toBeNull();
    expect(validate('CLONE_FLOW', { groupId: 'g1', flowId: 'f1' })).toBeNull();
    expect(validate('UI_LOG', { message: 'hi' })).toBeNull();
    expect(validate('UPDATE_SETTINGS', { tick: { mode: 'FIXED_RATE', value: 1, unit: 'SECONDS' } })).toBeNull();
  });

  it('checks the tick of UPDATE_SETTINGS field by field', () => {
    const message = 'El comando UPDATE_SETTINGS requiere tick con mode, value y unit';
    expect(validate('UPDATE_SETTINGS', { tick: [] })).toBe(message);
    expect(validate('UPDATE_SETTINGS', { tick: { mode: 'FIXED_RATE', value: '1', unit: 'SECONDS' } })).toBe(message);
    expect(validate('UPDATE_SETTINGS', { tick: { mode: 'FIXED_RATE', value: 1 } })).toBe(message);
  });

  it('checks everyTicks before the required flow fields', () => {
    expect(validate('CREATE_FLOW', { everyTicks: 0 })).toBe('everyTicks must be an integer >= 1');
    expect(validate('UPDATE_FLOW_CONFIG', { groupId: 'g1', flowId: 'f1', everyTicks: 1.5 })).toBe('everyTicks must be an integer >= 1');
    expect(validate('UPDATE_FLOW_CONFIG', { groupId: 'g1', flowId: 'f1', everyTicks: 3 })).toBeNull();
  });
});
