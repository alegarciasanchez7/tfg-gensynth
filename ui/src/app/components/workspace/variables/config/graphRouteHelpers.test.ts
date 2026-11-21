import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '../../../../types';
import { edgeExistsBetween, geoCenterFor, removeNodeFromGraph } from './graphRouteHelpers';

const nodes: GraphNode[] = [
  { id: 'a', x: 1, y: 2 },
  { id: 'b', x: 3, y: 4 },
  { id: 'c', x: 5, y: 6 },
];
const edges: GraphEdge[] = [
  { id: 'e1', fromNodeId: 'a', toNodeId: 'b' },
  { id: 'e2', fromNodeId: 'b', toNodeId: 'c' },
];

describe('geoCenterFor', () => {
  it('uses the centre of the polygon bounds when there is a polygon', () => {
    const polygon = [{ x: 0, y: 10 }, { x: 4, y: 20 }, { x: 2 }];
    // The vertex without y falls back to its x for the longitude
    expect(geoCenterFor(polygon, nodes, { x: -50, y: -50 }, { x: 50, y: 50 })).toEqual([2, 11]);
  });

  it('uses the first node when there is no polygon', () => {
    expect(geoCenterFor([], nodes, { x: -50, y: -50 }, { x: 50, y: 50 })).toEqual([1, 2]);
  });

  it('uses the centre of the bounds when there are no polygon and no nodes', () => {
    expect(geoCenterFor([], [], { x: 10, y: 20 }, { x: 30, y: 40 })).toEqual([20, 30]);
  });
});

describe('removeNodeFromGraph', () => {
  it('removes the node, its edges and its sequence entries', () => {
    expect(removeNodeFromGraph(nodes, edges, ['a', 'b', 'c', 'b'], 'b')).toEqual({
      graphNodes: [nodes[0], nodes[2]],
      graphEdges: [],
      graphSequence: ['a', 'c'],
    });
  });

  it('keeps the edges that do not touch the node', () => {
    const result = removeNodeFromGraph(nodes, edges, [], 'a');
    expect(result.graphEdges).toEqual([edges[1]]);
  });
});

describe('edgeExistsBetween', () => {
  it('finds an edge in either direction', () => {
    expect(edgeExistsBetween(edges, 'a', 'b')).toBe(true);
    expect(edgeExistsBetween(edges, 'b', 'a')).toBe(true);
  });

  it('is false when no edge joins the nodes', () => {
    expect(edgeExistsBetween(edges, 'a', 'c')).toBe(false);
  });
});
