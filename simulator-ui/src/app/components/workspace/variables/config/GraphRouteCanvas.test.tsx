import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GraphRouteCanvas } from './GraphRouteCanvas';
import { PointVariableConfig } from '../../../../types';

describe('GraphRouteCanvas', () => {
  const defaultConfig: PointVariableConfig = {
    coordinateSystem: 'CARTESIAN_2D',
    pattern: 'GRAPH_ROUTE',
    graphNodes: [
      { id: 'node-1', name: 'Node 0', x: 50, y: 50, z: 0 },
      { id: 'node-2', name: 'Node 1', x: 150, y: 150, z: 0 },
    ],
    graphEdges: [
      { id: 'edge-1', fromNodeId: 'node-1', toNodeId: 'node-2', bidirectional: true },
    ],
    graphSequence: ['node-1', 'node-2'],
  };

  it('renders canvas editor with node and edge statistics', () => {
    render(<GraphRouteCanvas config={defaultConfig} onChange={vi.fn()} />);

    expect(screen.getByText(/Route Graph Editor/i)).toBeInTheDocument();
    expect(screen.getByText(/Graph:/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // 2 nodes
    expect(screen.getByText('1')).toBeInTheDocument(); // 1 edge
  });

  it('shows empty hint when no nodes exist', () => {
    const emptyConfig: PointVariableConfig = {
      ...defaultConfig,
      graphNodes: [],
      graphEdges: [],
    };

    render(<GraphRouteCanvas config={emptyConfig} onChange={vi.fn()} />);

    expect(screen.getByText(/Click anywhere on the boundary plane to set the first route point/i)).toBeInTheDocument();
  });

  it('allows tool mode switching between Add, Connect, Select, and Delete', () => {
    render(<GraphRouteCanvas config={defaultConfig} onChange={vi.fn()} />);

    const connectBtn = screen.getByRole('button', { name: /Connect Nodes/i });
    fireEvent.click(connectBtn);

    const deleteBtn = screen.getByRole('button', { name: /Delete/i });
    fireEvent.click(deleteBtn);
  });

  it('renders obstacle forbidden zone warnings when obstacles are present in config', () => {
    const obstacleConfig: PointVariableConfig = {
      ...defaultConfig,
      obstacles: [
        {
          id: 'obs-1',
          name: 'Forbidden Red Zone',
          type: 'OBSTACLE_POLYGON',
          points: [
            { x: -50, y: -50 },
            { x: 50, y: -50 },
            { x: 50, y: 50 },
            { x: -50, y: 50 },
          ],
          enabled: true,
        },
      ],
    };

    render(<GraphRouteCanvas config={obstacleConfig} onChange={vi.fn()} />);
    expect(screen.getByText(/Route Graph Editor/i)).toBeInTheDocument();
  });

  it('allows toggling full screen mode and coordinate labels', () => {
    render(<GraphRouteCanvas config={defaultConfig} onChange={vi.fn()} />);

    const labelsBtn = screen.getByRole('button', { name: /Labels/i });
    expect(labelsBtn).toBeInTheDocument();
    fireEvent.click(labelsBtn);

    const fullscreenBtn = screen.getByRole('button', { name: /Fullscreen/i });
    expect(fullscreenBtn).toBeInTheDocument();
    fireEvent.click(fullscreenBtn);

    expect(screen.getByRole('button', { name: /Exit Fullscreen/i })).toBeInTheDocument();
  });

  it('renders the fullscreen editor directly in the body, so app panels cannot cover it', () => {
    // A positioned, z-indexed ancestor (like the point config card) would trap a fixed child below the app bars
    const { container } = render(
      <div style={{ position: 'relative', zIndex: 0 }}>
        <GraphRouteCanvas config={defaultConfig} onChange={vi.fn()} />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: /Fullscreen/i }));

    const exitBtn = screen.getByRole('button', { name: /Exit Fullscreen/i });
    const panel = exitBtn.closest('.fixed');
    expect(panel?.parentElement).toBe(document.body);
    expect(container.contains(exitBtn)).toBe(false);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.contains(screen.getByRole('button', { name: /^Fullscreen$/i }))).toBe(true);
  });

  it('enforces boundary compliance when boundaryPolygon is defined', () => {
    const boundaryConfig: PointVariableConfig = {
      ...defaultConfig,
      boundaryPolygon: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
    };

    render(<GraphRouteCanvas config={boundaryConfig} onChange={vi.fn()} />);
    expect(screen.getByText(/Route Graph Editor/i)).toBeInTheDocument();
  });

  // Nodes inside the default cartesian region (0..100). In jsdom the plane is 320x340 px with its
  // origin at (0, 0), so node (50, 50) is drawn at pixel (160, 170).
  const inBoundsConfig: PointVariableConfig = {
    ...defaultConfig,
    graphNodes: [
      { id: 'node-1', name: 'Node 0', x: 50, y: 50, z: 0 },
      { id: 'node-2', name: 'Node 1', x: 80, y: 20, z: 0 },
    ],
  };

  it('deletes a clicked node in Delete mode without adding a new one', () => {
    const onChange = vi.fn();
    render(<GraphRouteCanvas config={inBoundsConfig} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));
    fireEvent.click(screen.getByTestId('graph-node-node-1'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const update = onChange.mock.calls[0][0];
    expect(update.graphNodes.map((n: { id: string }) => n.id)).toEqual(['node-2']);
    expect(update.graphEdges).toEqual([]);
  });

  it('does not add a node when clicking empty space in Select / Move mode', () => {
    const onChange = vi.fn();
    render(<GraphRouteCanvas config={inBoundsConfig} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Select \/ Move/i }));
    expect(screen.getByText(/Drag a node to move it/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('graph-plane'), { clientX: 100, clientY: 100 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds a node when clicking empty space in Add & Extend mode', () => {
    const onChange = vi.fn();
    render(<GraphRouteCanvas config={inBoundsConfig} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('graph-plane'), { clientX: 100, clientY: 100 });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].graphNodes).toHaveLength(3);
  });

  it('never repeats a node name after a node was deleted', () => {
    const onChange = vi.fn();
    const named = inBoundsConfig.graphNodes!.map((n, i) => ({ ...n, name: i === 0 ? 'Node 0' : 'Node 2' }));
    render(<GraphRouteCanvas config={{ ...inBoundsConfig, graphNodes: named }} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('graph-plane'), { clientX: 100, clientY: 100 });

    const names = onChange.mock.calls[0][0].graphNodes.map((n: { name: string }) => n.name);
    expect(names).toEqual(['Node 0', 'Node 2', 'Node 3']);
  });

  it('moves a dragged node with a single onChange on pointer up', () => {
    const onChange = vi.fn();
    render(<GraphRouteCanvas config={inBoundsConfig} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Select \/ Move/i }));

    const node = screen.getByTestId('graph-node-node-1');
    fireEvent.pointerDown(node, { pointerId: 1, button: 0, clientX: 160, clientY: 170 });
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 180, clientY: 170 });
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 200, clientY: 170 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(node, { pointerId: 1, clientX: 200, clientY: 170 });
    fireEvent.click(node);

    expect(onChange).toHaveBeenCalledTimes(1);
    const moved = onChange.mock.calls[0][0].graphNodes.find((n: { id: string }) => n.id === 'node-1');
    expect(moved.x).toBeCloseTo(67.7, 1);
    expect(moved.y).toBeCloseTo(50, 1);
  });

  it('treats a press that moves less than the threshold as a click, not a drag', () => {
    const onChange = vi.fn();
    render(<GraphRouteCanvas config={inBoundsConfig} onChange={onChange} />);

    const node = screen.getByTestId('graph-node-node-2');
    fireEvent.pointerDown(node, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 102, clientY: 101 });
    fireEvent.pointerUp(node, { pointerId: 1, clientX: 102, clientY: 101 });
    fireEvent.click(node);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects a drag that leaves the region and keeps the node in place', () => {
    const onChange = vi.fn();
    render(<GraphRouteCanvas config={{ ...inBoundsConfig, maxPoint: { x: 60, y: 100 } }} onChange={onChange} />);

    const node = screen.getByTestId('graph-node-node-1');
    fireEvent.pointerDown(node, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 300, clientY: 0 });
    fireEvent.pointerUp(node, { pointerId: 1, clientX: 300, clientY: 0 });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/outside allowed boundary limits/i)).toBeInTheDocument();
  });

  it('renders geospatial nodes as map markers with lat/lon inputs', () => {
    const geoConfig: PointVariableConfig = {
      ...defaultConfig,
      coordinateSystem: 'GEOSPATIAL',
      graphNodes: [{ id: 'node-1', name: 'Node 0', x: 40.42, y: -3.7, z: 0 }],
      graphEdges: [],
      graphSequence: ['node-1'],
    };
    const { container } = render(<GraphRouteCanvas config={geoConfig} onChange={vi.fn()} />);

    expect(container.querySelectorAll('.custom-graph-node-marker')).toHaveLength(1);
    expect(screen.getByLabelText('Node latitude')).toHaveValue('40.42');
  });

  it('commits a typed coordinate once on blur, not on every keystroke', () => {
    const onChange = vi.fn();
    render(<GraphRouteCanvas config={inBoundsConfig} onChange={onChange} />);

    const xInput = screen.getByLabelText('Node X');
    fireEvent.change(xInput, { target: { value: '-' } });
    fireEvent.change(xInput, { target: { value: '6' } });
    fireEvent.change(xInput, { target: { value: '60.' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(xInput);
    expect(onChange).toHaveBeenCalledTimes(1);
    const moved = onChange.mock.calls[0][0].graphNodes.find((n: { id: string }) => n.id === 'node-1');
    expect(moved.x).toBe(60);
  });
});


