import type React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WaypointCanvas2D } from './WaypointCanvas2D';
import { WaypointEditor } from './WaypointEditor';
import { TooltipProvider } from '../../../ui/tooltip';
import { fitWorldWindow } from '../../../../core/worldWindow';
import type { FullPoint } from '../../../../core/pointDefaults';
import type { MoveCheck, PathIssues } from '../../../../core/waypointPath';
import type { BoundaryObstacle, PointVariableConfig } from '../../../../types';
import { DARK_CANVAS_PALETTE, LIGHT_CANVAS_PALETTE } from './canvasPalette';

// In jsdom the drawing is 320 x 300 px with its origin at (0, 0)
const W = 320;
const H = 300;
const minPoint = { x: 0, y: 0, z: 0 };
const maxPoint = { x: 100, y: 100, z: 0 };

/** Client position of a world point, using the same world window as the component. */
const pixelOf = (x: number, y: number, waypoints: FullPoint[]) => {
  const win = fitWorldWindow([{ x: 0, y: 0 }, { x: 100, y: 100 }, ...waypoints], W, H, 28, 0.05);
  return { clientX: W / 2 + (x - win.cx) * win.scale, clientY: H / 2 - (y - win.cy) * win.scale };
};

const renderCanvas = (waypoints: FullPoint[], overrides: Partial<React.ComponentProps<typeof WaypointCanvas2D>> = {}) => {
  const props = {
    waypoints,
    minPoint,
    maxPoint,
    polygon: [],
    obstacles: [],
    loopPath: true,
    onAppend: vi.fn(() => true),
    onMove: vi.fn(() => true),
    onDelete: vi.fn(),
    issues: { points: [], segments: [] } as PathIssues,
    checkMove: vi.fn((): MoveCheck => ({ error: null, pointBad: false, badSegments: [] })),
    ...overrides,
  };
  const utils = render(<WaypointCanvas2D {...props} />);
  return { ...utils, props };
};

const twoPoints: FullPoint[] = [
  { x: 20, y: 20, z: 0 },
  { x: 80, y: 60, z: 0 },
];

