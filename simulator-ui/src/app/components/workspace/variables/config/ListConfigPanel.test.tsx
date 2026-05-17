import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ListConfigPanel } from './ListConfigPanel';
import { ListVariableConfig } from '../../../../types';

describe('ListConfigPanel', () => {
  const defaultConfig: ListVariableConfig = {
    items: [
      { value: 'Item A', weight: 1.0 },
      { value: 'Item B', weight: 2.5 }
    ]
  };

  it('renders input fields with initial config values', () => {
    render(<ListConfigPanel config={defaultConfig} onChange={vi.fn()} />);

    const valueInputs = screen.getAllByPlaceholderText(/Value/i);
    expect(valueInputs).toHaveLength(2);
    expect(valueInputs[0]).toHaveValue('Item A');
    expect(valueInputs[1]).toHaveValue('Item B');

    const weightInputs = screen.getAllByPlaceholderText(/Weight/i);
    expect(weightInputs).toHaveLength(2);
    expect(weightInputs[0]).toHaveValue(1);
    expect(weightInputs[1]).toHaveValue(2.5);
  });

  it('calls onChange when Add Item is clicked', () => {
    const handleChange = vi.fn();
    render(<ListConfigPanel config={defaultConfig} onChange={handleChange} />);

    const addButton = screen.getByText(/Add Item/i);
    fireEvent.click(addButton);

    expect(handleChange).toHaveBeenCalledWith({
      items: [
        { value: 'Item A', weight: 1.0 },
        { value: 'Item B', weight: 2.5 },
        { value: '', weight: 1.0 }
      ]
    });
  });

  it('calls onChange when value is modified', () => {
    const handleChange = vi.fn();
    render(<ListConfigPanel config={defaultConfig} onChange={handleChange} />);

    const valueInputs = screen.getAllByPlaceholderText(/Value/i);
    fireEvent.change(valueInputs[0], { target: { value: 'Item C' } });

    expect(handleChange).toHaveBeenCalledWith({
      items: [
        { value: 'Item C', weight: 1.0 },
        { value: 'Item B', weight: 2.5 }
      ]
    });
  });
});
