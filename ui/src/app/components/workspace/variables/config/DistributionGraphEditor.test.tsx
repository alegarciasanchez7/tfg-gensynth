import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DistributionGraphEditor } from './DistributionGraphEditor';

describe('DistributionGraphEditor', () => {
  const mockOnChange = vi.fn();
  const defaultPoints = [
    { from: 10, to: 30, weight: 50 },
    { from: 30, to: 80, weight: 80 },
  ];

  it('renders custom weights label and values correctly', () => {
    render(
      <DistributionGraphEditor
        min={10}
        max={80}
        points={defaultPoints}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText(/Custom Weights Equalizer/i)).toBeInTheDocument();
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs[0]).toHaveValue(2); // Intervals count
    expect(inputs[1]).toHaveValue(30); // First boundary 'to'
  });

  it('triggers preset generation when uniform preset button is clicked', () => {
    render(
      <DistributionGraphEditor
        min={10}
        max={80}
        points={defaultPoints}
        onChange={mockOnChange}
      />
    );

    const uniformButton = screen.getByRole('button', { name: /Uniform/i });
    fireEvent.click(uniformButton);
    expect(mockOnChange).toHaveBeenCalled();
  });

  it('triggers onChange when range input slider is moved', () => {
    render(
      <DistributionGraphEditor
        min={10}
        max={80}
        points={defaultPoints}
        onChange={mockOnChange}
      />
    );

    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(2);

    fireEvent.change(sliders[0], { target: { value: '90' } });
    expect(mockOnChange).toHaveBeenCalledWith([
      { from: 10, to: 30, weight: 90 },
      { from: 30, to: 80, weight: 80 },
    ]);
  });

  it('triggers onBoundaryModeChange when boundary select is changed', () => {
    const mockOnBoundaryChange = vi.fn();
    render(
      <DistributionGraphEditor
        min={10}
        max={80}
        points={defaultPoints}
        onChange={mockOnChange}
        boundaryMode="RIGHT"
        onBoundaryModeChange={mockOnBoundaryChange}
      />
    );

    const dropdownTrigger = screen.getByRole('button', { name: 'Right [A, B)' });
    expect(dropdownTrigger).toBeInTheDocument();
    
    fireEvent.click(dropdownTrigger);

    const leftOption = screen.getByRole('option', { name: 'Left (A, B]' });
    fireEvent.click(leftOption);

    expect(mockOnBoundaryChange).toHaveBeenCalledWith('LEFT');
  });

  it('fills an empty graph with five uniform bars once, on mount', () => {
    const onChange = vi.fn();
    const { rerender } = render(<DistributionGraphEditor min={0} max={100} points={[]} onChange={onChange} />);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual([
      { from: 0, to: 20, weight: 50 },
      { from: 20, to: 40, weight: 50 },
      { from: 40, to: 60, weight: 50 },
      { from: 60, to: 80, weight: 50 },
      { from: 80, to: 100, weight: 50 },
    ]);

    rerender(<DistributionGraphEditor min={0} max={100} points={[]} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('replaces a graph in the old value format on mount', () => {
    const onChange = vi.fn();
    render(<DistributionGraphEditor min={0} max={10} points={[{ value: 3, weight: 1 }]} onChange={onChange} />);
    expect(onChange.mock.calls[0][0]).toHaveLength(5);
  });

  it('keeps the bar count and shapes the weights of the presets', () => {
    const onChange = vi.fn();
    const bars = [
      { from: 0, to: 25, weight: 1 }, { from: 25, to: 50, weight: 1 },
      { from: 50, to: 75, weight: 1 }, { from: 75, to: 100, weight: 1 },
    ];
    render(<DistributionGraphEditor min={0} max={100} points={bars} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Normal/i }));
    expect(onChange.mock.calls[0][0].map((b: { weight: number }) => b.weight)).toEqual([4, 71, 71, 4]);
    fireEvent.click(screen.getByRole('button', { name: /Decay/i }));
    expect(onChange.mock.calls[1][0].map((b: { weight: number }) => b.weight)).toEqual([100, 45, 20, 9]);
    fireEvent.click(screen.getByRole('button', { name: /Skewed/i }));
    expect(onChange.mock.calls[2][0].map((b: { weight: number }) => b.weight)).toEqual([13, 38, 63, 88]);
  });
});
