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
    render(<ConditionalRulesTab rules={defaultRules} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue('temp')).toBeInTheDocument();
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();
  });

  it('calls onChange when Add Rule is clicked', () => {
    const handleChange = vi.fn();
    render(<ConditionalRulesTab rules={defaultRules} onChange={handleChange} />);

    const addButton = screen.getByText(/Add Rule/i);
    fireEvent.click(addButton);

    expect(handleChange).toHaveBeenCalledWith([
      ...defaultRules,
      { targetVariable: '', operator: 'EQUALS', value: '', overrides: {} }
    ]);
  });
});
