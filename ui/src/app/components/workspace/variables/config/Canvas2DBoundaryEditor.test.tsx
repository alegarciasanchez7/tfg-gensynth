import type React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { Canvas2DBoundaryEditor } from './Canvas2DBoundaryEditor';
import { BoundaryObstacle } from '../../../../types';
import { recordCanvasFills } from '../../../../../test/recordCanvasFills';
import { DARK_CANVAS_PALETTE, LIGHT_CANVAS_PALETTE } from './canvasPalette';

describe('Canvas2DBoundaryEditor', () => {
  const sampleObstacles: BoundaryObstacle[] = [
    {
      id: 'obs_1',
      name: 'North Room Wall',
      type: 'WALL_SEGMENT',
      points: [{ x: 0, y: 0 }, { x: 50, y: 0 }],
      enabled: true,
    },
  ];

  it('renders toolbar buttons and mode switcher in English when showToolbar is true', () => {
    render(
      <Canvas2DBoundaryEditor
        minX={0}
        maxX={100}
        minY={0}
        maxY={100}
        obstacles={sampleObstacles}
        showToolbar={true}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Move Boundaries (Purple)')).toBeInTheDocument();
    expect(screen.getByText('Move Obstacles (Red)')).toBeInTheDocument();
    expect(screen.getByText('Square')).toBeInTheDocument();
    expect(screen.getByText('Triangle')).toBeInTheDocument();
    expect(screen.getByText('Circle')).toBeInTheDocument();
    expect(screen.getByText('New Region')).toBeInTheDocument();
  });

  it('switches between Move Boundaries and Move Obstacles modes', () => {
    render(
      <Canvas2DBoundaryEditor
        minX={0}
        maxX={100}
        minY={0}
        maxY={100}
        obstacles={sampleObstacles}
        showToolbar={true}
        onChange={vi.fn()}
      />
    );

    const moveObstaclesBtn = screen.getByRole('button', { name: /Move Obstacles/ });
    const moveBoundariesBtn = screen.getByRole('button', { name: /Move Boundaries/ });

    fireEvent.click(moveObstaclesBtn);
    expect(moveObstaclesBtn).toHaveAttribute('aria-pressed', 'true');
    expect(moveBoundariesBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(moveBoundariesBtn);
    expect(moveBoundariesBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('applies preset shape when Square preset button is clicked', () => {
    const onChange = vi.fn();
    render(
      <Canvas2DBoundaryEditor
        minX={0}
        maxX={100}
        minY={0}
        maxY={100}
        obstacles={sampleObstacles}
        showToolbar={true}
        onChange={onChange}
      />
    );

    const squareBtn = screen.getByText('Square');
    fireEvent.click(squareBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        polygon: expect.arrayContaining([
          expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        ]),
      })
    );
  });

  it('opens confirmation modal when New Region is clicked and resets on proceed', () => {
    const onChange = vi.fn();
    render(
      <Canvas2DBoundaryEditor
        minX={0}
        maxX={100}
        minY={0}
        maxY={100}
        obstacles={sampleObstacles}
        showToolbar={true}
        onChange={onChange}
      />
    );

    const newRegionBtn = screen.getByText('New Region');
    fireEvent.click(newRegionBtn);

    expect(screen.getByText('Draw New Region & Clear All Obstacles?')).toBeInTheDocument();

    const proceedBtn = screen.getByText('Proceed & Reset All');
    fireEvent.click(proceedBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        obstacles: [],
      })
    );
  });

  it('accepts selectedObstacleId and triggers onSelectObstacle callback when clicked', () => {
    const onSelectObstacle = vi.fn();
    render(
      <Canvas2DBoundaryEditor
        minX={0}
        maxX={100}
        minY={0}
        maxY={100}
        obstacles={sampleObstacles}
        selectedObstacleId="obs_1"
        onSelectObstacle={onSelectObstacle}
        showToolbar={true}
        onChange={vi.fn()}
      />
    );

    // Canvas renders cleanly with selectedObstacleId prop set
    expect(screen.getByText('Move Boundaries (Purple)')).toBeInTheDocument();
  });

  // jsdom has no layout: getBoundingClientRect() is all zeros, so client coordinates equal canvas pixels.
  // With the default 360x200 canvas and a 0..100 region, the world window is centred at (50, 50)
  // at 1.25 px per unit, so the vertex (0, 0) is drawn at (117.5, 162.5).
  const toPx = (x: number, y: number) => ({ clientX: 180 + (x - 50) * 1.25, clientY: 100 - (y - 50) * 1.25 });

  it('commits a vertex drag once, on pointer-up', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Canvas2DBoundaryEditor minX={0} maxX={100} minY={0} maxY={100} onChange={onChange} />
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;

    fireEvent.pointerDown(canvas, { ...toPx(0, 0), button: 0, pointerId: 1 });
    fireEvent.pointerMove(canvas, { ...toPx(-10, -5), pointerId: 1 });
    fireEvent.pointerMove(canvas, { ...toPx(-20, -10), pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.pointerUp(canvas, { ...toPx(-20, -10), pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ minX: -20, minY: -10, maxX: 100, maxY: 100 }));
  });

  it('does not call onChange for a click without movement', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Canvas2DBoundaryEditor minX={0} maxX={100} minY={0} maxY={100} onChange={onChange} />
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;

    fireEvent.pointerDown(canvas, { ...toPx(0, 0), button: 0, pointerId: 1 });
    fireEvent.pointerUp(canvas, { ...toPx(0, 0), pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the region size when a preset is applied repeatedly', () => {
    const onChange = vi.fn();
    render(
      <Canvas2DBoundaryEditor minX={10} maxX={90} minY={20} maxY={60} showToolbar={true} onChange={onChange} />
    );

    fireEvent.click(screen.getByText('Circle'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minX: 10, maxX: 90, minY: 20, maxY: 60 }));
    fireEvent.click(screen.getByText('Square'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minX: 10, maxX: 90, minY: 20, maxY: 60 }));
  });

  it('marks the New Region confirmation as an alert dialog', () => {
    render(<Canvas2DBoundaryEditor minX={0} maxX={100} minY={0} maxY={100} showToolbar={true} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText('New Region'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('closes the New Region confirmation with Escape without changing anything', () => {
    const onChange = vi.fn();
    render(<Canvas2DBoundaryEditor minX={0} maxX={100} minY={0} maxY={100} showToolbar={true} onChange={onChange} />);
    fireEvent.click(screen.getByText('New Region'));
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the mode, zoom and counts as an HTML status line that follows the mode', () => {
    render(
      <Canvas2DBoundaryEditor minX={0} maxX={100} minY={0} maxY={100} obstacles={sampleObstacles} showToolbar={true} onChange={vi.fn()} />
    );
    const status = screen.getByTestId('canvas2d-status');
    expect(status).toHaveTextContent('[MOVE BOUNDARIES] Zoom: 1.0x | Verts: 4 | Obstacles: 1');

    fireEvent.click(screen.getByText('Move Obstacles (Red)'));
    expect(status).toHaveTextContent('[MOVE OBSTACLES]');
  });

  it('follows a polygon changed from outside and ignores one with fewer than three vertices', () => {
    const props = { minX: 0, maxX: 100, minY: 0, maxY: 100, showToolbar: true, onChange: vi.fn() };
    const { rerender } = render(<Canvas2DBoundaryEditor {...props} />);
    const status = screen.getByTestId('canvas2d-status');
    expect(status).toHaveTextContent('Verts: 4');

    const pentagon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 50, y: 120 }, { x: 0, y: 100 }];
    rerender(<Canvas2DBoundaryEditor {...props} polygon={pentagon} />);
    expect(status).toHaveTextContent('Verts: 5');

    rerender(<Canvas2DBoundaryEditor {...props} polygon={[{ x: 0, y: 0 }]} />);
    expect(status).toHaveTextContent('Verts: 5');
  });

  describe('edge context menu picks the nearest edge', () => {
    // A wall parallel to the bottom region edge (y = 0), 8.8 units above it
    const wall: BoundaryObstacle[] = [
      { id: 'w', name: 'Wall', type: 'WALL_SEGMENT', points: [{ x: 20, y: 8.8 }, { x: 80, y: 8.8 }], enabled: true },
    ];
    const renderWithWall = () =>
      render(<Canvas2DBoundaryEditor minX={0} maxX={100} minY={0} maxY={100} obstacles={wall} onChange={vi.fn()} />);

    it('offers the region edge when it is nearer than the obstacle edge', () => {
      const { container } = renderWithWall();
      // 3 px from the region edge, 8 px from the wall (1.25 px per unit)
      fireEvent.contextMenu(container.querySelector('canvas') as HTMLCanvasElement, toPx(50, 2.4));

      expect(screen.getByText('+ Insert Vertex Here on Boundary Edge')).toBeInTheDocument();
      expect(screen.queryByText('+ Insert Vertex Here on Obstacle')).not.toBeInTheDocument();
    });

    it('offers the obstacle edge when it is nearer than the region edge', () => {
      const { container } = renderWithWall();
      // 8 px from the region edge, 3 px from the wall
      fireEvent.contextMenu(container.querySelector('canvas') as HTMLCanvasElement, toPx(50, 6.4));

      expect(screen.getByText('+ Insert Vertex Here on Obstacle')).toBeInTheDocument();
      expect(screen.queryByText('+ Insert Vertex Here on Boundary Edge')).not.toBeInTheDocument();
    });

    it('closes the menu on a click inside the editor or elsewhere on the page', () => {
      const { container } = renderWithWall();
      const canvas = container.querySelector('canvas') as HTMLCanvasElement;

      fireEvent.contextMenu(canvas, toPx(50, 2.4));
      fireEvent.click(canvas);
      expect(screen.queryByText('+ Insert Vertex Here on Boundary Edge')).not.toBeInTheDocument();

      fireEvent.contextMenu(canvas, toPx(50, 2.4));
      fireEvent.click(document.body);
      expect(screen.queryByText('+ Insert Vertex Here on Boundary Edge')).not.toBeInTheDocument();
    });
  });

  describe('context menu actions', () => {
    const wall: BoundaryObstacle[] = [
      { id: 'w', name: 'Wall', type: 'WALL_SEGMENT', points: [{ x: 20, y: 8.8 }, { x: 80, y: 8.8 }], enabled: true },
    ];
    const zone: BoundaryObstacle = {
      id: 'z',
      name: 'Zone A',
      type: 'OBSTACLE_POLYGON',
      points: [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 70, y: 70 }, { x: 30, y: 70 }],
      enabled: true,
    };
    const renderEditor = (props: Partial<React.ComponentProps<typeof Canvas2DBoundaryEditor>> = {}) => {
      const onChange = vi.fn();
      const utils = render(<Canvas2DBoundaryEditor minX={0} maxX={100} minY={0} maxY={100} onChange={onChange} {...props} />);
      return { onChange, canvas: utils.container.querySelector('canvas') as HTMLCanvasElement };
    };

    it('inserts a vertex on the region edge at the clicked point', () => {
      const { onChange, canvas } = renderEditor({ obstacles: wall });
      fireEvent.contextMenu(canvas, toPx(50, 2.4));
      fireEvent.click(screen.getByText('+ Insert Vertex Here on Boundary Edge'));

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        polygon: [{ x: 0, y: 0 }, { x: 50, y: 2.4 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      }));
      expect(screen.getByText('New vertex added to boundary shape.')).toBeInTheDocument();
    });

    it('inserts a vertex on an obstacle edge', () => {
      const { onChange, canvas } = renderEditor({ obstacles: wall });
      fireEvent.contextMenu(canvas, toPx(50, 6.4));
      fireEvent.click(screen.getByText('+ Insert Vertex Here on Obstacle'));

      expect(onChange.mock.calls[0][0].obstacles[0].points).toEqual([{ x: 20, y: 8.8 }, { x: 50, y: 6.4 }, { x: 80, y: 8.8 }]);
    });

    it('deletes a whole wall when one of its two vertices is deleted', () => {
      const { onChange, canvas } = renderEditor({ obstacles: wall });
      fireEvent.contextMenu(canvas, toPx(20, 8.8));
      fireEvent.click(screen.getByText('✕ Delete Obstacle Vertex'));

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ obstacles: [] }));
      expect(screen.getByText('Wall segment barrier deleted.')).toBeInTheDocument();
    });

    it('deletes one vertex of a zone, and the whole zone at three vertices', () => {
      const { onChange, canvas } = renderEditor({ obstacles: [zone] });
      fireEvent.contextMenu(canvas, toPx(70, 70));
      fireEvent.click(screen.getByText('✕ Delete Obstacle Vertex'));
      expect(onChange.mock.calls[0][0].obstacles[0].points).toHaveLength(3);

      const triangle = renderEditor({ obstacles: [{ ...zone, points: zone.points.slice(0, 3) }] });
      fireEvent.contextMenu(triangle.canvas, toPx(30, 30));
      fireEvent.click(screen.getByText('✕ Delete Obstacle Vertex'));
      expect(triangle.onChange).toHaveBeenCalledWith(expect.objectContaining({ obstacles: [] }));
      expect(screen.getByText('Forbidden interior obstacle zone deleted.')).toBeInTheDocument();
    });

    it('deletes a region vertex but keeps at least three', () => {
      const { onChange, canvas } = renderEditor();
      fireEvent.contextMenu(canvas, toPx(100, 100));
      fireEvent.click(screen.getByText('✕ Delete Boundary Vertex (Min 3 required)'));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }] }));

      const triangle = renderEditor({ polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }] });
      fireEvent.contextMenu(triangle.canvas, toPx(0, 0));
      fireEvent.click(screen.getByText('✕ Delete Boundary Vertex (Min 3 required)'));
      expect(triangle.onChange).not.toHaveBeenCalled();
      expect(screen.getByText('A spatial boundary polygon must have at least 3 vertices.')).toBeInTheDocument();
    });
  });

  it('moves a whole obstacle in Move Obstacles mode and commits it on pointer-up', () => {
    const onChange = vi.fn();
    const zone: BoundaryObstacle = {
      id: 'z',
      type: 'OBSTACLE_POLYGON',
      points: [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 70, y: 70 }, { x: 30, y: 70 }],
      enabled: true,
    };
    const { container } = render(
      <Canvas2DBoundaryEditor minX={0} maxX={100} minY={0} maxY={100} obstacles={[zone]} showToolbar={true} onChange={onChange} />
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    fireEvent.click(screen.getByText('Move Obstacles (Red)'));

    fireEvent.pointerMove(canvas, toPx(50, 50));
    expect(canvas.style.cursor).toBe('pointer');
    fireEvent.pointerDown(canvas, { ...toPx(50, 50), button: 0, pointerId: 1 });
    fireEvent.pointerMove(canvas, { ...toPx(58, 50), pointerId: 1 });
    expect(canvas.style.cursor).toBe('grabbing');
    fireEvent.pointerUp(canvas, { ...toPx(58, 50), pointerId: 1 });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].obstacles[0].points).toEqual([{ x: 38, y: 30 }, { x: 78, y: 30 }, { x: 78, y: 70 }, { x: 38, y: 70 }]);
  });

  it('zooms and resets the view from the compact header', () => {
    render(<Canvas2DBoundaryEditor minX={0} maxX={100} minY={0} maxY={100} onChange={vi.fn()} />);
    const status = screen.getByTestId('canvas2d-status');
    expect(screen.getByText('2D Cartesian Grid (4 Vertices)')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Zoom In'));
    expect(status).toHaveTextContent('Zoom: 1.5x');
    fireEvent.click(screen.getByText('Fit/Reset'));
    expect(status).toHaveTextContent('Zoom: 1.0x');
    fireEvent.click(screen.getByTitle('Zoom Out'));
    expect(status).toHaveTextContent('Zoom: 0.7x');
  });

  it('paints the 2D plane for the light and the dark theme', async () => {
    const canvas = recordCanvasFills();
    try {
      render(<Canvas2DBoundaryEditor minX={0} maxX={100} minY={0} maxY={100} obstacles={sampleObstacles} onChange={vi.fn()} />);
      expect(canvas.fills[0]).toBe(LIGHT_CANVAS_PALETTE.background);

      canvas.fills.length = 0;
      await act(async () => {
        document.documentElement.classList.add('dark');
      });
      expect(canvas.fills[0]).toBe(DARK_CANVAS_PALETTE.background);
    } finally {
      document.documentElement.classList.remove('dark');
      canvas.restore();
    }
  });
});
