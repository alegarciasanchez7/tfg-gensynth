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
      },
    },
  ];

  const actions = {
    createVariable: vi.fn().mockResolvedValue({
      id: 'v2',
      name: 'pressure',
      type: 'numeric',
      scope: 'local',
      config: { min: 0, max: 100, precision: 'DOUBLE', distribution: 'UNIFORM' },
    }),
    updateVariable: vi.fn().mockResolvedValue(undefined),
    deleteVariable: vi.fn().mockResolvedValue(undefined),
    clearVariableSelection: vi.fn(),
    onSelectVariable: vi.fn(),
  };

  beforeEach(() => {
    cleanup();
    mockUseApp.mockReturnValue({ 
      state: { groups: [{ id: 'g1', name: 'Group 1', flows: [{ id: 'f1', name: 'Flow 1' }] }] },
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

  it('opens the create variable modal from the active scope', async () => {
    render(
      <RightPanel
        variables={variables}
        selection={selection}
        onSelectVariable={onSelectVariable}
        onInsertVariable={onInsertVariable}
      />,
    );

    // Open dropdown
    const addBtn = screen.getByText(/ADD/i);
    fireEvent.click(addBtn);

    // Find and click 'numeric' option
    const numericOption = await screen.findByText(/numeric/i);
    fireEvent.click(numericOption);

    // Dialog should be open
    expect(await screen.findByText(/New Variable/i)).toBeInTheDocument();
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

    // Open dropdown and select numeric
    fireEvent.click(screen.getByText(/ADD/i));
    const numericOption = await screen.findByText(/numeric/i);
    fireEvent.click(numericOption);

    // Fill form
    const nameInput = screen.getByLabelText(/Identification Name/i);
    fireEvent.change(nameInput, { target: { value: 'pressure' } });
    
    const descInput = screen.getByLabelText(/Description \(Optional\)/i);
    fireEvent.change(descInput, { target: { value: 'Pressure variable' } });
    
    // Submit
    const createBtn = screen.getByRole('button', { name: /Create Variable/i });
    fireEvent.click(createBtn);

    await waitFor(() => expect(actions.createVariable).toHaveBeenCalled());
    
    const call = actions.createVariable.mock.calls[0];
    expect(call[0]).toBe('pressure');
    expect(call[1]).toBe('numeric');
    expect(call[2]).toBe('local');
    expect(call[3]).toMatchObject({
      min: 0,
      max: 100,
      description: 'Pressure variable'
    });
    
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

    // Click delete in the list item
    const deleteBtn = screen.getAllByTitle(/Delete variable/i)[0];
    fireEvent.click(deleteBtn);
    
    expect(await screen.findByText(/Delete variable/i)).toBeInTheDocument();

    // Confirm deletion
    const confirmBtn = screen.getByRole('button', { name: /Delete/i });
    fireEvent.click(confirmBtn);
    
    await waitFor(() => expect(actions.deleteVariable).toHaveBeenCalledWith('v1'));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Variable deleted'));
  });
});
