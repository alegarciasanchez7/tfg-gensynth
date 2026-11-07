import type { CoordinateSystem, Point3DCoord, PointVariableConfig } from '../types';

/** A point with every coordinate set. */
export type FullPoint = Required<Point3DCoord>;

/**
 * Default region of a point variable for each coordinate system, used wherever a point has no
 * bounds yet. Geospatial points use x = latitude, y = longitude and z = altitude (metres),
 * like the Core.
 */
export function defaultBoundsFor(system: CoordinateSystem | undefined): { minPoint: FullPoint; maxPoint: FullPoint } {
  if (system === 'GEOSPATIAL') {
    // A city-sized area (Madrid): a valid lat/lon region that the map can show at street level
    return { minPoint: { x: 40.3, y: -3.8, z: 0 }, maxPoint: { x: 40.55, y: -3.55, z: 100 } };
  }
  return { minPoint: { x: 0, y: 0, z: 0 }, maxPoint: { x: 100, y: 100, z: 100 } };
}

/** Centre of a region. */
export function centerOf(minPoint: Point3DCoord, maxPoint: Point3DCoord): FullPoint {
  return {
    x: ((minPoint.x ?? 0) + (maxPoint.x ?? 0)) / 2,
    y: ((minPoint.y ?? 0) + (maxPoint.y ?? 0)) / 2,
    z: ((minPoint.z ?? 0) + (maxPoint.z ?? 0)) / 2,
  };
}

const isCartesian = (system: CoordinateSystem | undefined) => system !== 'GEOSPATIAL';

const sameCoords = (a: Point3DCoord | undefined, b: Point3DCoord) =>
  !!a && a.x === b.x && a.y === b.y && (a.z ?? 0) === b.z;

/**
 * Config changes to switch a point variable to another coordinate system, and the user data the
 * switch would discard (to ask for confirmation first).
 *
 * - 2D ↔ 3D share units: everything is kept, except the route graph when moving to 3D (no Graph
 *   Route there), which falls back to Random Point.
 * - Cartesian ↔ Geospatial use incompatible units: bounds go back to the defaults of the new
 *   system, the region, obstacles, graph and fixed point are reset, and step/radius values are
 *   adapted to the new units.
 *
 * `confirmMessage` explains why the lost data is reset, and is only set when something is lost.
 */
export function coordinateSystemSwitch(
  config: PointVariableConfig,
  target: CoordinateSystem,
): { updates: Partial<PointVariableConfig>; lost: string[]; confirmMessage?: string } {
  const source = config.coordinateSystem ?? 'CARTESIAN_3D';
  const lost: string[] = [];
  const updates: Partial<PointVariableConfig> = { coordinateSystem: target };
  if (source === target) return { updates: {}, lost };

  const withMessage = (reason: string) => (lost.length === 0
    ? { updates, lost }
    : { updates, lost, confirmMessage: `${reason}, so ${joinList(lost)} will be reset. Continue?` });

  const graphNodes = config.graphNodes?.length ?? 0;
  const clearGraph = () => {
    if (graphNodes > 0) lost.push(`the route graph (${graphNodes} nodes)`);
    Object.assign(updates, { graphNodes: [], graphEdges: [], graphSequence: [] });
  };

  if (isCartesian(source) && isCartesian(target)) {
    if (target === 'CARTESIAN_3D' && config.pattern === 'GRAPH_ROUTE') {
      clearGraph();
      updates.pattern = 'RANDOM_POINT';
    }
    return withMessage('Graph Route is not available in 3D Cartesian');
  }

  const oldDefaults = defaultBoundsFor(source);
  if ((config.boundaryPolygon?.length ?? 0) >= 3) lost.push('the region polygon');
  if ((config.obstacles?.length ?? 0) > 0) lost.push(`${config.obstacles?.length} obstacle(s)`);
  if ((config.minPoint && !sameCoords(config.minPoint, oldDefaults.minPoint))
      || (config.maxPoint && !sameCoords(config.maxPoint, oldDefaults.maxPoint))) {
    lost.push('the region bounds');
  }
  // The fixed point a previous switch placed at the centre of the defaults is not user data
  if (config.fixedPoint && !sameCoords(config.fixedPoint, centerOf(oldDefaults.minPoint, oldDefaults.maxPoint))) {
    lost.push('the fixed point');
  }
  if ((config.waypoints?.length ?? 0) > 0) lost.push('the waypoints');
  if (config.orbitCenter) lost.push('the orbit centre');
  clearGraph();

  const { minPoint, maxPoint } = defaultBoundsFor(target);
  const toGeo = target === 'GEOSPATIAL';
  Object.assign(updates, {
    minPoint,
    maxPoint,
    boundaryPolygon: [],
    obstacles: [],
    fixedPoint: centerOf(minPoint, maxPoint),
    waypoints: [],
    orbitCenter: undefined,
    // Step sizes are in coordinate units: degrees in Geospatial
    maxStepDistance: toGeo ? 0.0005 : 10,
    orbitRadius: toGeo ? 0.01 : 10,
    jitterRadius: 0,
  });
  if (target === 'CARTESIAN_3D' && config.pattern === 'GRAPH_ROUTE') updates.pattern = 'RANDOM_POINT';
  return withMessage('The new coordinate system uses different units');
}

/** "a", "a and b", "a, b and c". */
function joinList(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0];
}
