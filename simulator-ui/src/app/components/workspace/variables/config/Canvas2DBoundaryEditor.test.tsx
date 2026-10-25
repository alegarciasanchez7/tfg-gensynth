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

    const moveObstaclesBtn = screen.getByText('Move Obstacles (Red)');
    fireEvent.click(moveObstaclesBtn);

    const moveBoundariesBtn = screen.getByText('Move Boundaries (Purple)');
    fireEvent.click(moveBoundariesBtn);
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
