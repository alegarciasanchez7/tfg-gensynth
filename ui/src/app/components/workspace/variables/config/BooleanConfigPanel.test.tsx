import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BooleanConfigPanel } from './BooleanConfigPanel';
import { BooleanVariableConfig } from '../../../../types';
import { TooltipProvider } from '../../../ui/tooltip';

describe('BooleanConfigPanel', () => {
  const defaultConfig: BooleanVariableConfig = {
    pattern: 'CONSTANT_BOOLEAN',
    currentValue: true,
  };

  const renderComponent = (config: BooleanVariableConfig = defaultConfig, onChange = vi.fn()) => {
    return render(
      <TooltipProvider>
        <BooleanConfigPanel config={config} onChange={onChange} />
      </TooltipProvider>
    );
  };

  it('renders switch with initial config value', () => {
    renderComponent();

    const switchElement = screen.getByRole('switch');
    expect(switchElement).toBeChecked();
  });

  it('calls onChange when switch is toggled', () => {
    const handleChange = vi.fn();
    renderComponent(defaultConfig, handleChange);

    const switchElement = screen.getByRole('switch');
    fireEvent.click(switchElement);

    expect(handleChange).toHaveBeenCalledWith({ currentValue: false });
  });

  it('renders probability inputs when pattern is PROBABILITY', () => {
    const probConfig: BooleanVariableConfig = {
      pattern: 'PROBABILITY',
      trueProbability: 0.7,
    };
    renderComponent(probConfig);

    const probInput = screen.getByLabelText(/Probability P\(true\)/i);
    expect(probInput).toBeInTheDocument();
    expect(probInput).toHaveValue(0.7);
  });

  it('renders burst mode inputs when pattern is BURST_MODE', () => {
    const burstConfig: BooleanVariableConfig = {
      pattern: 'BURST_MODE',
      burstDurationTicks: 5,
      burstIdleTicks: 3,
    };
    renderComponent(burstConfig);

    expect(screen.getByLabelText(/Burst Active/i)).toHaveValue(5);
    expect(screen.getByLabelText(/Burst Idle/i)).toHaveValue(3);
  });

  it('renders markov inputs when pattern is MARKOV', () => {
    const markovConfig: BooleanVariableConfig = {
      pattern: 'MARKOV',
      pTrueToTrue: 0.85,
      pFalseToTrue: 0.15,
    };
    renderComponent(markovConfig);

    expect(screen.getByLabelText(/P\(TRUE → TRUE\)/i)).toHaveValue(0.85);
    expect(screen.getByLabelText(/P\(FALSE → TRUE\)/i)).toHaveValue(0.15);
  });
});
