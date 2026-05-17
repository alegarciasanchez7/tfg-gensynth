import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SequentialGraphEditor } from './SequentialGraphEditor';

describe('SequentialGraphEditor', () => {
  const mockOnChange = vi.fn();
  const defaultPoints = [
    { x: 0, y: 10 },
    { x: 1, y: 20 },
  ];

  it('renders sequence editor label and correct point counts', () => {
    render(
      <SequentialGraphEditor
        min={0}
        max={100}
        points={defaultPoints}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText(/Sequence Editor/i)).toBeInTheDocument();
    expect(screen.getByText(/2 points/i)).toBeInTheDocument();
  });

  it('contains grid label and numbers', () => {
    render(
      <SequentialGraphEditor
        min={0}
        max={100}
        points={defaultPoints}
        onChange={mockOnChange}
      />
    );

    // Grid labels should display scaled Y values
    expect(screen.getByText('100.0')).toBeInTheDocument();
    expect(screen.getByText('0.0')).toBeInTheDocument();
  });

  it('triggers preset generation when preset buttons are clicked', () => {
    render(
      <SequentialGraphEditor
        min={0}
        max={100}
        points={defaultPoints}
        onChange={mockOnChange}
      />
    );

    const sineButton = screen.getByRole('button', { name: /Sine Wave/i });
    fireEvent.click(sineButton);
    expect(mockOnChange).toHaveBeenCalled();
  });
});
