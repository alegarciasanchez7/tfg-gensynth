import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TickSettings } from '../../../../types';

const { mockUseApp } = vi.hoisted(() => ({ mockUseApp: vi.fn() }));

vi.mock('../../../../context', () => ({
  useApp: () => mockUseApp(),
}));

import { TickSettingsSection } from './TickSettingsSection';

const updateTickSettings = vi.fn();

function renderWith(tick: TickSettings, extraState: Record<string, unknown> = {}) {
  mockUseApp.mockReturnValue({
    state: { settings: { tick }, systemStatus: 'stopped', metrics: null, ...extraState },
    actions: { updateTickSettings },
  });
  return render(<TickSettingsSection />);
}

const oneSecond: TickSettings = { mode: 'FIXED_RATE', value: 1, unit: 'SECONDS' };

describe('TickSettingsSection', () => {
  beforeEach(() => {
    updateTickSettings.mockReset();
    updateTickSettings.mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it('shows the current fixed period', () => {
    renderWith({ mode: 'FIXED_RATE', value: 500, unit: 'MILLISECONDS' });

    expect(screen.getByLabelText('Tick period value')).toHaveValue(500);
    expect(screen.getByLabelText('Tick period unit')).toHaveValue('MILLISECONDS');
    expect(screen.getByTestId('tick-summary')).toHaveTextContent('Every 500 ms');
    expect(screen.getByRole('radio', { name: 'Fixed period' })).toHaveAttribute('aria-checked', 'true');
  });

  it('commits a new period value on blur', async () => {
    renderWith(oneSecond);

    const input = screen.getByLabelText('Tick period value');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);

    await waitFor(() => expect(updateTickSettings).toHaveBeenCalledWith({ mode: 'FIXED_RATE', value: 5, unit: 'SECONDS' }));
  });

  it('commits the unit together with the drafted value', async () => {
    renderWith(oneSecond);

    fireEvent.change(screen.getByLabelText('Tick period value'), { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText('Tick period unit'), { target: { value: 'MILLISECONDS' } });

    await waitFor(() => expect(updateTickSettings).toHaveBeenCalledWith({ mode: 'FIXED_RATE', value: 250, unit: 'MILLISECONDS' }));
  });

  it('shows a validation error and does not send invalid values', () => {
    renderWith(oneSecond);

    const input = screen.getByLabelText('Tick period value');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('alert')).toHaveTextContent('at least 1');
    expect(updateTickSettings).not.toHaveBeenCalled();
  });

  it('does not send a request when nothing changed', () => {
    renderWith(oneSecond);

    fireEvent.blur(screen.getByLabelText('Tick period value'));

    expect(updateTickSettings).not.toHaveBeenCalled();
  });

  it('switches to As Fast As You Can keeping the period', async () => {
    renderWith(oneSecond);

    fireEvent.click(screen.getByRole('radio', { name: 'As Fast As You Can' }));

    await waitFor(() => expect(updateTickSettings).toHaveBeenCalledWith({ mode: 'AS_FAST_AS_POSSIBLE', value: 1, unit: 'SECONDS' }));
  });

  it('hides the period inputs and warns about CPU usage in As Fast As You Can mode', () => {
    renderWith({ mode: 'AS_FAST_AS_POSSIBLE', value: 1, unit: 'SECONDS' });

    expect(screen.queryByLabelText('Tick period value')).not.toBeInTheDocument();
    expect(screen.getByText(/keep a CPU core busy/)).toBeInTheDocument();
    expect(screen.getByTestId('tick-summary')).toHaveTextContent('As Fast As You Can');
  });

  it('shows the measured tick rate while running', () => {
    renderWith(oneSecond, { systemStatus: 'running', metrics: { ticksPerSecond: 1.02 } });
    expect(screen.getByText('Measured: 1.02 ticks/s')).toBeInTheDocument();
  });
});
