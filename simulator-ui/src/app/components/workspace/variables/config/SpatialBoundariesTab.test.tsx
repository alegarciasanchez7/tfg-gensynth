import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SpatialBoundariesTab } from './SpatialBoundariesTab';
import { PointVariableConfig } from '../../../../types';
import { defaultBoundsFor } from '../../../../core/pointDefaults';

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
    expect(handleChange).not.toHaveBeenCalled();
    fireEvent.blur(minXInput);

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

    expect(screen.getByText(/Drag vertices/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Min Latitude/i)).toHaveValue('36');
    expect(screen.getByLabelText(/Max Longitude/i)).toHaveValue('3');
    expect(screen.getByLabelText(/Altitude Measurement Unit/i)).toBeInTheDocument();
  });

  it('shows a single Fullscreen button that opens the editor in fullscreen', () => {
    render(<SpatialBoundariesTab config={defaultConfig} onChange={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: /Fullscreen/i })).toHaveLength(1);
    expect(screen.queryByText(/Expand View/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('fixed', 'inset-0');
    expect(screen.getByText('3D Spatial Volume Editor — Fullscreen Boundary Editor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exit Fullscreen/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Expand to Full Screen Window|Restore Standard Window/)).not.toBeInTheDocument();
    // The tab keeps a placeholder while the fullscreen editor is open
    expect(screen.getByText('Editing in fullscreen…')).toBeInTheDocument();
  });

  it('closes the fullscreen editor with Exit Fullscreen and with Escape', () => {
    render(<SpatialBoundariesTab config={defaultConfig} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    fireEvent.click(screen.getByRole('button', { name: /Exit Fullscreen/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Editing in fullscreen…')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the 2D canvas and the obstacles side panel in the fullscreen editor', () => {
    render(
      <SpatialBoundariesTab
        config={{ coordinateSystem: 'CARTESIAN_2D', minPoint: { x: 0, y: 0, z: 0 }, maxPoint: { x: 100, y: 100, z: 0 } }}
        onChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('2D Barriers & Obstacles Management')).toBeInTheDocument();
    expect(within(dialog).getByText('New Region')).toBeInTheDocument();
  });

  it('swaps min and max when a committed min is above the max', () => {
    const handleChange = vi.fn();
    render(<SpatialBoundariesTab config={defaultConfig} onChange={handleChange} />);

    const minXInput = screen.getByLabelText(/Min X/i);
    fireEvent.change(minXInput, { target: { value: '150' } });
    fireEvent.keyDown(minXInput, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ minPoint: { x: 100, y: 0, z: 0 }, maxPoint: { x: 150, y: 100, z: 100 } })
    );
  });

  it('limits geospatial bounds to valid latitudes and longitudes', () => {
    const handleChange = vi.fn();
    const geoConfig: PointVariableConfig = {
      ...defaultConfig,
      coordinateSystem: 'GEOSPATIAL',
      minPoint: { x: 36, y: -9, z: 0 },
      maxPoint: { x: 43, y: 3, z: 100 },
    };
    render(<SpatialBoundariesTab config={geoConfig} onChange={handleChange} />);

    const maxLat = screen.getByLabelText(/Max Latitude/i);
    fireEvent.change(maxLat, { target: { value: '95' } });
    fireEvent.keyDown(maxLat, { key: 'Enter' });
    const maxLon = screen.getByLabelText(/Max Longitude/i);
    fireEvent.change(maxLon, { target: { value: '250' } });
    fireEvent.keyDown(maxLon, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ maxPoint: expect.objectContaining({ x: 90 }) }));
    expect(handleChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxPoint: expect.objectContaining({ y: 180 }) }));
  });

  it('keeps partial input such as "-" until it is committed, then reverts invalid text', () => {
    const handleChange = vi.fn();
    render(<SpatialBoundariesTab config={defaultConfig} onChange={handleChange} />);

    const minYInput = screen.getByLabelText(/Min Y/i);
    fireEvent.change(minYInput, { target: { value: '-' } });
    expect(minYInput).toHaveValue('-');
    fireEvent.blur(minYInput);

    expect(handleChange).not.toHaveBeenCalled();
    expect(minYInput).toHaveValue('0');
  });

  it('uses the geospatial default region when a GEOSPATIAL point has no bounds', () => {
    const { minPoint, maxPoint } = defaultBoundsFor('GEOSPATIAL');
    render(<SpatialBoundariesTab config={{ coordinateSystem: 'GEOSPATIAL' }} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/Min Latitude/i)).toHaveValue(String(minPoint.x));
    expect(screen.getByLabelText(/Max Latitude/i)).toHaveValue(String(maxPoint.x));
    expect(screen.getByLabelText(/Min Longitude/i)).toHaveValue(String(minPoint.y));
    expect(screen.getByLabelText(/Max Longitude/i)).toHaveValue(String(maxPoint.y));
  });

  it('clears the initial altitude when the geospatial editor sends it as undefined', () => {
    const handleChange = vi.fn();
    const geoConfig: PointVariableConfig = {
      coordinateSystem: 'GEOSPATIAL',
      minPoint: { x: 40.3, y: -3.8, z: 0 },
      maxPoint: { x: 40.55, y: -3.55, z: 100 },
      initialAltitude: 25,
    };
    render(<SpatialBoundariesTab config={geoConfig} onChange={handleChange} />);

    const altitudeInput = screen.getByDisplayValue('25');
    fireEvent.change(altitudeInput, { target: { value: '' } });
    fireEvent.blur(altitudeInput);

    expect(handleChange).toHaveBeenCalled();
    const lastConfig = handleChange.mock.calls[handleChange.mock.calls.length - 1][0] as Partial<PointVariableConfig>;
    expect('initialAltitude' in lastConfig).toBe(true);
    expect(lastConfig.initialAltitude).toBeUndefined();
  });

  it('forwards the X/Y bounds emitted by the 3D editor', () => {
    const handleChange = vi.fn();
    render(
      <SpatialBoundariesTab
        config={{ ...defaultConfig, minPoint: { x: 0, y: 0, z: 0 }, maxPoint: { x: 100, y: 100, z: 100 }, shape3DWidth: 100, shape3DLength: 100 }}
        onChange={handleChange}
      />
    );

    const widthInput = screen.getByLabelText('Base Width (X)');
    fireEvent.change(widthInput, { target: { value: '40' } });
    fireEvent.blur(widthInput);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ minPoint: { x: 30, y: 0, z: 0 }, maxPoint: { x: 70, y: 100, z: 100 }, shape3DWidth: 40 })
    );
  });
});
