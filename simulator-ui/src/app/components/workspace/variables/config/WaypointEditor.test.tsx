import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WaypointEditor } from './WaypointEditor';
import { TooltipProvider } from '../../../ui/tooltip';
import type { BoundaryObstacle, PointVariableConfig } from '../../../../types';

// The map needs a real Leaflet; the editor logic is tested through the table
vi.mock('./WaypointMap', () => ({ WaypointMap: () => <div data-testid="waypoint-map" /> }));

const renderEditor = (config: PointVariableConfig) => {
  const onChange = vi.fn();
  render(
    <TooltipProvider>
      <WaypointEditor config={config} onChange={onChange} />
    </TooltipProvider>
  );
  return onChange;
};

const typeInto = (label: string, value: string) => {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  return input;
};

const base2D: PointVariableConfig = {
  coordinateSystem: 'CARTESIAN_2D',
  pattern: 'WAYPOINT_NAVIGATION',
  minPoint: { x: 0, y: 0, z: 0 },
  maxPoint: { x: 100, y: 100, z: 0 },
  waypoints: [
    { x: 10, y: 10, z: 0 },
    { x: 90, y: 10, z: 0 },
    { x: 90, y: 90, z: 0 },
  ],
};

// A vertical wall at x = 50 from y = 40 to y = 100
const wall: BoundaryObstacle = {
  id: 'wall-1',
  name: 'Wall',
  type: 'WALL_SEGMENT',
  enabled: true,
  points: [{ x: 50, y: 40 }, { x: 50, y: 100 }],
};

describe('WaypointEditor', () => {
  it('closes the Clear confirmation with Escape without clearing', () => {
    const onChange = renderEditor(base2D);

    fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));
    expect(screen.getByText('Clear all waypoints?')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByText('Clear all waypoints?')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the count, Loop Path on by default and the 2D plane', () => {
    renderEditor(base2D);

    expect(screen.getByText('3 waypoints')).toBeInTheDocument();
    expect(screen.getByLabelText('Loop Path')).toBeChecked();
    expect(screen.getByLabelText('Interpolation Steps')).toHaveValue('1');
    expect(screen.getByTestId('waypoint-canvas')).toBeInTheDocument();
    expect(screen.queryByLabelText('Waypoint 1 Z')).not.toBeInTheDocument();
  });

  it('shows the map in Geospatial', () => {
    renderEditor({ ...base2D, coordinateSystem: 'GEOSPATIAL' });
    expect(screen.getByTestId('waypoint-map')).toBeInTheDocument();
  });

  it('uses the table only in 3D, with a Z column', () => {
    renderEditor({ ...base2D, coordinateSystem: 'CARTESIAN_3D' });
    expect(screen.getByText(/Enter the coordinates in the table/)).toBeInTheDocument();
    expect(screen.queryByTestId('waypoint-canvas')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Waypoint 1 Z')).toBeInTheDocument();
  });

  it('works with the partial config of a conditional-rule override (default 3D region)', () => {
    const onChange = renderEditor({ pattern: 'WAYPOINT_NAVIGATION' });

    expect(screen.getByText('0 waypoints')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add waypoint/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ waypoints: [{ x: 50, y: 50, z: 0 }] });
  });

  it('adds the next waypoint 5% of the region away from the last one, inside the region', () => {
    const onChange = renderEditor({
      ...base2D,
      coordinateSystem: 'CARTESIAN_3D',
      waypoints: [{ x: 98, y: 20, z: 7 }],
    });

    fireEvent.click(screen.getByRole('button', { name: /Add waypoint/ }));

    // x would leave the region, so it goes the other way; z copies the last waypoint
    expect(onChange).toHaveBeenCalledWith({ waypoints: [{ x: 98, y: 20, z: 7 }, { x: 93, y: 25, z: 7 }] });
  });

  it('toggles Loop Path and commits Interpolation Steps once, rejecting invalid values', () => {
    const onChange = renderEditor(base2D);

    fireEvent.click(screen.getByLabelText('Loop Path'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ loopPath: false });

    const steps = typeInto('Interpolation Steps', '0');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(steps).toHaveValue('1');
    expect(screen.getByRole('alert')).toHaveTextContent('Interpolation Steps must be a whole number of at least 1.');

    typeInto('Interpolation Steps', '4');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith({ interpolationSteps: 4 });
  });

  it('commits a valid typed coordinate with a single onChange', () => {
    const onChange = renderEditor(base2D);

    typeInto('Waypoint 2 Y', '25');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      waypoints: [{ x: 10, y: 10, z: 0 }, { x: 90, y: 25, z: 0 }, { x: 90, y: 90, z: 0 }],
    });
  });

  it('rejects a coordinate outside the region or not a number, warns and restores it', () => {
    const onChange = renderEditor(base2D);

    const input = typeInto('Waypoint 1 X', '150');
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('10');
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot place waypoint outside allowed boundary limits.');

    typeInto('Waypoint 1 X', '1e');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid number for the waypoint coordinate.');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss warning' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rejects a move whose adjacent segment crosses a wall', () => {
    const onChange = renderEditor({ ...base2D, obstacles: [wall], loopPath: false });

    // Waypoint 2 at (90, 80): the segment from waypoint 1 (10, 10) crosses the wall at y = 45
    typeInto('Waypoint 2 Y', '80');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot draw path segment crossing forbidden wall barrier: "Wall"');
  });

  it('checks the closing segment only when the path loops', () => {
    // Waypoint 3 at (90, 95): only the closing segment back to (10, 10) crosses the wall
    const looped = renderEditor({ ...base2D, obstacles: [wall], loopPath: true });
    typeInto('Waypoint 3 Y', '95');
    expect(looped).not.toHaveBeenCalled();
  });

  it('accepts the same move when the path does not loop', () => {
    const open = renderEditor({ ...base2D, obstacles: [wall], loopPath: false });
    typeInto('Waypoint 3 Y', '95');
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('clamps a typed latitude and longitude to the valid range in Geospatial', () => {
    const onChange = renderEditor({
      coordinateSystem: 'GEOSPATIAL',
      pattern: 'WAYPOINT_NAVIGATION',
      minPoint: { x: -90, y: -180, z: 0 },
      maxPoint: { x: 90, y: 180, z: 100 },
      waypoints: [{ x: 40, y: -3, z: 0 }],
    });

    typeInto('Waypoint 1 latitude', '95');
    expect(onChange).toHaveBeenLastCalledWith({ waypoints: [{ x: 90, y: -3, z: 0 }] });
    typeInto('Waypoint 1 longitude', '-200');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith({ waypoints: [{ x: 40, y: -180, z: 0 }] });
  });

  it('reorders and deletes with one onChange each, and clears after confirming', () => {
    const onChange = renderEditor(base2D);

    fireEvent.click(screen.getByRole('button', { name: 'Move waypoint 1 down' }));
    expect(onChange).toHaveBeenLastCalledWith({
      waypoints: [{ x: 90, y: 10, z: 0 }, { x: 10, y: 10, z: 0 }, { x: 90, y: 90, z: 0 }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete waypoint 3' }));
    expect(onChange).toHaveBeenLastCalledWith({ waypoints: [{ x: 10, y: 10, z: 0 }, { x: 90, y: 10, z: 0 }] });
    expect(onChange).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    expect(onChange).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith({ waypoints: [] });
  });
});
