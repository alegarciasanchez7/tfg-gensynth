import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SpatialBoundariesTab } from './SpatialBoundariesTab';
import { PointVariableConfig } from '../../../../types';

describe('SpatialBoundariesTab', () => {
  const defaultConfig: PointVariableConfig = {
    coordinateSystem: 'CARTESIAN_3D',
    boundaryBehavior: 'CLAMP',
    minPoint: { x: 0, y: 0, z: 0 },
    maxPoint: { x: 100, y: 100, z: 100 },
  };

  it('renders boundary behavior quick options and initial min/max values', () => {
    render(<SpatialBoundariesTab config={defaultConfig} onChange={vi.fn()} />);

    expect(screen.getByText(/Clamp \(Stop\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Bounce \(Rebound\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Wrap \(Toroidal\)/i)).toBeInTheDocument();

    expect(screen.getByLabelText(/Min X/i)).toHaveValue('0');
    expect(screen.getByLabelText(/Max X/i)).toHaveValue('100');
  });

  it('calls onChange when boundary behavior button is clicked', () => {
    const handleChange = vi.fn();
    render(<SpatialBoundariesTab config={defaultConfig} onChange={handleChange} />);

    const bounceButton = screen.getByText(/Bounce \(Rebound\)/i);
    fireEvent.click(bounceButton);

    expect(handleChange).toHaveBeenCalledWith({ boundaryBehavior: 'BOUNCE' });
  });

  it('updates min/max coordinates on numeric input changes', () => {
    const handleChange = vi.fn();
    render(<SpatialBoundariesTab config={defaultConfig} onChange={handleChange} />);

    const minXInput = screen.getByLabelText(/Min X/i);
    fireEvent.change(minXInput, { target: { value: '15' } });

    expect(handleChange).toHaveBeenCalledWith({
      minPoint: { x: 15, y: 0, z: 0 },
      maxPoint: { x: 100, y: 100, z: 100 },
      boundaryPolygon: [],
    });
  });

  it('renders Geospatial Map Boundary Editor when coordinateSystem is GEOSPATIAL', () => {
    const geoConfig: PointVariableConfig = {
      ...defaultConfig,
      coordinateSystem: 'GEOSPATIAL',
      minPoint: { x: 36, y: -9, z: 0 },
      maxPoint: { x: 43, y: 3, z: 100 },
    };

    render(<SpatialBoundariesTab config={geoConfig} onChange={vi.fn()} />);

    expect(screen.getByText(/Geographic World Map/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Min Latitude/i)).toHaveValue('36');
    expect(screen.getByLabelText(/Max Longitude/i)).toHaveValue('3');
  });

  it('opens expand view modal when expand button is clicked', () => {
    render(<SpatialBoundariesTab config={defaultConfig} onChange={vi.fn()} />);

    const expandBtn = screen.getByText(/Expand View \/ High-Precision Editor/i);
    fireEvent.click(expandBtn);

    expect(screen.getByText(/High-Precision Visual Boundary Editor/i)).toBeInTheDocument();
  });
});
