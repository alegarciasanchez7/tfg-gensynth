import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Isometric3DBoundaryEditor } from './Isometric3DBoundaryEditor';

describe('Isometric3DBoundaryEditor', () => {
  const defaultProps = {
    minX: -50,
    maxX: 50,
    minY: -50,
    maxY: 50,
    minZ: 0,
    maxZ: 100,
    polygon: [
      { x: -50, y: -50, z: 0 },
      { x: 50, y: -50, z: 0 },
      { x: 50, y: 50, z: 0 },
      { x: -50, y: 50, z: 0 },
    ],
    shape3DType: 'cube' as const,
    shape3DWidth: 100,
    shape3DLength: 100,
    shape3DHeight: 100,
    shape3DRadius: 50,
    onChange: vi.fn(),
  };

  it('renders correctly with English shape buttons, Orbit View toggle, and side panel', () => {
    render(<Isometric3DBoundaryEditor {...defaultProps} />);

    expect(screen.getByText('Cube')).toBeInTheDocument();
    expect(screen.getByText('Pyramid')).toBeInTheDocument();
    expect(screen.getByText('Cone')).toBeInTheDocument();
    expect(screen.getByText('Sphere')).toBeInTheDocument();
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();

    expect(screen.getByText('Orbit View')).toBeInTheDocument();
    expect(screen.getByText('3D Parametric Limits')).toBeInTheDocument();
    expect(screen.getByText('Base Width (X)')).toBeInTheDocument();
    expect(screen.getByText('Base Length (Y)')).toBeInTheDocument();
    expect(screen.getByText('Height (Z)')).toBeInTheDocument();
  });

  it('switches 3D shape preset when clicked', () => {
    const onChange = vi.fn();
    render(<Isometric3DBoundaryEditor {...defaultProps} onChange={onChange} />);

    const sphereBtn = screen.getByText('Sphere');
    fireEvent.click(sphereBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        shape3DType: 'sphere',
      })
    );
  });

  it('displays radius input when sphere shape is active', () => {
    render(<Isometric3DBoundaryEditor {...defaultProps} shape3DType="sphere" />);

    expect(screen.getByText('Radius (R)')).toBeInTheDocument();
    expect(screen.queryByText('Base Width (X)')).not.toBeInTheDocument();
  });

  it('updates height when input changes', () => {
    const onChange = vi.fn();
    render(<Isometric3DBoundaryEditor {...defaultProps} onChange={onChange} />);

    const heightInput = screen.getByLabelText('Height (Z)');
    fireEvent.change(heightInput, { target: { value: '150' } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        shape3DHeight: 150,
      })
    );
  });
});
