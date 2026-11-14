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

  it('places the nodes on the first render (viewBox units, no svg size needed)', () => {
    const points = Array.from({ length: 11 }, (_, x) => ({ x, y: 50 }));
    const { container } = render(<SequentialGraphEditor min={0} max={100} points={points} onChange={vi.fn()} />);

    const nodes = container.querySelectorAll('circle[r="3.5"]');
    expect(nodes).toHaveLength(11);
    expect(nodes[0].getAttribute('cx')).toBe('40');
    expect(nodes[10].getAttribute('cx')).toBe('360');
    expect(nodes[0].getAttribute('cy')).toBe('75');
  });

  it('starts the tick count at the max X of the points', () => {
    const points = Array.from({ length: 16 }, (_, x) => ({ x, y: 1 }));
    render(<SequentialGraphEditor min={0} max={100} points={points} onChange={vi.fn()} />);
    expect(screen.getByRole('spinbutton')).toHaveValue(15);
  });

  it('fills an empty sequence with a sine wave once, on mount', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SequentialGraphEditor min={0} max={10} points={[]} onChange={onChange} />);

    expect(onChange).toHaveBeenCalledTimes(1);
    const sine = onChange.mock.calls[0][0];
    expect(sine).toHaveLength(11);
    expect(sine[0]).toEqual({ x: 0, y: 5 });

    rerender(<SequentialGraphEditor min={0} max={10} points={[]} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('generates the ramp preset over the current tick count', () => {
    const onChange = vi.fn();
    render(<SequentialGraphEditor min={0} max={10} points={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Ramp/i }));
    const ramp = onChange.mock.calls[0][0];
    expect(ramp).toHaveLength(11);
    expect(ramp[5]).toEqual({ x: 5, y: 5 });
    expect(ramp[10]).toEqual({ x: 10, y: 10 });
  });
});
