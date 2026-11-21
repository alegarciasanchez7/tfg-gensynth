import { describe, expect, it } from 'vitest';
import { createErrorLog, createOperationLog, createSuccessLog } from './operationLoggingHelper';

describe('operationLoggingHelper', () => {
  it('names the resource type and adds the details in brackets', () => {
    const log = createErrorLog('update', 'flow', 'f1', 'Orders', 'timeout', 12, '10:00:00');
    expect(log.message).toBe('Flow "Orders" Update failed [12ms, Error: timeout]');
    expect(log.level).toBe('error');
    expect(log.source).toBe('FLOW');
  });

  it('leaves the details out when there are none', () => {
    expect(createSuccessLog('create', 'group', 'g1', 'Main', undefined, '10:00:00').message)
      .toBe('Group "Main" Create successful');
    expect(createOperationLog({ type: 'delete', resourceType: 'variable', resourceId: 'v1', state: 'reconciled' }, '10:00:00').message)
      .toBe('Variable (v1) Reconciled after error/reconnect');
  });
});
