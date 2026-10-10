import { useState } from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { NumericVariableConfig } from '../../../../types';

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock('../../../../context', () => ({
  useApp: () => mockUseApp(),
}));

import { NumericConfigPanel } from './NumericConfigPanel';

afterEach(cleanup);

describe('NumericConfigPanel', () => {
  const defaultConfig: NumericVariableConfig = {
    min: 10,
    max: 50,
    precision: 'INTEGER',
    distribution: 'UNIFORM',
    pattern: 'FORMULA',
    formula: '',
  };

  const mockVariables = [
    { id: 'v_global', name: 'globalVar', scope: 'global', type: 'numeric' },
    { id: 'v_group', name: 'groupVar', scope: 'group', groupId: 'g1', type: 'numeric' },
    { id: 'v_local', name: 'localVar', scope: 'local', flowId: 'f1', type: 'numeric' },
    { id: 'v_other_local', name: 'otherLocal', scope: 'local', flowId: 'f2', type: 'numeric' },
  ];

  beforeEach(() => {
    mockUseApp.mockReturnValue({
      state: {
        variables: mockVariables,
      },
    });
  });

  it('renders input fields with initial config values', () => {
    render(<NumericConfigPanel config={defaultConfig} onChange={vi.fn()} />);

    expect(screen.getByTestId('numeric-min-input')).toHaveValue('10');
    expect(screen.getByTestId('numeric-max-input')).toHaveValue('50');
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

  it('renders padding format input when precision is INTEGER', () => {
    render(<NumericConfigPanel config={{ ...defaultConfig, precision: 'INTEGER', integerFormat: '001' }} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('e.g. 001')).toBeInTheDocument();
  });

  it('renders decimal places input when precision is DOUBLE', () => {
    render(<NumericConfigPanel config={{ ...defaultConfig, precision: 'DOUBLE', decimalPlaces: 4 }} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Decimal Places/i)).toBeInTheDocument();
  });

  it('renders step size input when pattern is RANDOM', () => {
    render(<NumericConfigPanel config={{ ...defaultConfig, pattern: 'RANDOM', step: 2.5 }} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Step size difference/i)).toBeInTheDocument();
  });

  it('renders constant configuration inputs when pattern is CONSTANT', () => {
    render(<NumericConfigPanel config={{ ...defaultConfig, pattern: 'CONSTANT', constantValue: 20, constantMargin: 2 }} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Constant Value/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Oscillation Margin/i)).toBeInTheDocument();
  });

  it('triggers autocomplete when typing {{ in the formula field', async () => {
    const TestWrapper = () => {
      const [cfg, setCfg] = useState<NumericVariableConfig>(defaultConfig);
      return (
        <NumericConfigPanel
          config={cfg}
          onChange={(newCfg) => setCfg(prev => ({ ...prev, ...newCfg }))}
          flowId="f1"
          groupId="g1"
        />
      );
    };

    render(<TestWrapper />);

    const formulaInput = screen.getByTestId('numeric-formula-input');

    // Set value and trigger keydown for {
    fireEvent.change(formulaInput, { target: { value: '{{', selectionStart: 2 } });
    fireEvent.keyDown(formulaInput, { key: '{' });

    // Should show global, group, and f1 local variables
    expect(await screen.findByText('{{globalVar}}')).toBeInTheDocument();
    expect(await screen.findByText('{{groupVar}}')).toBeInTheDocument();
    expect(await screen.findByText('{{localVar}}')).toBeInTheDocument();
    
    // Should NOT show f2 local variable (otherLocal)
    expect(screen.queryByText('{{otherLocal}}')).not.toBeInTheDocument();
  });

  it('selects and inserts a variable from the autocomplete list on click', async () => {
    const handleChange = vi.fn();
    const TestWrapper = () => {
      const [cfg, setCfg] = useState<NumericVariableConfig>(defaultConfig);
      return (
        <NumericConfigPanel 
          config={cfg} 
          onChange={(newCfg) => {
            setCfg(prev => ({ ...prev, ...newCfg }));
            handleChange(newCfg);
          }} 
          flowId="f1" 
          groupId="g1" 
        />
      );
    };

    render(<TestWrapper />);

    const formulaInput = screen.getByTestId('numeric-formula-input');
    
    // Set value and trigger keydown for {
    fireEvent.change(formulaInput, { target: { value: '{{', selectionStart: 2 } });
    fireEvent.keyDown(formulaInput, { key: '{' });

    const option = await screen.findByText('{{localVar}}');
    fireEvent.mouseDown(option);

    expect(handleChange).toHaveBeenCalledWith({ formula: '{{localVar}}' });
  });

  it('renders variable validation badges with correct status icons depending on validity', () => {
    render(
      <NumericConfigPanel
        config={{ ...defaultConfig, formula: '{{globalVar}} * 2 + {{invalidVar}}' }}
        onChange={vi.fn()}
        flowId="f1"
        groupId="g1"
      />
    );

    // Should display green badge with check mark for valid globalVar
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('globalVar')).toBeInTheDocument();

    // Should display red badge with cross mark for invalidVar
    expect(screen.getByText('✗')).toBeInTheDocument();
    expect(screen.getByText('invalidVar')).toBeInTheDocument();
  });

  it('includes mathematical constants e and pi in autocomplete options and excludes them from variable badges', async () => {
    render(
      <NumericConfigPanel
        config={{ ...defaultConfig, formula: '{{pi}} * e + {{globalVar}}' }}
        onChange={vi.fn()}
        flowId="f1"
        groupId="g1"
      />
    );

    // pi and e are constants, so only globalVar should have a validation badge inside the badges container
    const badgeContainer = screen.getByTestId('formula-badges');
    expect(within(badgeContainer).getByText('globalVar')).toBeInTheDocument();
    expect(within(badgeContainer).queryByText('pi')).not.toBeInTheDocument();
    expect(within(badgeContainer).queryByText('e')).not.toBeInTheDocument();
  });

  it('renders Sinusoidal inputs when pattern is SINUSOIDAL', () => {
    render(<NumericConfigPanel config={{ ...defaultConfig, pattern: 'SINUSOIDAL', sineFrequency: 2.0 }} onChange={vi.fn()} />);
    expect(screen.getByText(/Sinusoidal \/ Periodic Wave/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Frequency \(Hz\)/i)).toBeInTheDocument();
  });

  it('renders Drift inputs when pattern is DRIFT', () => {
    render(<NumericConfigPanel config={{ ...defaultConfig, pattern: 'DRIFT', driftRate: 0.5 }} onChange={vi.fn()} />);
    expect(screen.getAllByText(/Linear Drift/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Drift Rate \(units\/s\)/i)).toBeInTheDocument();
  });

  it('toggles noise modifier layer when noise button is clicked', async () => {
    const handleChange = vi.fn();
    render(<NumericConfigPanel config={{ ...defaultConfig, noiseEnabled: false }} onChange={handleChange} />);
    
    expect(screen.getByText(/Noise Injection \(Jitter \/ Gaussian\)/i)).toBeInTheDocument();
    const noiseButton = screen.getAllByRole('button', { name: /Disabled/i })[0];
    fireEvent.click(noiseButton);
    expect(handleChange).toHaveBeenCalledWith({ noiseEnabled: true });
  });

  it('toggles spike anomaly modifier layer when spike button is clicked', async () => {
    const handleChange = vi.fn();
    render(<NumericConfigPanel config={{ ...defaultConfig, spikeEnabled: false }} onChange={handleChange} />);
    
    expect(screen.getByText(/Anomaly Injection \/ Spikes/i)).toBeInTheDocument();
    const spikeButton = screen.getAllByRole('button', { name: /Disabled/i })[1] || screen.getAllByRole('button', { name: /Disabled/i })[0];
    fireEvent.click(spikeButton);
    expect(handleChange).toHaveBeenCalledWith({ spikeEnabled: true });
  });
});
