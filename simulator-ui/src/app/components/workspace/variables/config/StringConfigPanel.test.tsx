import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StringConfigPanel } from './StringConfigPanel';
import { StringVariableConfig } from '../../../../types';

describe('StringConfigPanel', () => {
  const defaultConfig: StringVariableConfig = {
    fixedLength: 10,
    regexPattern: '',
  };

  it('renders input fields with initial config values', () => {
    render(<StringConfigPanel config={defaultConfig} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/Fixed Length/i)).toHaveValue(10);
    expect(screen.getByLabelText(/Regex Pattern/i)).toHaveValue('');
  });

  it('calls onChange when regex pattern is modified', () => {
    const handleChange = vi.fn();
    render(<StringConfigPanel config={defaultConfig} onChange={handleChange} />);

    const regexInput = screen.getByLabelText(/Regex Pattern/i);
    fireEvent.change(regexInput, { target: { value: '^[A-Z]$' } });

    expect(handleChange).toHaveBeenCalledWith({ regexPattern: '^[A-Z]$' });
  });
});
