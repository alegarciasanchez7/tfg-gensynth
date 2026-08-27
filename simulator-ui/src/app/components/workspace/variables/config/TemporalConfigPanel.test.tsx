import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TemporalConfigPanel } from './TemporalConfigPanel';
import { TemporalVariableConfig } from '../../../../types';

describe('TemporalConfigPanel', () => {
  const defaultConfig: TemporalVariableConfig = {
    dateFormat: 'yyyy-MM-dd',
    timeZone: 'UTC',
    temporalType: 'DATE',
    timeAdvanceMode: 'WALL_CLOCK',
    clockDriftEnabled: false
  };

  it('renders input fields with initial config values', () => {
    render(<TemporalConfigPanel config={defaultConfig} onChange={vi.fn()} />);

    expect(screen.getByText(/Time Advance Mode/i)).toBeInTheDocument();
    expect(screen.getByText(/Clock Drift \/ Skew \(NTP Jitter\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Output Category & Formatting/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Custom Format/i)).toHaveValue('yyyy-MM-dd');
    expect(screen.getByLabelText(/Time Zone/i)).toHaveValue('UTC');
  });

  it('calls onChange when format is modified', () => {
    const handleChange = vi.fn();
    render(<TemporalConfigPanel config={defaultConfig} onChange={handleChange} />);

    const formatInput = screen.getByLabelText(/Custom Format/i);
    fireEvent.change(formatInput, { target: { value: 'dd/MM/yyyy' } });

    expect(handleChange).toHaveBeenCalledWith({ dateFormat: 'dd/MM/yyyy' });
  });

  it('calls onChange when timezone is modified', () => {
    const handleChange = vi.fn();
    render(<TemporalConfigPanel config={defaultConfig} onChange={handleChange} />);

    const tzInput = screen.getByLabelText(/Time Zone/i);
    fireEvent.change(tzInput, { target: { value: 'Europe/Madrid' } });

    expect(handleChange).toHaveBeenCalledWith({ timeZone: 'Europe/Madrid' });
  });

  it('renders simulated step inputs when simulated step mode is active', () => {
    const stepConfig: TemporalVariableConfig = {
      ...defaultConfig,
      timeAdvanceMode: 'SIMULATED_STEP',
      startDate: '2026-01-01T00:00:00Z',
      incrementMs: 5000
    };

    render(<TemporalConfigPanel config={stepConfig} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/Start Date \(ISO\)/i)).toHaveValue('2026-01-01T00:00:00Z');
    expect(screen.getByLabelText(/Step Duration \(ms\)/i)).toHaveValue(5000);
  });

  it('renders clock drift controls when clock drift is enabled', () => {
    const driftConfig: TemporalVariableConfig = {
      ...defaultConfig,
      clockDriftEnabled: true,
      maxDriftMs: 2500,
      driftType: 'RANDOM_JITTER'
    };

    render(<TemporalConfigPanel config={driftConfig} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/Max Jitter Bound \(ms\)/i)).toHaveValue(2500);
  });

  it('calls onChange when clock drift toggle is toggled', () => {
    const handleChange = vi.fn();
    render(<TemporalConfigPanel config={defaultConfig} onChange={handleChange} />);

    const switchToggle = screen.getByRole('switch', { name: /Clock Drift/i });
    fireEvent.click(switchToggle);

    expect(handleChange).toHaveBeenCalledWith({ clockDriftEnabled: true });
  });
});
