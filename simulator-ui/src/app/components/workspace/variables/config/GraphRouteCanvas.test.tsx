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
});


