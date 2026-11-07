import { describe, expect, it } from 'vitest';
import { centerOf, defaultBoundsFor } from './pointDefaults';

describe('pointDefaults', () => {
  it('uses 0..100 on every axis for cartesian systems', () => {
    for (const system of ['CARTESIAN_2D', 'CARTESIAN_3D', undefined] as const) {
      expect(defaultBoundsFor(system)).toEqual({ minPoint: { x: 0, y: 0, z: 0 }, maxPoint: { x: 100, y: 100, z: 100 } });
    }
  });

  it('uses a valid lat/lon region for geospatial points', () => {
    const { minPoint, maxPoint } = defaultBoundsFor('GEOSPATIAL');
    expect(minPoint.x).toBeGreaterThanOrEqual(-90);
    expect(maxPoint.x).toBeLessThanOrEqual(90);
    expect(minPoint.y).toBeGreaterThanOrEqual(-180);
    expect(maxPoint.y).toBeLessThanOrEqual(180);
    expect(minPoint.x).toBeLessThan(maxPoint.x);
    expect(minPoint.y).toBeLessThan(maxPoint.y);
  });

  it('computes the centre of a region', () => {
    expect(centerOf({ x: 0, y: 10, z: 0 }, { x: 100, y: 30, z: 50 })).toEqual({ x: 50, y: 20, z: 25 });
  });
});

import { coordinateSystemSwitch } from './pointDefaults';
import type { PointVariableConfig } from '../types';

describe('coordinateSystemSwitch', () => {
  const polygon = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }];

  it('keeps the region between 2D and 3D', () => {
    const config: PointVariableConfig = { coordinateSystem: 'CARTESIAN_2D', boundaryPolygon: polygon, pattern: 'RANDOM_WALK' };
    expect(coordinateSystemSwitch(config, 'CARTESIAN_3D')).toEqual({ updates: { coordinateSystem: 'CARTESIAN_3D' }, lost: [] });
  });

  it('drops the route graph when moving a Graph Route to 3D, saying Graph Route is 2D only', () => {
    const config: PointVariableConfig = {
      coordinateSystem: 'CARTESIAN_2D', pattern: 'GRAPH_ROUTE', graphNodes: [{ id: 'a', name: 'A', x: 1, y: 1, z: 0 }],
    };
    const { updates, lost, confirmMessage } = coordinateSystemSwitch(config, 'CARTESIAN_3D');
    expect(updates).toMatchObject({ pattern: 'RANDOM_POINT', graphNodes: [] });
    expect(lost).toEqual(['the route graph (1 nodes)']);
    expect(confirmMessage).toBe('Graph Route is not available in 3D Cartesian, so the route graph (1 nodes) will be reset. Continue?');
  });

  it('blames the units when moving between Cartesian and Geospatial', () => {
    const config: PointVariableConfig = { coordinateSystem: 'CARTESIAN_2D', boundaryPolygon: polygon, waypoints: [{ x: 1, y: 1 }] };
    expect(coordinateSystemSwitch(config, 'GEOSPATIAL').confirmMessage).toBe(
      'The new coordinate system uses different units, so the region polygon and the waypoints will be reset. Continue?',
    );
  });

  it('resets units-dependent data when moving to Geospatial', () => {
    const config: PointVariableConfig = {
      coordinateSystem: 'CARTESIAN_2D', boundaryPolygon: polygon, obstacles: [{ id: 'o', type: 'OBSTACLE_POLYGON', name: 'O', points: polygon }],
      minPoint: { x: 0, y: 0, z: 0 }, maxPoint: { x: 500, y: 100, z: 100 }, maxStepDistance: 10,
    };
    const { updates, lost } = coordinateSystemSwitch(config, 'GEOSPATIAL');
    expect(updates.minPoint).toEqual(defaultBoundsFor('GEOSPATIAL').minPoint);
    expect(updates).toMatchObject({ boundaryPolygon: [], obstacles: [], maxStepDistance: 0.0005 });
    expect(lost).toEqual(['the region polygon', '1 obstacle(s)', 'the region bounds']);
  });

  it('does not ask when only default values would change', () => {
    const config: PointVariableConfig = { coordinateSystem: 'GEOSPATIAL', ...defaultBoundsFor('GEOSPATIAL') };
    expect(coordinateSystemSwitch(config, 'CARTESIAN_2D').lost).toEqual([]);
  });

  it('does not ask again after a switch that only placed default values', () => {
    const first = coordinateSystemSwitch({ coordinateSystem: 'GEOSPATIAL' }, 'CARTESIAN_2D').updates;
    const back = coordinateSystemSwitch({ coordinateSystem: 'CARTESIAN_2D', ...first }, 'GEOSPATIAL');
    expect(back.lost).toEqual([]);
  });
});
