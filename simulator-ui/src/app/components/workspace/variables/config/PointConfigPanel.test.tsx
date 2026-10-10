import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PointConfigPanel } from './PointConfigPanel';
import { PointVariableConfig } from '../../../../types';

describe('PointConfigPanel', () => {
  const defaultConfig: PointVariableConfig = {
    coordinateSystem: 'CARTESIAN_3D',
    pattern: 'RANDOM_WALK',
    maxStepDistance: 10.5,
    gpsNoiseEnabled: false,
  };

  it('renders input fields with initial config values', () => {
    render(<PointConfigPanel config={defaultConfig} onChange={vi.fn()} />);

    expect(screen.getByText(/3D Cartesian/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Max Step Distance/i)).toHaveValue('10.5');
  });

  it('calls onChange when step distance is modified', () => {
    const handleChange = vi.fn();
    render(<PointConfigPanel config={defaultConfig} onChange={handleChange} />);

    const stepInput = screen.getByLabelText(/Max Step Distance/i);
    fireEvent.change(stepInput, { target: { value: '5.2' } });

    expect(handleChange).toHaveBeenCalledWith({ maxStepDistance: 5.2 });
  });

  it('toggles GPS noise and modifies jitter radius', () => {
    const handleChange = vi.fn();
    const gpsConfig: PointVariableConfig = {
      ...defaultConfig,
      gpsNoiseEnabled: true,
      jitterRadius: 1.5,
    };

    render(<PointConfigPanel config={gpsConfig} onChange={handleChange} />);

    const jitterInput = screen.getByLabelText(/Random Jitter Noise Radius/i);
    expect(jitterInput).toHaveValue('1.5');

    fireEvent.change(jitterInput, { target: { value: '3.0' } });
    expect(handleChange).toHaveBeenCalledWith({ jitterRadius: 3.0 });
  });

  it('displays Geospatial format selector when coordinateSystem is GEOSPATIAL', () => {
    const geoConfig: PointVariableConfig = {
      ...defaultConfig,
      coordinateSystem: 'GEOSPATIAL',
      geospatialFormat: 'DEGREES_MINUTES_SECONDS',
    };

    render(<PointConfigPanel config={geoConfig} onChange={vi.fn()} />);

    expect(screen.getByText(/Degrees, Minutes, Sec \(DMS\)/i)).toBeInTheDocument();
  });
});
