import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PointConfigPanel } from './PointConfigPanel';
import { PointVariableConfig } from '../../../../types';

describe('PointConfigPanel', () => {
  const defaultConfig: PointVariableConfig = {
    maxStepDistance: 10.5,
  };

  it('renders input fields with initial config values', () => {
    render(<PointConfigPanel config={defaultConfig} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/Max Step Distance/i)).toHaveValue(10.5);
  });

  it('calls onChange when step distance is modified', () => {
    const handleChange = vi.fn();
    render(<PointConfigPanel config={defaultConfig} onChange={handleChange} />);

    const stepInput = screen.getByLabelText(/Max Step Distance/i);
    fireEvent.change(stepInput, { target: { value: '5.2' } });

    expect(handleChange).toHaveBeenCalledWith({ maxStepDistance: 5.2 });
  });
});
