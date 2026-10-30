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
