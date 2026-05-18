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
    expect(sliders.length).toBe(2);

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

    const leftOption = screen.getByRole('button', { name: 'Left (A, B]' });
    fireEvent.click(leftOption);

    expect(mockOnBoundaryChange).toHaveBeenCalledWith('LEFT');
  });
});
