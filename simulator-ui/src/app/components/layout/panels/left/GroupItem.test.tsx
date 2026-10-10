import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Group } from '../../../../types';

const { mockUseApp } = vi.hoisted(() => ({ mockUseApp: vi.fn() }));
vi.mock('../../../../context', () => ({ useApp: () => mockUseApp() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GroupItem } from './GroupItem';

/** The Node process running the tests (the UI tsconfig has no Node types). */
const nodeProcess = (globalThis as unknown as {
  process: {
    on(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
    off(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
  };
}).process;

const group: Group = {
  id: 'g1',
  name: 'Orders',
  status: 'stopped',
  throughput: '0 msg/s',
  description: '',
  threads: 1,
  outputMode: 'parallel',
  flows: [],
  expanded: false,
  enabled: true,
};

function renderItem(onUpdateGroupConfig: (groupId: string, config: unknown, name?: string) => Promise<void>) {
  mockUseApp.mockReturnValue({ state: { flowMetrics: undefined, dirtyItems: undefined } });
  return render(
    <GroupItem
      group={group}
      selection={{ type: 'none' }}
      formatTemplate={{}}
      onSelectGroup={vi.fn()}
      onSelectFlow={vi.fn()}
      onToggleGroup={vi.fn()}
      onDeleteGroup={vi.fn(async () => undefined)}
      onCreateFlow={vi.fn()}
      onUpdateGroupConfig={onUpdateGroupConfig}
      onUpdateFlowConfig={vi.fn(async () => undefined)}
      onCloneGroup={vi.fn()}
      onCloneFlow={vi.fn()}
      onDeleteFlow={vi.fn(async () => undefined)}
      latestConnectors={[]}
    />,
  );
}

describe('GroupItem', () => {
  afterEach(() => cleanup());

  it('locks the group from its menu', async () => {
    const user = userEvent.setup();
    const onUpdateGroupConfig = vi.fn(async () => undefined);
    renderItem(onUpdateGroupConfig);

    await user.click(screen.getByRole('button', { name: 'Actions for group Orders' }));
    await user.click(await screen.findByRole('menuitem', { name: /lock group/i }));

    expect(onUpdateGroupConfig).toHaveBeenCalledWith('g1', { enabled: false }, 'Orders');
  });

  it('does not leave an unhandled rejection when locking fails', async () => {
    const user = userEvent.setup();
    const unhandled = vi.fn();
    nodeProcess.on('unhandledRejection', unhandled);
    // The action reports the error and rolls back by itself, then rejects. A plain function,
    // not vi.fn(): the spy subscribes to the returned promise, which would mark it as handled
    let calls = 0;
    const onUpdateGroupConfig = () => {
      calls += 1;
      return Promise.reject(new Error('Core unreachable'));
    };
    renderItem(onUpdateGroupConfig);

    try {
      await user.click(screen.getByRole('button', { name: 'Actions for group Orders' }));
      await user.click(await screen.findByRole('menuitem', { name: /lock group/i }));
      // Let Node report rejections that nobody handled
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(calls).toBe(1);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      nodeProcess.off('unhandledRejection', unhandled);
    }
  });
});
