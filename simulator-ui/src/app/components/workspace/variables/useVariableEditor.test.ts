import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Variable } from '../../../types';

const { mockUseApp } = vi.hoisted(() => ({ mockUseApp: vi.fn() }));
vi.mock('../../../context', () => ({ useApp: () => mockUseApp() }));
vi.mock('../../../context/hooks/useVariableValidation', () => ({
  useVariableValidation: () => ({ validateConfig: () => ({}), detectCycle: () => null }),
}));

import { useVariableEditor } from './useVariableEditor';

const base: Variable = {
  id: 'v1', name: 'temp', type: 'numeric', scope: 'local', flowId: 'f1', groupId: 'g1', config: { min: 0, max: 10 },
};
const withConfig = (config: Variable['config']): Variable => ({ ...base, config });
const typed = (min: number) => JSON.stringify({ min, max: 10 }, null, 2);

describe('useVariableEditor', () => {
  const updateVariable = vi.fn();

  beforeEach(() => {
    updateVariable.mockReset();
    mockUseApp.mockReturnValue({ state: {}, actions: { updateVariable, getVariables: () => [] } });
  });

  it('sends every edit and builds quick edits on the latest draft', () => {
    const { result } = renderHook(({ variable }) => useVariableEditor(variable), { initialProps: { variable: base } });

    act(() => {
      result.current.setDraft(prev => ({ ...prev, configText: typed(1) }));
      result.current.setDraft(prev => ({ ...prev, name: `${prev.name}2` }));
    });

    expect(updateVariable).toHaveBeenCalledTimes(2);
    expect(updateVariable.mock.calls[1][1]).toMatchObject({ name: 'temp2', config: { min: 1, max: 10 } });
    expect(result.current.draft.configText).toBe(typed(1));
  });

  it('ignores late echoes of older edits so typing is not lost', () => {
    const { result, rerender } = renderHook(({ variable }) => useVariableEditor(variable), { initialProps: { variable: base } });

    act(() => result.current.setDraft(prev => ({ ...prev, configText: typed(1) })));
    act(() => result.current.setDraft(prev => ({ ...prev, configText: typed(12) })));

    // The echo of the first edit arrives after the second one was typed
    rerender({ variable: withConfig({ min: 1, max: 10 }) });
    expect(result.current.draft.configText).toBe(typed(12));

    rerender({ variable: withConfig({ max: 10, min: 12 }) });
    expect(result.current.draft.configText).toBe(typed(12));
  });

  it('follows changes made elsewhere', () => {
    const { result, rerender } = renderHook(({ variable }) => useVariableEditor(variable), { initialProps: { variable: base } });

    act(() => result.current.setDraft(prev => ({ ...prev, configText: typed(1) })));
    rerender({ variable: withConfig({ min: 5, max: 10 }) });

    expect(JSON.parse(result.current.draft.configText)).toEqual({ min: 5, max: 10 });
  });
});
