import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConditionalRulesTab } from './ConditionalRulesTab';
import { ConditionalRule } from '../../../../types';

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock('../../../../context', () => ({
  useApp: () => mockUseApp(),
}));

describe('ConditionalRulesTab', () => {
  beforeEach(() => {
    mockUseApp.mockReturnValue({
      state: {
        groups: [],
        variables: []
      }
    });
  });
  const defaultRules: ConditionalRule[] = [
    { targetVariable: 'temp', operator: 'GREATER_THAN', value: '30', overrides: { max: 100 } }
  ];

  it('renders rules list', () => {
    render(<ConditionalRulesTab rules={defaultRules} onChange={vi.fn()} variableType="numeric" />);

    expect(screen.getByDisplayValue('temp')).toBeInTheDocument();
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();
  });

  it('calls onChange when Add Rule is clicked', () => {
    const handleChange = vi.fn();
    render(<ConditionalRulesTab rules={defaultRules} onChange={handleChange} variableType="numeric" />);

    const addButton = screen.getByText(/Add Rule/i);
    fireEvent.click(addButton);

    expect(handleChange).toHaveBeenCalledWith([
      ...defaultRules,
      { targetVariable: '', operator: 'EQUALS', value: '', overrides: {} }
    ]);
  });

  it('stores the default generator when an override is edited', () => {
    const handleChange = vi.fn();
    render(<ConditionalRulesTab rules={defaultRules} onChange={handleChange} variableType="numeric" />);

    fireEvent.change(screen.getByTestId('numeric-min-input'), { target: { value: '40' } });

    expect(handleChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ overrides: { pattern: 'RANDOM', max: 100, min: 40 } }),
    ]);
  });
  it('stores an OFF Initial State with a Boolean override, as its editor shows', () => {
    const handleChange = vi.fn();
    const rules: ConditionalRule[] = [{ targetVariable: 'temp', operator: 'GREATER_THAN', value: '30', overrides: {} }];
    render(<ConditionalRulesTab rules={rules} onChange={handleChange} variableType="boolean" />);

    expect(screen.getByRole('switch')).not.toBeChecked();
    fireEvent.click(document.getElementById('boolean-pattern-select')!);
    fireEvent.click(screen.getByRole('button', { name: /Flip Interval/ }));

    expect(handleChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ overrides: { pattern: 'FLIP_INTERVAL', currentValue: false } }),
    ]);
  });
});
