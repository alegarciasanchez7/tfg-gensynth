import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TemporalConfigPanel } from './TemporalConfigPanel';
import { TemporalVariableConfig } from '../../../../types';

describe('TemporalConfigPanel', () => {
  const defaultConfig: TemporalVariableConfig = {
    dateFormat: 'yyyy-MM-dd',
    timeZone: 'UTC',
    temporalType: 'DATE'
  };

  it('renders input fields with initial config values', () => {
    render(<TemporalConfigPanel config={defaultConfig} onChange={vi.fn()} />);

    // Check for Output Category label
    expect(screen.getByText(/Output Category/i)).toBeInTheDocument();
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
});
