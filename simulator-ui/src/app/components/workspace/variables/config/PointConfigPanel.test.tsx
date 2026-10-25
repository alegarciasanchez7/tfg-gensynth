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

  const switchTo = (label: RegExp) => {
    fireEvent.click(document.getElementById('point-coord-system')!);
    fireEvent.click(screen.getAllByRole('button', { name: label }).pop()!);
  };

  it('asks before resetting the region when switching to Geospatial, and keeps it if cancelled', () => {
    const handleChange = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const config: PointVariableConfig = {
      coordinateSystem: 'CARTESIAN_2D', pattern: 'RANDOM_POINT',
      boundaryPolygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
    };
    render(<PointConfigPanel config={config} onChange={handleChange} />);

    switchTo(/Geospatial \(Lat, Lon, Alt\)/);

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('the region polygon'));
    expect(handleChange).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    switchTo(/Geospatial \(Lat, Lon, Alt\)/);
    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ coordinateSystem: 'GEOSPATIAL', boundaryPolygon: [] }));
    confirm.mockRestore();
  });

  it('switches between 2D and 3D without asking and keeps the region', () => {
    const handleChange = vi.fn();
    const confirm = vi.spyOn(window, 'confirm');
    render(<PointConfigPanel config={{ ...defaultConfig, coordinateSystem: 'CARTESIAN_2D' }} onChange={handleChange} />);

    switchTo(/3D Cartesian \(X, Y, Z\)/);

    expect(confirm).not.toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledWith({ coordinateSystem: 'CARTESIAN_3D' });
    confirm.mockRestore();
  });

  it('explains that Graph Route is not available in 3D (not a units change) before dropping the graph', () => {
    const handleChange = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const config: PointVariableConfig = {
      coordinateSystem: 'CARTESIAN_2D', pattern: 'GRAPH_ROUTE', graphNodes: [{ id: 'a', name: 'A', x: 1, y: 1, z: 0 }],
    };
    render(<PointConfigPanel config={config} onChange={handleChange} />);

    switchTo(/3D Cartesian \(X, Y, Z\)/);

    const message = confirm.mock.calls[0][0] as string;
    expect(message).toMatch(/^Graph Route is not available in 3D Cartesian, so the route graph \(1 nodes\) will be reset/);
    expect(message).not.toMatch(/units/);
    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ coordinateSystem: 'CARTESIAN_3D', pattern: 'RANDOM_POINT' }));
    confirm.mockRestore();
  });

  it('shows no empty settings box for Random Point', () => {
    const { container } = render(<PointConfigPanel config={{ coordinateSystem: 'CARTESIAN_3D', pattern: 'RANDOM_POINT' }} onChange={vi.fn()} />);
    const boxes = Array.from(container.querySelectorAll('.rounded.border.p-3'));
    expect(boxes.filter(box => box.childElementCount === 0)).toHaveLength(0);
  });

  it('shows the waypoint editor for Waypoint Navigation and commits steps only on blur', () => {
    const handleChange = vi.fn();
    render(
      <PointConfigPanel
        config={{ coordinateSystem: 'CARTESIAN_3D', pattern: 'WAYPOINT_NAVIGATION', interpolationSteps: 3 }}
        onChange={handleChange}
      />
    );

    expect(screen.getByTestId('waypoint-editor')).toBeInTheDocument();
    expect(screen.getByLabelText('Loop Path')).toBeChecked();
    const steps = screen.getByLabelText('Interpolation Steps');
    expect(steps).toHaveValue('3');

    fireEvent.change(steps, { target: { value: '12' } });
    expect(handleChange).not.toHaveBeenCalled();
    fireEvent.blur(steps);
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith({ interpolationSteps: 12 });
  });
});
