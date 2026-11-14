import { useEffect, useState } from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Variable } from '../types';
import { AppProvider } from './AppContext';
import { useApp, useGroups, useLogs, useSystemStatus, useVariables } from './useApp';
import type { AppContextValue } from './appContextValue';

const speed: Variable = { id: 'v1', name: 'speed', type: 'numeric', scope: 'global', config: {} };

/** Captures the context value of every render. */
function Probe({ onRender }: Readonly<{ onRender: (value: AppContextValue) => void }>) {
  const value = useApp();
  onRender(value);
  return null;
}

/** Reads the variables through the actions in a passive effect, right after they change. */
function EffectReader({ onRead }: Readonly<{ onRead: (names: string[]) => void }>) {
  const { state, actions } = useApp();
  useEffect(() => {
    onRead(actions.getVariables().map(v => v.name));
  }, [state.variables, actions, onRead]);
  return null;
}

describe('AppProvider', () => {
  it('lets a child effect read the newest state through the actions (stateRef is fresh)', () => {
    const reads: string[][] = [];
    let ctx: AppContextValue | undefined;
    render(
      <AppProvider useMockData>
        <Probe onRender={value => { ctx = value; }} />
        <EffectReader onRead={names => reads.push(names)} />
      </AppProvider>,
    );

    act(() => ctx!.dispatch({ type: 'SET_VARIABLES', payload: [speed] }));

    // The effect of the render that shows the new variables already reads them
    expect(reads[reads.length - 1]).toEqual(['speed']);
  });

  it('keeps the actions object when an unrelated part of the state changes', () => {
    const values: AppContextValue[] = [];
    render(
      <AppProvider useMockData>
        <Probe onRender={value => values.push(value)} />
      </AppProvider>,
    );
    const before = values[values.length - 1];

    act(() => before.actions.clearLogs());
    act(() => before.dispatch({
      type: 'ADD_LOG',
      payload: { id: 'l1', timestamp: '00:00:00', level: 'info', source: 'TEST', message: 'hello' },
    }));

    const after = values[values.length - 1];
    expect(after.state).not.toBe(before.state);
    expect(after.actions).toBe(before.actions);
    expect(after.actions.createGroup).toBe(before.actions.createGroup);
  });

  it('runs the stable template actions through the registered editor', () => {
    let ctx: AppContextValue | undefined;
    const inserted: string[] = [];
    render(
      <AppProvider useMockData>
        <Probe onRender={value => { ctx = value; }} />
      </AppProvider>,
    );

    act(() => ctx!.actions.registerTemplateEditor((name, scope) => inserted.push(`${scope ?? ''}:${name}`)));
    act(() => ctx!.actions.insertVariable('speed', 'global'));
    act(() => ctx!.actions.registerTemplateEditor(null));
    act(() => ctx!.actions.insertVariable('ignored'));

    expect(inserted).toEqual(['global:speed']);
  });

  it('runs the selection and template actions', () => {
    let ctx: AppContextValue | undefined;
    render(
      <AppProvider useMockData>
        <Probe onRender={value => { ctx = value; }} />
      </AppProvider>,
    );

    act(() => ctx!.actions.selectGroup('g1'));
    expect(ctx!.state.selection).toMatchObject({ type: 'group', groupId: 'g1' });
    act(() => ctx!.actions.selectFlow('g1', 'f1'));
    expect(ctx!.state.selection).toMatchObject({ type: 'flow', groupId: 'g1', flowId: 'f1' });
    act(() => ctx!.actions.clearSelection());
    expect(ctx!.state.selection.type).toBe('none');

    act(() => ctx!.actions.setFormatTemplate('f1', '{"a":1}'));
    expect(ctx!.state.formatTemplates.f1).toBe('{"a":1}');
  });
});

describe('useApp hooks', () => {
  it('throws outside the provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useApp())).toThrow(/AppProvider/);
    consoleError.mockRestore();
  });

  it('read slices of the state', () => {
    function Slices() {
      const status = useSystemStatus();
      const groups = useGroups();
      const variables = useVariables();
      const { logs } = useLogs();
      const [count] = useState(groups.length + variables.length + logs.length);
      return <span>{`${status}:${count}`}</span>;
    }
    render(
      <AppProvider useMockData>
        <Slices />
      </AppProvider>,
    );
    expect(screen.getByText(/^stopped:/)).toBeInTheDocument();
  });
});
