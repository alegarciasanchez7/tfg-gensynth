import { useSyncExternalStore } from 'react';

/**
 * Colours of the point editors' drawing surfaces (2D plane, 3D view, route and waypoint editors,
 * and the maps when they have no tiles) that depend on the background. The colours of regions,
 * obstacles and routes are the same in both themes.
 */
export interface CanvasPalette {
  background: string;
  /** Background of the 3D view and of the route and waypoint maps, a little deeper than the 2D plane in the dark theme. */
  deepBackground: string;
  grid: string;
  /** Lat/lon grid drawn on the maps when there are no tiles (offline). */
  mapGrid: string;
  /** Ground mesh of the 3D view. */
  grid3D: string;
  gridLabel: string;
  gridLabel3D: string;
  axisX: string;
  axisY: string;
  axisZ: string;
  /** Lines with the most contrast against the background (dashed selection outlines, selected rings). */
  ink: string;
  /** Box behind a coordinate tooltip, and its text. */
  tooltipBackground: string;
  tooltipText: string;
  /** Dashed outline of the region's bounds box. */
  boundsBox: string;
  /** Selected wall or obstacle. */
  selection: string;
  /** Route and waypoint path. */
  path: string;
  /** Inside of a waypoint dot, and its number. */
  waypointDot: string;
  waypointNumber: string;
  invalidWaypointNumber: string;
  /** Text next to the 3D handles while they are hovered or dragged. */
  cornerLabel: string;
  radiusLabel: string;
  heightLabel: string;
  /** Mode line at the top of the 3D view. */
  statusText: string;
  orbitStatusText: string;
}

export const DARK_CANVAS_PALETTE: CanvasPalette = {
  background: '#0f172a',
  deepBackground: '#090d16',
  grid: '#1e293b',
  mapGrid: '#334155',
  grid3D: 'rgba(255, 255, 255, 0.07)',
  gridLabel: '#94a3b8',
  gridLabel3D: '#475569',
  axisX: '#ef4444',
  axisY: '#22c55e',
  axisZ: '#06b6d4',
  ink: '#ffffff',
  tooltipBackground: '#0f172a',
  tooltipText: '#ffffff',
  boundsBox: 'rgba(148, 163, 184, 0.45)',
  selection: '#fbbf24',
  path: '#22d3ee',
  waypointDot: '#0f172a',
  waypointNumber: '#a5f3fc',
  invalidWaypointNumber: '#fecdd3',
  cornerLabel: '#fef08a',
  radiusLabel: '#bae6fd',
  heightLabel: '#f5d0fe',
  statusText: '#94a3b8',
  orbitStatusText: '#38bdf8',
};

export const LIGHT_CANVAS_PALETTE: CanvasPalette = {
  background: '#f8fafc',
  deepBackground: '#f8fafc',
  grid: '#e2e8f0',
  mapGrid: '#cbd5e1',
  grid3D: 'rgba(15, 23, 42, 0.09)',
  gridLabel: '#64748b',
  gridLabel3D: '#94a3b8',
  axisX: '#dc2626',
  axisY: '#16a34a',
  axisZ: '#0891b2',
  ink: '#0f172a',
  tooltipBackground: '#ffffff',
  tooltipText: '#0f172a',
  boundsBox: 'rgba(100, 116, 139, 0.6)',
  selection: '#d97706',
  path: '#0891b2',
  waypointDot: '#ffffff',
  waypointNumber: '#0e7490',
  invalidWaypointNumber: '#be123c',
  cornerLabel: '#a16207',
  radiusLabel: '#0369a1',
  heightLabel: '#a21caf',
  statusText: '#64748b',
  orbitStatusText: '#0284c7',
};

/** Whether the app shows the dark theme (the `dark` class on the root element). */
function isDarkTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

/** Palette of the current theme; the component renders again when the theme changes. */
export function useCanvasPalette(): CanvasPalette {
  const dark = useSyncExternalStore(subscribeToTheme, isDarkTheme, isDarkTheme);
  return dark ? DARK_CANVAS_PALETTE : LIGHT_CANVAS_PALETTE;
}
