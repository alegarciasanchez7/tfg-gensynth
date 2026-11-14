import { describe, expect, it } from 'vitest';
import { OptimisticManager, entityTypeOfCommand, type OptimisticOperation } from './optimisticManager';

const createOp = (overrides: Partial<OptimisticOperation> = {}): OptimisticOperation => ({
  commandId: 'CREATE_GROUP:tmp:1',
  kind: 'create',
  entityType: 'group',
  entityId: 'tmp',
  tempIdMapping: { tempId: 'tmp', realId: undefined },
  createdAt: Date.now(),
  ttlMs: 5000,
  applied: false,
  ...overrides,
});

describe('entityTypeOfCommand', () => {
  it('derives the entity from the command type', () => {
    expect(entityTypeOfCommand('UPDATE_GROUP_CONFIG')).toBe('group');
    expect(entityTypeOfCommand('CREATE_FLOW')).toBe('flow');
    expect(entityTypeOfCommand('DELETE_VARIABLE')).toBe('variable');
  });
});

describe('OptimisticManager', () => {
  it('maps the temporary id of a create to the real one', () => {
    const manager = new OptimisticManager();
    manager.register(createOp());
    manager.updateTempIdMapping('CREATE_GROUP:tmp:1', 'g1');
    expect(manager.get('CREATE_GROUP:tmp:1')?.tempIdMapping?.realId).toBe('g1');
  });

  it('ignores the id mapping of an unknown operation or one without a temporary id', () => {
    const manager = new OptimisticManager();
    manager.register(createOp({ commandId: 'UPDATE_GROUP:g1:1', kind: 'update', tempIdMapping: undefined }));
    manager.updateTempIdMapping('UPDATE_GROUP:g1:1', 'g2');
    manager.updateTempIdMapping('missing', 'g3');
    expect(manager.get('UPDATE_GROUP:g1:1')?.tempIdMapping).toBeUndefined();
    expect(manager.get('missing')).toBeUndefined();
  });
});
