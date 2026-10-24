import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('writes the mask type and pattern the Core needs when switching to Mask mode', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<StringConfigPanel config={defaultConfig} onChange={handleChange} />);

    await user.click(screen.getByRole('tab', { name: 'Mask/IoT' }));

    expect(handleChange).toHaveBeenCalledWith({
      pattern: 'FORMATTED_MASK',
      formattedMaskType: 'ALPHANUMERIC',
      customMask: '????????',
    });
  });

  it('shows the pattern field for the default (unset) mask type and warns when it is empty', () => {
    render(<StringConfigPanel config={{ ...defaultConfig, pattern: 'FORMATTED_MASK' }} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/Custom Format Pattern/i)).toHaveValue('');
    expect(screen.getByRole('alert')).toHaveTextContent('An empty pattern generates empty strings');
  });

  it('fills an empty pattern when choosing a pattern-based mask type', () => {
    const handleChange = vi.fn();
    render(
      <StringConfigPanel
        config={{ ...defaultConfig, pattern: 'FORMATTED_MASK', formattedMaskType: 'IPV4' }}
        onChange={handleChange}
      />
    );
    expect(screen.queryByLabelText(/Custom Format Pattern/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Preset Format Mask'));
    fireEvent.click(screen.getByRole('button', { name: 'Custom Format Mask' }));

    expect(handleChange).toHaveBeenCalledWith({ formattedMaskType: 'CUSTOM_MASK', customMask: 'SENSOR-####-XXXX' });
  });

  it('keeps the settings a mode already has when switching to it', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<StringConfigPanel config={{ ...defaultConfig, regexPattern: '[0-9]{3}' }} onChange={handleChange} />);

    await user.click(screen.getByRole('tab', { name: 'Regex' }));

    expect(handleChange).toHaveBeenCalledWith({ pattern: 'REGEX' });
  });
});
