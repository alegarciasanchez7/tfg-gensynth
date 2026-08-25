import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ListConfigPanel } from './ListConfigPanel';
import { ListVariableConfig } from '../../../../types';

describe('ListConfigPanel', () => {
  const defaultConfig: ListVariableConfig = {
    selectionStrategy: 'WEIGHTED_RANDOM',
    items: [
      { id: 'item1', value: 'Item A', weight: 1.0 },
      { id: 'item2', value: 'Item B', weight: 2.5 }
    ]
  };

  it('renders input fields with initial config values', () => {
    render(<ListConfigPanel config={defaultConfig} onChange={vi.fn()} />);

    const valueInputs = screen.getAllByPlaceholderText(/Value \(Literal\)/i);
    expect(valueInputs).toHaveLength(2);
    expect(valueInputs[0]).toHaveValue('Item A');
    expect(valueInputs[1]).toHaveValue('Item B');

    const weightInputs = screen.getAllByPlaceholderText(/Weight/i);
    expect(weightInputs).toHaveLength(2);
    expect(weightInputs[0]).toHaveValue(1);
    expect(weightInputs[1]).toHaveValue(2.5);
  });

  it('calls onChange when selection strategy is changed', () => {
    const handleChange = vi.fn();
    render(<ListConfigPanel config={defaultConfig} onChange={handleChange} />);

    // Open dropdown
    const dropdownBtn = document.getElementById('selection-strategy-select')!;
    fireEvent.click(dropdownBtn);

    // Click Markov Chain option
    const markovOpt = screen.getByRole('button', { name: /Markov Chain/i });
    fireEvent.click(markovOpt);

    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({
      selectionStrategy: 'MARKOV_CHAIN'
    }));
  });

  it('calls onChange when Add Item is clicked', () => {
    const handleChange = vi.fn();
    render(<ListConfigPanel config={defaultConfig} onChange={handleChange} />);

    const addButton = screen.getByRole('button', { name: /Add Item/i });
    fireEvent.click(addButton);

    expect(handleChange).toHaveBeenCalled();
  });

  it('displays Markov Chain matrix editor when MARKOV_CHAIN strategy is selected', () => {
    const markovConfig: ListVariableConfig = {
      selectionStrategy: 'MARKOV_CHAIN',
      items: [
        { id: 'item1', value: 'State A' },
        { id: 'item2', value: 'State B' }
      ]
    };

    render(<ListConfigPanel config={markovConfig} onChange={vi.fn()} />);

    expect(screen.getByText(/Markov Transition Probability Matrix/i)).toBeInTheDocument();
  });
});
