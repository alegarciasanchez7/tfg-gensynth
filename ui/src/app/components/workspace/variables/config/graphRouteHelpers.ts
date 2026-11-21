import type { GraphEdge, GraphNode, Point3DCoord } from '../../../../types';
import { centerOf } from '../../../../core/pointDefaults';

/** Initial centre of the Leaflet map: the polygon bounds centre, else the first node, else the bounds centre. */
export function geoCenterFor(
  polygon: Point3DCoord[],
  nodes: GraphNode[],
  minPoint: Point3DCoord,
  maxPoint: Point3DCoord
): [number, number] {
  if (polygon.length >= 3) {
    const lats = polygon.map((p) => p.x ?? 0);
    const lons = polygon.map((p) => p.y ?? p.x ?? 0);
    return [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2];
  }
  if (nodes.length > 0) {
    return [nodes[0].x, nodes[0].y];
  }
  const c = centerOf(minPoint, maxPoint);
  return [c.x, c.y];
}

/** The graph without a node: its edges and its entries in the sequence are removed too. */
export function removeNodeFromGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  sequence: string[],
  nodeId: string
): { graphNodes: GraphNode[]; graphEdges: GraphEdge[]; graphSequence: string[] } {
  return {
    graphNodes: nodes.filter((n) => n.id !== nodeId),
    graphEdges: edges.filter((edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId),
    graphSequence: sequence.filter((id) => id !== nodeId),
  };
}

/** Whether an edge already joins two nodes, in either direction. */
export function edgeExistsBetween(edges: GraphEdge[], a: string, b: string): boolean {
  return edges.some(
    (edge) => (edge.fromNodeId === a && edge.toNodeId === b) || (edge.toNodeId === a && edge.fromNodeId === b)
  );
}
