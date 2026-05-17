import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BooleanConfigPanel } from './BooleanConfigPanel';
import { BooleanVariableConfig } from '../../../../types';

describe('BooleanConfigPanel', () => {
  const defaultConfig: BooleanVariableConfig = {
    currentValue: true,
  };

  it('renders switch with initial config value', () => {
    render(<BooleanConfigPanel config={defaultConfig} onChange={vi.fn()} />);

    const switchElement = screen.getByRole('switch');
    expect(switchElement).toBeChecked();
  });

  it('calls onChange when switch is toggled', () => {
    const handleChange = vi.fn();
    render(<BooleanConfigPanel config={defaultConfig} onChange={handleChange} />);

    const switchElement = screen.getByRole('switch');
    fireEvent.click(switchElement);

    expect(handleChange).toHaveBeenCalledWith({ currentValue: false });
  });
});
