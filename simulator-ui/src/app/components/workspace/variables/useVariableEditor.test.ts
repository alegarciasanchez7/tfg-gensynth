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

  describe('names that are taken or empty', () => {
    const hum: Variable = { ...base, id: 'v1', name: 'hum' };
    const temp: Variable = { ...base, id: 'v2', name: 'temp' };
    const globalTemp: Variable = { ...base, id: 'v3', name: 'temp', scope: 'global', flowId: undefined, groupId: undefined };
    const useVariables = (variables: Variable[]) =>
      mockUseApp.mockReturnValue({ state: { variables }, actions: { updateVariable, getVariables: () => variables } });
    const sentNames = () => updateVariable.mock.calls.map(call => call[1].name);
    const render = () => renderHook(({ variable }) => useVariableEditor(variable), { initialProps: { variable: hum } });

    it('keeps a rename to a taken name local and shows the warning', () => {
      useVariables([hum, temp]);
      const { result } = render();

      act(() => result.current.setDraft(prev => ({ ...prev, name: 'temp' })));

      expect(updateVariable).not.toHaveBeenCalled();
      expect(result.current.draft.name).toBe('temp');
      expect(result.current.validationResult.errors.name).toMatch(/already exists in this flow/);
    });

    it('never sends the taken name while typing, and sends the first free one', () => {
      useVariables([hum, temp]);
      const { result } = render();

      for (const name of ['', 't', 'te', 'tem', 'temp', 'temp2']) {
        act(() => result.current.setDraft(prev => ({ ...prev, name })));
      }

      expect(sentNames()).toEqual(['t', 'te', 'tem', 'temp2']);
    });

    it('keeps saving other fields live with the last valid name', () => {
      useVariables([hum, temp]);
      const { result } = render();

      act(() => result.current.setDraft(prev => ({ ...prev, name: 'temp' })));
      act(() => result.current.setDraft(prev => ({ ...prev, configText: typed(3) })));

      expect(updateVariable).toHaveBeenCalledTimes(1);
      expect(updateVariable.mock.calls[0][1]).toMatchObject({ name: 'hum', config: { min: 3, max: 10 } });
      expect(result.current.draft.name).toBe('temp');
    });

    it('does not apply a scope change that would clash with another variable', () => {
      useVariables([hum, globalTemp, { ...hum, id: 'v4', name: 'x' }]);
      const { result } = renderHook(({ variable }) => useVariableEditor(variable), {
        initialProps: { variable: { ...hum, name: 'temp' } },
      });

      act(() => result.current.setDraft(prev => ({ ...prev, scope: 'global', flowId: undefined, groupId: undefined })));

      expect(updateVariable).not.toHaveBeenCalled();
      expect(result.current.validationResult.errors.name).toMatch(/as a global variable/);
    });

    it('requires a name', () => {
      useVariables([hum]);
      const { result } = render();

      act(() => result.current.setDraft(prev => ({ ...prev, name: '  ' })));

      expect(updateVariable).not.toHaveBeenCalled();
      expect(result.current.validationResult.errors.name).toBe('Name is required');
    });

    it('applies the kept name once the other variable frees it', () => {
      useVariables([hum, temp]);
      const { result, rerender } = render();
      act(() => result.current.setDraft(prev => ({ ...prev, name: 'temp' })));
      expect(updateVariable).not.toHaveBeenCalled();

      useVariables([hum, { ...temp, name: 'temperature' }]);
      rerender({ variable: hum });

      expect(sentNames()).toEqual(['temp']);
      expect(result.current.validationResult.errors.name).toBeUndefined();
    });
  });
});