describe('WaypointCanvas2D', () => {
  it('appends a waypoint where the empty plane is clicked', () => {
    const { props } = renderCanvas(twoPoints);

    fireEvent.click(screen.getByTestId('waypoint-plane'), pixelOf(30, 40, twoPoints));

    expect(props.onAppend).toHaveBeenCalledTimes(1);
    expect(props.onAppend).toHaveBeenCalledWith(30, 40);
  });

  it('commits a drag once, on release, at the drop position', () => {
    const { props } = renderCanvas(twoPoints);
    const point = screen.getByTestId('waypoint-0');
    const start = pixelOf(20, 20, twoPoints);
    const end = pixelOf(50, 30, twoPoints);

    fireEvent.pointerDown(point, { pointerId: 1, button: 0, ...start });
    fireEvent.pointerMove(point, { pointerId: 1, clientX: start.clientX + 10, clientY: start.clientY });
    fireEvent.pointerMove(point, { pointerId: 1, ...end });
    expect(props.onMove).not.toHaveBeenCalled();
    fireEvent.pointerUp(point, { pointerId: 1, ...end });
    fireEvent.click(point);

    expect(props.onMove).toHaveBeenCalledTimes(1);
    expect(props.onMove).toHaveBeenCalledWith(0, 50, 30);
    expect(props.onAppend).not.toHaveBeenCalled();
  });

  it('treats a press that moves less than the threshold as a click', () => {
    const { props } = renderCanvas(twoPoints);
    const point = screen.getByTestId('waypoint-1');
    const start = pixelOf(80, 60, twoPoints);

    fireEvent.pointerDown(point, { pointerId: 1, button: 0, ...start });
    fireEvent.pointerMove(point, { pointerId: 1, clientX: start.clientX + 2, clientY: start.clientY + 1 });
    fireEvent.pointerUp(point, { pointerId: 1, clientX: start.clientX + 2, clientY: start.clientY + 1 });

    expect(props.onMove).not.toHaveBeenCalled();
  });

  it('deletes a waypoint on right-click and the selected one with the Delete key', () => {
    const { props, container } = renderCanvas(twoPoints);

    fireEvent.contextMenu(screen.getByTestId('waypoint-1'));
    expect(props.onDelete).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByTestId('waypoint-0'));
    fireEvent.keyDown(container.firstChild as HTMLElement, { key: 'Delete' });
    expect(props.onDelete).toHaveBeenCalledTimes(2);
    expect(props.onDelete).toHaveBeenLastCalledWith(0);
  });

  it('draws the dashed closing segment only when the path loops', () => {
    const three: FullPoint[] = [...twoPoints, { x: 50, y: 90, z: 0 }];
    const { rerender, props } = renderCanvas(three);
    expect(screen.getByTestId('waypoint-closing-segment')).toBeInTheDocument();

    rerender(<WaypointCanvas2D {...props} loopPath={false} />);
    expect(screen.queryByTestId('waypoint-closing-segment')).not.toBeInTheDocument();
  });

  it('rejects a waypoint placed inside a forbidden obstacle, without any change', () => {
    const obstacle: BoundaryObstacle = {
      id: 'obs-1',
      name: 'Pond',
      type: 'OBSTACLE_POLYGON',
      enabled: true,
      points: [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }],
    };
    const config: PointVariableConfig = {
      coordinateSystem: 'CARTESIAN_2D',
      pattern: 'WAYPOINT_NAVIGATION',
      minPoint,
      maxPoint,
      obstacles: [obstacle],
      waypoints: [],
    };
    const onChange = vi.fn();
    render(
      <TooltipProvider>
        <WaypointEditor config={config} onChange={onChange} />
      </TooltipProvider>
    );

    fireEvent.click(screen.getByTestId('waypoint-plane'), pixelOf(50, 50, []));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot place waypoint inside forbidden obstacle zone: "Pond"');

    fireEvent.click(screen.getByTestId('waypoint-plane'), pixelOf(20, 20, []));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ waypoints: [{ x: 20, y: 20, z: 0 }] });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('stops a drag at the region border and commits the clamped position once', () => {
    const { props } = renderCanvas(twoPoints);
    const point = screen.getByTestId('waypoint-0');
    const start = pixelOf(20, 20, twoPoints);
    const outside = pixelOf(150, 30, twoPoints);

    fireEvent.pointerDown(point, { pointerId: 1, button: 0, ...start });
    fireEvent.pointerMove(point, { pointerId: 1, ...pixelOf(120, 25, twoPoints) });
    fireEvent.pointerMove(point, { pointerId: 1, ...outside });
    expect(props.checkMove).toHaveBeenLastCalledWith(0, 100, 30);
    fireEvent.pointerUp(point, { pointerId: 1, ...outside });

    expect(props.onMove).toHaveBeenCalledTimes(1);
    expect(props.onMove).toHaveBeenCalledWith(0, 100, 30);
  });

  it('draws the dragged waypoint and its segments in red while the drop would be rejected', () => {
    const checkMove = vi.fn((): MoveCheck => ({ error: 'Cannot draw path segment crossing forbidden wall barrier: "Wall"', pointBad: false, badSegments: [0] }));
    const { props } = renderCanvas(twoPoints, { checkMove, onMove: vi.fn(() => false) });
    const point = screen.getByTestId('waypoint-1');
    const start = pixelOf(80, 60, twoPoints);
    const end = pixelOf(60, 90, twoPoints);

    fireEvent.pointerDown(point, { pointerId: 1, button: 0, ...start });
    fireEvent.pointerMove(point, { pointerId: 1, ...end });
    expect(screen.getByTestId('waypoint-1')).toHaveAttribute('data-state', 'rejected');
    expect(screen.getByTestId('waypoint-bad-segment-0')).toHaveAttribute('data-state', 'rejected');

    // Rejected on release: back to the stored position, no longer red
    fireEvent.pointerUp(point, { pointerId: 1, ...end });
    expect(props.onMove).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('waypoint-1')).not.toHaveAttribute('data-state');
    expect(screen.queryByTestId('waypoint-bad-segment-0')).not.toBeInTheDocument();
  });

  it('snaps a click just outside the border onto it, and passes farther clicks on unchanged', () => {
    const { props } = renderCanvas(twoPoints);

    fireEvent.click(screen.getByTestId('waypoint-plane'), pixelOf(101, 50, twoPoints));
    expect(props.onAppend).toHaveBeenLastCalledWith(100, 50);

    fireEvent.click(screen.getByTestId('waypoint-plane'), pixelOf(110, 50, twoPoints));
    expect(props.onAppend).toHaveBeenLastCalledWith(110, 50);
  });

  it('draws stored invalid waypoints and segments in rose, with the reason as tooltip', () => {
    const three: FullPoint[] = [...twoPoints, { x: 50, y: 90, z: 0 }];
    renderCanvas(three, {
      issues: { points: [null, 'Cannot place waypoint outside allowed boundary limits.', null], segments: [null, null, 'Crosses "Wall"'] },
    });

    expect(screen.getByTestId('waypoint-1')).toHaveAttribute('data-state', 'invalid');
    expect(screen.getByTestId('waypoint-1')).toHaveTextContent('Cannot place waypoint outside allowed boundary limits.');
    expect(screen.getByTestId('waypoint-0')).not.toHaveAttribute('data-state');
    expect(screen.getByTestId('waypoint-bad-segment-2')).toHaveAttribute('data-state', 'invalid');
    expect(screen.queryByTestId('waypoint-bad-segment-0')).not.toBeInTheDocument();
  });

  it('fills the height of its container in fill mode', () => {
    const { container } = renderCanvas(twoPoints, { fill: true });
    expect((container.firstChild as HTMLElement).style.height).toBe('100%');
    // jsdom cannot measure the container: the minimum fill height is used
    expect(screen.getByTestId('waypoint-canvas')).toHaveAttribute('height', '240');
  });

  it('rejects dragging a waypoint into a forbidden zone in the editor, live and on release', () => {
    const obstacle: BoundaryObstacle = {
      id: 'obs-1',
      name: 'Pond',
      type: 'OBSTACLE_POLYGON',
      enabled: true,
      points: [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }],
    };
    const onChange = vi.fn();
    render(
      <TooltipProvider>
        <WaypointEditor
          config={{ coordinateSystem: 'CARTESIAN_2D', pattern: 'WAYPOINT_NAVIGATION', minPoint, maxPoint, obstacles: [obstacle], waypoints: twoPoints }}
          onChange={onChange}
        />
      </TooltipProvider>
    );
    const point = screen.getByTestId('waypoint-1');
    const start = pixelOf(80, 60, twoPoints);
    const inPond = pixelOf(50, 50, twoPoints);

    fireEvent.pointerDown(point, { pointerId: 1, button: 0, ...start });
    fireEvent.pointerMove(point, { pointerId: 1, ...inPond });
    expect(screen.getByTestId('waypoint-1')).toHaveAttribute('data-state', 'rejected');
    // A rejected position also marks the segment that leads to it
    expect(screen.getByTestId('waypoint-bad-segment-0')).toHaveAttribute('data-state', 'rejected');
    fireEvent.pointerUp(point, { pointerId: 1, ...inPond });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot place waypoint inside forbidden obstacle zone: "Pond"');

    // Dragged past the border instead: stops on it, one change
    const outside = pixelOf(130, 60, twoPoints);
    fireEvent.pointerDown(point, { pointerId: 2, button: 0, ...start });
    fireEvent.pointerMove(point, { pointerId: 2, ...outside });
    expect(screen.getByTestId('waypoint-1')).not.toHaveAttribute('data-state');
    fireEvent.pointerUp(point, { pointerId: 2, ...outside });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ waypoints: [twoPoints[0], { x: 100, y: 60, z: 0 }] });
  });

  it('paints the plane for the light and the dark theme', async () => {
    try {
      renderCanvas(twoPoints);
      expect(screen.getByTestId('waypoint-plane')).toHaveAttribute('fill', LIGHT_CANVAS_PALETTE.background);

      await act(async () => {
        document.documentElement.classList.add('dark');
      });
      expect(screen.getByTestId('waypoint-plane')).toHaveAttribute('fill', DARK_CANVAS_PALETTE.background);
    } finally {
      document.documentElement.classList.remove('dark');
    }
  });
});
