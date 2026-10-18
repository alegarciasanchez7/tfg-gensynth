import type React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WaypointCanvas2D } from './WaypointCanvas2D';
import { WaypointEditor } from './WaypointEditor';
import { TooltipProvider } from '../../../ui/tooltip';
import { fitWorldWindow } from '../../../../core/worldWindow';
import type { FullPoint } from '../../../../core/pointDefaults';
import type { BoundaryObstacle, PointVariableConfig } from '../../../../types';

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
});
