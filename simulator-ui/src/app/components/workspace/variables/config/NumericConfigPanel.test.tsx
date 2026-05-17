import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NumericConfigPanel } from './NumericConfigPanel';
import { NumericVariableConfig } from '../../../../types';

afterEach(cleanup);

describe('NumericConfigPanel', () => {
  const defaultConfig: NumericVariableConfig = {
    min: 10,
    max: 50,
    precision: 'INTEGER',
    distribution: 'UNIFORM',
    formula: '',
  };

  it('renders input fields with initial config values', () => {
    render(<NumericConfigPanel config={defaultConfig} onChange={vi.fn()} />);

    expect(screen.getByTestId('numeric-min-input')).toHaveValue(10);
    expect(screen.getByTestId('numeric-max-input')).toHaveValue(50);
    expect(screen.getByTestId('numeric-formula-input')).toHaveValue('');
  });

  it('calls onChange when formula is modified', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<NumericConfigPanel config={defaultConfig} onChange={handleChange} />);

    const formulaInput = screen.getByTestId('numeric-formula-input');
    await user.type(formulaInput, 'test');

    expect(handleChange).toHaveBeenCalled();
  });

  it('calls onChange when min value is modified', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<NumericConfigPanel config={defaultConfig} onChange={handleChange} />);

    const minInput = screen.getByTestId('numeric-min-input');
    await user.clear(minInput);
    await user.type(minInput, '20');

    expect(handleChange).toHaveBeenCalled();
  });
});
