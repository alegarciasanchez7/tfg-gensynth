import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Selection, Variable } from '../../../../types';

const { mockUseApp, mockToast } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../context', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('sonner', () => ({
  toast: mockToast,
}));

import { RightPanel } from './RightPanel';

describe('RightPanel', () => {
  const onSelectVariable = vi.fn();
  const onInsertVariable = vi.fn();

  const selection: Selection = {
    type: 'flow',
    groupId: 'g1',
    flowId: 'f1',
  };

  const variables: Variable[] = [
    {
      id: 'v1',
      name: 'temperature',
      type: 'numeric',
      scope: 'local',
      flowId: 'f1',
      description: 'Temperatura del sensor',
      config: {
        min: 0,
        max: 100,
        step: 1,
      },
    },
  ];

  const actions = {
    createVariable: vi.fn().mockResolvedValue({
      id: 'v2',
      name: 'pressure',
      type: 'list',
      scope: 'group',
      config: { values: ['a', 'b'] },
    }),
    updateVariable: vi.fn().mockResolvedValue(undefined),
    deleteVariable: vi.fn().mockResolvedValue(undefined),
    clearVariableSelection: vi.fn(),
  };

  beforeEach(() => {
    cleanup();
    mockUseApp.mockReturnValue({ 
      state: { groups: [] },
      actions 
    });
    onSelectVariable.mockClear();
    onInsertVariable.mockClear();
    mockToast.success.mockClear();
    mockToast.error.mockClear();
    actions.createVariable.mockClear();
    actions.updateVariable.mockClear();
    actions.deleteVariable.mockClear();
    actions.clearVariableSelection.mockClear();
  });

  it('opens the create variable modal from the active scope', () => {
    render(
      <RightPanel
        variables={variables}
        selection={selection}
        onSelectVariable={onSelectVariable}
        onInsertVariable={onInsertVariable}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add variable/i }));
    fireEvent.click(screen.getByRole('button', { name: 'numeric' }));

    expect(screen.getByText('Create Variable')).toBeInTheDocument();
    expect(screen.getByText(/add a new variable for the local scope/i)).toBeInTheDocument();
  });

  it('creates a variable and selects an existing one', async () => {
    render(
      <RightPanel
        variables={variables}
        selection={selection}
        onSelectVariable={onSelectVariable}
        onInsertVariable={onInsertVariable}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add variable/i }));
    fireEvent.click(screen.getByRole('button', { name: 'numeric' }));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'pressure' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Pressure variable' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(actions.createVariable).toHaveBeenCalledWith(
      'pressure',
      'numeric',
      'local',
      expect.objectContaining({
        min: 0,
        max: 100,
        step: 1,
        description: 'Pressure variable',
      }),
      'f1',
      'g1'
    ));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Variable created'));

    fireEvent.click(screen.getByText('temperature'));
    expect(onSelectVariable).toHaveBeenCalledWith('v1');
  });

  it('confirms delete variable from the row action', async () => {
    render(
      <RightPanel
        variables={variables}
        selection={selection}
        onSelectVariable={onSelectVariable}
        onInsertVariable={onInsertVariable}
      />,
    );

    fireEvent.click(screen.getAllByTitle('Delete variable')[0]);
    expect(screen.getByText('Delete variable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(actions.deleteVariable).toHaveBeenCalledWith('v1'));
    expect(actions.clearVariableSelection).not.toHaveBeenCalled();
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Variable deleted'));
  });
});
