import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WaypointEditor } from './WaypointEditor';
import { TooltipProvider } from '../../../ui/tooltip';
import type { BoundaryObstacle, PointVariableConfig } from '../../../../types';
import { isInsideRegion } from '../../../../core/routeGeometry';
import type { FullPoint } from '../../../../core/pointDefaults';

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
      maxPoint: { x: 100, y: 100, z: 100 },
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
  /** The waypoints sent by the last onChange. */
  const lastWaypoints = (onChange: ReturnType<typeof vi.fn>) =>
    ((onChange.mock.lastCall?.[0] as Partial<PointVariableConfig>).waypoints ?? []) as FullPoint[];

  it('adds a waypoint inside a triangle when the usual 5% shift would leave it', () => {
    const triangle = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
    const onChange = renderEditor({ ...base2D, boundaryPolygon: triangle, waypoints: [{ x: 90, y: 5, z: 0 }] });

    // The usual rule gives (95, 10), past the slanted edge
    fireEvent.click(screen.getByRole('button', { name: /Add waypoint/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const added = lastWaypoints(onChange)[1];
    expect(added).not.toEqual({ x: 95, y: 10, z: 0 });
    expect(isInsideRegion(added, triangle)).toBe(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('adds the first waypoint inside a concave region whose centre is outside it', () => {
    // A U shape: the centre (15, 15) and the centroid fall in the notch
    const u = [
      { x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 20, y: 30 },
      { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 },
    ];
    const onChange = renderEditor({ ...base2D, boundaryPolygon: u, waypoints: [] });

    fireEvent.click(screen.getByRole('button', { name: /Add waypoint/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(isInsideRegion(lastWaypoints(onChange)[0], u)).toBe(true);
  });

  it('warns when no valid position exists for a new waypoint', () => {
    const everywhere: BoundaryObstacle = {
      id: 'all',
      name: 'Lake',
      type: 'OBSTACLE_POLYGON',
      enabled: true,
      points: [{ x: -10, y: -10 }, { x: 110, y: -10 }, { x: 110, y: 110 }, { x: -10, y: 110 }],
    };
    const onChange = renderEditor({ ...base2D, obstacles: [everywhere], waypoints: [] });

    fireEvent.click(screen.getByRole('button', { name: /Add waypoint/ }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('No valid position found for a new waypoint: click on the plane or type its coordinates.');
  });

  it('flags stored waypoints and segments that break the rules, and still allows fixing them', () => {
    // Waypoint 2 is outside the region; the closing segment 3 → 1 crosses the wall
    const onChange = renderEditor({
      ...base2D,
      obstacles: [wall],
      waypoints: [{ x: 10, y: 60, z: 0 }, { x: 150, y: 10, z: 0 }, { x: 90, y: 60, z: 0 }],
    });

    expect(screen.getByTestId('waypoint-invalid-notice')).toHaveTextContent(
      '1 waypoint is outside the region or in a forbidden zone and 1 segment leaves the region or crosses an obstacle (in red). The generator follows the path anyway.'
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => r.getAttribute('data-invalid'))).toEqual(['true', 'true', 'true']);
    expect(screen.getByTitle('Cannot place waypoint outside allowed boundary limits.')).toHaveTextContent('2');
    expect(screen.getByTestId('waypoint-1')).toHaveAttribute('data-state', 'invalid');

    // Fixing waypoint 2 is not blocked by the crossing closing segment
    typeInto('Waypoint 2 X', '50');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('shows no notice when the path is valid', () => {
    renderEditor(base2D);
    expect(screen.queryByTestId('waypoint-invalid-notice')).not.toBeInTheDocument();
  });

  it('validates 3D waypoints against the 3D shape', () => {
    // A sphere of radius 10 centred at (50, 50, 10)
    const sphere: PointVariableConfig = {
      coordinateSystem: 'CARTESIAN_3D',
      pattern: 'WAYPOINT_NAVIGATION',
      minPoint: { x: 0, y: 0, z: 0 },
      maxPoint: { x: 100, y: 100, z: 100 },
      shape3DType: 'sphere',
      shape3DRadius: 10,
      waypoints: [{ x: 50, y: 50, z: 10 }, { x: 90, y: 90, z: 90 }],
    };
    const onChange = renderEditor(sphere);

    expect(screen.getByTestId('waypoint-invalid-notice')).toHaveTextContent('1 waypoint is outside the 3D region (in red).');
    expect(screen.getByTitle('Waypoint 2 is outside the 3D region (sphere).')).toHaveTextContent('2');

    const input = typeInto('Waypoint 1 X', '70');
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('50');
    expect(screen.getByRole('alert')).toHaveTextContent('Waypoint 1 is outside the 3D region (sphere).');

    typeInto('Waypoint 1 Z', '15');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ waypoints: [{ x: 50, y: 50, z: 15 }, { x: 90, y: 90, z: 90 }] });
  });

  it('adds a 3D waypoint at the shape centre when no shift of the last one stays inside', () => {
    const onChange = renderEditor({
      coordinateSystem: 'CARTESIAN_3D',
      pattern: 'WAYPOINT_NAVIGATION',
      minPoint: { x: 0, y: 0, z: 0 },
      maxPoint: { x: 100, y: 100, z: 100 },
      shape3DType: 'sphere',
      shape3DRadius: 10,
      // Near the top of the sphere: every shift at this height leaves it
      waypoints: [{ x: 50, y: 50, z: 19 }],
    });

    fireEvent.click(screen.getByRole('button', { name: /Add waypoint/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(lastWaypoints(onChange)[1]).toEqual({ x: 50, y: 50, z: 10 });
  });

  it('opens the editor fullscreen in <body> and leaves it with Esc', () => {
    const { container } = render(
      <TooltipProvider>
        <WaypointEditor config={base2D} onChange={vi.fn()} />
      </TooltipProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    const editor = screen.getByTestId('waypoint-editor');
    expect(editor.parentElement).toBe(document.body);
    expect(container.contains(editor)).toBe(false);
    expect(screen.getByTestId('waypoint-side-panel')).toContainElement(screen.getByLabelText('Waypoint 1 X'));
    expect(screen.getByRole('button', { name: 'Exit Fullscreen' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.contains(screen.getByTestId('waypoint-editor'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument();
  });

  it('closes only the Clear confirmation with the first Esc in fullscreen', () => {
    const { container } = render(
      <TooltipProvider>
        <WaypointEditor config={base2D} onChange={vi.fn()} />
      </TooltipProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByText('Clear all waypoints?')).not.toBeInTheDocument();
    expect(container.contains(screen.getByTestId('waypoint-editor'))).toBe(false);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(container.contains(screen.getByTestId('waypoint-editor'))).toBe(true);
  });

  it('offers fullscreen in 2D and Geospatial only', () => {
    renderEditor({ ...base2D, coordinateSystem: 'CARTESIAN_3D' });
    expect(screen.queryByRole('button', { name: 'Fullscreen' })).not.toBeInTheDocument();
  });
});
