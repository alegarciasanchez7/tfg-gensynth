import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Variable } from '../../../types';

const { mockUseApp, mockToast } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
  },
}));

vi.mock('../../../context', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('sonner', () => ({
  toast: mockToast,
}));

import { VariableEditorWorkspace } from './VariableEditorWorkspace';

describe('VariableEditorWorkspace', () => {
  const onBack = vi.fn();

  const variable: Variable = {
    id: 'v1',
    name: 'temperature',
    type: 'numeric',
    scope: 'local',
    description: 'Temperatura del sensor',
    config: {
      min: 0,
      max: 100,
      step: 1,
    },
  };

  const actions = {
    updateVariable: vi.fn().mockResolvedValue(undefined),
    deleteVariable: vi.fn().mockResolvedValue(undefined),
    discardItemChanges: vi.fn(),
    clearVariableSelection: vi.fn(),
    getVariables: vi.fn().mockReturnValue([]),
  };

  beforeEach(() => {
    cleanup();
    mockUseApp.mockReturnValue({ 
      state: { groups: [], dirtyItems: { groupIds: new Set(), flowIds: new Set(), variableIds: new Set(['v1']) } },
      actions 
    });
    onBack.mockClear();
    actions.updateVariable.mockClear();
    actions.deleteVariable.mockClear();
    actions.discardItemChanges.mockClear();
    actions.clearVariableSelection.mockClear();
    actions.getVariables.mockClear();
    mockToast.success.mockClear();
    mockToast.error.mockClear();
    mockToast.info.mockClear();
    mockToast.message.mockClear();
  });

  it('automatically updates the selected variable when fields change', async () => {
    const user = userEvent.setup();
    render(<VariableEditorWorkspace variable={variable} onBack={onBack} />);

    const nameInput = screen.getByTestId('variable-name-input');
    await user.clear(nameInput);
    await user.type(nameInput, 'temperature_2');

    await waitFor(() => expect(actions.updateVariable).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({
        name: 'temperature_2',
      }),
    ));
  });

  it('triggers discardItemChanges when Discard button is clicked', () => {
    render(<VariableEditorWorkspace variable={variable} onBack={onBack} />);

    const discardBtn = screen.getByRole('button', { name: /discard/i });
    fireEvent.click(discardBtn);

    expect(actions.discardItemChanges).toHaveBeenCalledWith('variable', 'v1');
  });

  it('deletes the selected variable and clears the selection', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<VariableEditorWorkspace variable={variable} onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: /delete variable/i }));

    await waitFor(() => expect(actions.deleteVariable).toHaveBeenCalledWith('v1'));
    await waitFor(() => expect(actions.clearVariableSelection).toHaveBeenCalled());
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Variable deleted'));
  });
});
