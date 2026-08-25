import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StringConfigPanel } from './StringConfigPanel';
import { StringVariableConfig } from '../../../../types';

vi.mock('../../../../context', () => ({
  useApp: () => ({ state: { variables: [] } })
}));

describe('StringConfigPanel', () => {
  const defaultConfig: StringVariableConfig = {
    fixedLength: 10,
    regexPattern: '',
    pattern: 'RANDOM_STRING'
  };

  it('renders input fields with initial config values', () => {
    render(<StringConfigPanel config={defaultConfig} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/Fixed Length/i)).toHaveValue(10);
  });

  it('calls onChange when regex pattern is modified in REGEX tab', () => {
    const handleChange = vi.fn();
    render(<StringConfigPanel config={{...defaultConfig, pattern: 'REGEX'}} onChange={handleChange} />);

    const regexInput = screen.getByLabelText(/Regex Pattern/i);
    fireEvent.change(regexInput, { target: { value: '^[A-Z]$' } });

    expect(handleChange).toHaveBeenCalledWith({ regexPattern: '^[A-Z]$' });
  });

  it('renders template input when pattern is TEMPLATE', () => {
    const handleChange = vi.fn();
    render(<StringConfigPanel config={{...defaultConfig, pattern: 'TEMPLATE', template: 'ABC-{{val}}'}} onChange={handleChange} />);

    const templateInput = screen.getByLabelText(/Dynamic Template String/i);
    expect(templateInput).toHaveValue('ABC-{{val}}');
    fireEvent.change(templateInput, { target: { value: 'DEF' } });
    expect(handleChange).toHaveBeenCalledWith({ template: 'DEF' });
  });
  
  it('toggles corruption switch correctly', () => {
    const handleChange = vi.fn();
    render(<StringConfigPanel config={{...defaultConfig, corruptionEnabled: false}} onChange={handleChange} />);

    const sw = screen.getByLabelText(/Simulate Data Corruption/i);
    fireEvent.click(sw);
    expect(handleChange).toHaveBeenCalledWith({ corruptionEnabled: true });
  });
});
