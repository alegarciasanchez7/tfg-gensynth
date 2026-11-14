import { describe, expect, it } from 'vitest';
import type { Flow, Group, Variable } from '../types';
import { createFlowUpdatePayload, createGroupUpdatePayload, createVariableUpdatePayload } from './optimisticUpdateHelper';

const group = { id: 'g1', name: 'Old', description: 'd', enabled: true } as Group;
const flow = { id: 'f1', name: 'Flow', everyTicks: 1, enabled: true } as Flow;
const variable = { id: 'v1', name: 'speed', type: 'numeric', scope: 'global', config: { min: 0 } } as Variable;

describe('update payloads', () => {
  it('keeps in the rollback only the previous values of the changed fields', () => {
    expect(createGroupUpdatePayload(group, { name: 'New' })).toEqual({
      optimistic: { id: 'g1', name: 'New' },
      rollback: { id: 'g1', name: 'Old' },
    });
  });

  it('builds the flow payloads, including fields that were missing before', () => {
    expect(createFlowUpdatePayload(flow, { everyTicks: 5, template: '{}' })).toEqual({
      optimistic: { id: 'f1', everyTicks: 5, template: '{}' },
      rollback: { id: 'f1', everyTicks: 1, template: undefined },
    });
  });

  it('builds the variable payloads', () => {
    const update = createVariableUpdatePayload(variable, { config: { min: 5 } });
    expect(update.optimistic).toEqual({ id: 'v1', config: { min: 5 } });
    expect(update.rollback).toEqual({ id: 'v1', config: { min: 0 } });
  });
});
