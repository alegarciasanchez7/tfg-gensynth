import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Variable } from '../../types';

const { mockUseApp, mockToast } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

vi.mock('../../context', () => ({
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
    clearVariableSelection: vi.fn(),
  };

  beforeEach(() => {
    cleanup();
    mockUseApp.mockReturnValue({ actions });
    onBack.mockClear();
    actions.updateVariable.mockClear();
    actions.deleteVariable.mockClear();
    actions.clearVariableSelection.mockClear();
    mockToast.success.mockClear();
    mockToast.error.mockClear();
    mockToast.message.mockClear();
  });

  it('saves changes to the selected variable', async () => {
    render(<VariableEditorWorkspace variable={variable} onBack={onBack} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'temperature_2' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Updated description' } });
    fireEvent.change(screen.getByLabelText('Config JSON'), {
      target: { value: JSON.stringify({ min: 10, max: 120, step: 5 }, null, 2) },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(actions.updateVariable).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({
        name: 'temperature_2',
        scope: 'local',
        type: 'numeric',
        description: 'Updated description',
        config: expect.objectContaining({ min: 10, max: 120, step: 5 }),
      }),
    ));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Variable updated'));
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
