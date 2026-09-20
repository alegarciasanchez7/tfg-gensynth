import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GraphNode, GraphEdge, PointVariableConfig, BoundaryObstacle, Point3DCoord } from '../../../../types';
import { Button } from '../../../ui/button';
import { Label } from '../../../ui/label';
import { Info, Plus, Link as LinkIcon, Trash2, RotateCcw, Move, MapPin, AlertTriangle, X, WifiOff, Maximize2, Minimize2, Eye, EyeOff } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../../../ui/tooltip';
import {
  MapContainer,
  TileLayer,
  Polygon as LeafletPolygon,
  Marker as LeafletMarker,
  Polyline as LeafletPolyline,
  Tooltip as LeafletTooltip,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default Leaflet marker icon URLs for React bundler
if (typeof L !== 'undefined' && L.Icon && L.Icon.Default) {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
}

interface GraphRouteCanvasProps {
  config: PointVariableConfig;
  onChange: (newConfig: Partial<PointVariableConfig>) => void;
}

/** Ray-casting algorithm to test if point (px, py) lies inside obstacle polygon */
const isPointInPolygon = (px: number, py: number, points: Point3DCoord[]): boolean => {
  if (!points || points.length < 3) return false;
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i].x ?? 0;
    const yi = points[i].y ?? 0;
    const xj = points[j].x ?? 0;
    const yj = points[j].y ?? 0;
    const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

/** Counter-clockwise orienting helper for 2D line segment intersection */
const ccw = (p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }): boolean => {
  return (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
};

/** Returns true if line segment p1-p2 intersects line segment q1-q2 */
const segmentsIntersect = (
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  q1: { x: number; y: number },
  q2: { x: number; y: number }
): boolean => {
  return (
    ccw(p1, q1, q2) !== ccw(p2, q1, q2) &&
    ccw(p1, p2, q1) !== ccw(p1, p2, q2)
  );
};

/** Evaluates collision between candidate node/edge and active forbidden obstacle zones or wall segments */
const checkObstacleCollision = (
  fromNode: { x: number; y: number } | null,
  targetPoint: { x: number; y: number },
  obstacles: BoundaryObstacle[]
): string | null => {
  const activeObstacles = (obstacles || []).filter((obs) => obs.enabled && obs.points && obs.points.length > 0);

  for (const obs of activeObstacles) {
    const pts = obs.points;
    const name = obs.name || (obs.type === 'WALL_SEGMENT' ? 'Wall Segment' : 'Forbidden Zone');
    const getPt = (p: Point3DCoord) => ({ x: p.x ?? 0, y: p.y ?? 0 });

    // 1. Check if target node point lies inside forbidden region polygon
    if (obs.type !== 'WALL_SEGMENT' && pts.length >= 3) {
      if (isPointInPolygon(targetPoint.x, targetPoint.y, pts)) {
        return `Cannot place route node inside forbidden obstacle zone: "${name}"`;
      }
    }

    // 2. Check if connecting edge intersects wall segments or obstacle polygon edges
    if (fromNode) {
      if (obs.type === 'WALL_SEGMENT' && pts.length >= 2) {
        for (let i = 0; i < pts.length - 1; i++) {
          if (segmentsIntersect(fromNode, targetPoint, getPt(pts[i]), getPt(pts[i + 1]))) {
            return `Cannot draw route edge crossing forbidden wall barrier: "${name}"`;
          }
        }
      } else if (pts.length >= 3) {
        for (let i = 0; i < pts.length; i++) {
          const nextIdx = (i + 1) % pts.length;
          if (segmentsIntersect(fromNode, targetPoint, getPt(pts[i]), getPt(pts[nextIdx]))) {
            return `Cannot draw route edge crossing forbidden obstacle region: "${name}"`;
          }
        }
      }
    }
  }

  return null;
};

/** Evaluates compliance of candidate node/edge against allowed boundary polygon and bounding limits */
const checkBoundaryCompliance = (
  fromNode: { x: number; y: number } | null,
  targetPoint: { x: number; y: number },
  polygon: Point3DCoord[],
  minPoint?: Point3DCoord,
  maxPoint?: Point3DCoord
): string | null => {
  const getPt = (p: Point3DCoord) => ({ x: p.x ?? 0, y: p.y ?? (p.x ?? 0) });

  // 1. Check if allowed boundary polygon is defined (>= 3 points)
  if (polygon && polygon.length >= 3) {
    const isInside = isPointInPolygon(targetPoint.x, targetPoint.y, polygon);
    if (!isInside) {
      return 'Cannot place route node outside the allowed boundary region.';
    }

    if (fromNode) {
      const fromInside = isPointInPolygon(fromNode.x, fromNode.y, polygon);
      if (!fromInside) {
        return 'Cannot draw route edge from an origin node located outside the allowed boundary region.';
      }
      // Check if connecting line segment intersects any edge of the boundary polygon
      for (let i = 0; i < polygon.length; i++) {
        const nextIdx = (i + 1) % polygon.length;
        if (segmentsIntersect(fromNode, targetPoint, getPt(polygon[i]), getPt(polygon[nextIdx]))) {
          return 'Cannot draw route edge exiting the allowed boundary region.';
        }
      }
    }
  } else if (minPoint && maxPoint && minPoint.x !== undefined && maxPoint.x !== undefined && (minPoint.x !== -100 || maxPoint.x !== 100)) {
    // Bounding Box check when custom minPoint / maxPoint limits are specified
    const minX = minPoint.x ?? -100;
    const maxX = maxPoint.x ?? 100;
    const minY = minPoint.y ?? -100;
    const maxY = maxPoint.y ?? 100;

    if (targetPoint.x < minX || targetPoint.x > maxX || targetPoint.y < minY || targetPoint.y > maxY) {
      return `Cannot place route node outside allowed boundary limits.`;
    }

    if (fromNode) {
      if (fromNode.x < minX || fromNode.x > maxX || fromNode.y < minY || fromNode.y > maxY) {
        return `Cannot draw route edge from an origin node outside allowed boundary limits.`;
      }
    }
  }

  return null;
};

/** Unified validator evaluating both allowed boundary compliance and forbidden obstacle collisions */
const validateNodeAndEdge = (
  fromNode: { x: number; y: number } | null,
  targetPoint: { x: number; y: number },
  obstacles: BoundaryObstacle[],
  polygon: Point3DCoord[],
  minPoint?: Point3DCoord,
  maxPoint?: Point3DCoord
): string | null => {
  const boundaryError = checkBoundaryCompliance(fromNode, targetPoint, polygon, minPoint, maxPoint);
  if (boundaryError) return boundaryError;

  const obstacleError = checkObstacleCollision(fromNode, targetPoint, obstacles);
  if (obstacleError) return obstacleError;

  return null;
};

// Technical Lat/Lon Coordinate Grid Layer for Offline Fallback Mode in Leaflet Map
function OfflineGridOverlay() {
  const map = useMap();
  const [gridItems, setGridItems] = useState<{ positions: [number, number][]; label: string }[]>([]);

  useEffect(() => {
    const updateGrid = () => {
      const b = map.getBounds();
      const z = map.getZoom();
      let step = 1.0;
      if (z >= 13) step = 0.01;
      else if (z >= 11) step = 0.05;
      else if (z >= 9) step = 0.1;
      else if (z >= 7) step = 0.5;
      else if (z >= 5) step = 1.0;
      else step = 5.0;

      const items: { positions: [number, number][]; label: string }[] = [];
      const minLat = Math.max(-85, Math.floor(b.getSouth() / step) * step);
      const maxLat = Math.min(85, Math.ceil(b.getNorth() / step) * step);
      const minLon = Math.max(-180, Math.floor(b.getWest() / step) * step);
      const maxLon = Math.min(180, Math.ceil(b.getEast() / step) * step);

      for (let lat = minLat; lat <= maxLat; lat += step) {
        const rLat = Math.round(lat * 10000) / 10000;
        items.push({
          positions: [[rLat, -180], [rLat, 180]],
          label: `${rLat}° ${rLat >= 0 ? 'N' : 'S'}`,
        });
      }
      for (let lon = minLon; lon <= maxLon; lon += step) {
        const rLon = Math.round(lon * 10000) / 10000;
        items.push({
          positions: [[-85, rLon], [85, rLon]],
          label: `${rLon}° ${rLon >= 0 ? 'E' : 'W'}`,
        });
      }
      setGridItems(items);
    };

    updateGrid();
    map.on('moveend zoomend', updateGrid);
    return () => {
      map.off('moveend zoomend', updateGrid);
    };
  }, [map]);

  return (
    <>
      {gridItems.map((item, idx) => (
        <LeafletPolyline
          key={idx}
          positions={item.positions}
          pathOptions={{
            color: '#334155',
            weight: 1,
            dashArray: '3, 3',
            interactive: false,
          }}
        />
      ))}
    </>
  );
}

/** Leaflet Map Click Handler Component for adding nodes & setting warnings */
function GraphMapEventsHandler({
  activeTool,
  nodes,
  selectedNodeId,
  obstacles,
  polygon,
  minPoint,
  maxPoint,
  onAddNode,
  onWarning,
}: {
  activeTool: 'ADD_EXTEND' | 'CONNECT' | 'SELECT' | 'DELETE';
  nodes: GraphNode[];
  selectedNodeId: string | null;
  obstacles: BoundaryObstacle[];
  polygon: Point3DCoord[];
  minPoint: Point3DCoord;
  maxPoint: Point3DCoord;
  onAddNode: (lat: number, lon: number) => void;
  onWarning: (msg: string | null) => void;
}) {
  useMapEvents({
    click(e) {
      if (activeTool !== 'ADD_EXTEND') return;
      const lat = Math.round(e.latlng.lat * 10000) / 10000;
      const lon = Math.round(e.latlng.lng * 10000) / 10000;

      const originId = selectedNodeId || (nodes.length > 0 ? nodes[nodes.length - 1].id : null);
      const originNode = nodes.find((n) => n.id === originId) || null;

      const valError = validateNodeAndEdge(originNode, { x: lat, y: lon }, obstacles, polygon, minPoint, maxPoint);
      if (valError) {
        onWarning(valError);
        return;
      }
      onWarning(null);
      onAddNode(lat, lon);
    },
  });
  return null;
}

/** Helper component to invalidate Leaflet map size on container or fullscreen state resize */
function GraphMapResizeHandler({ isFullScreen }: { isFullScreen: boolean }) {
  const map = useMap();

  useEffect(() => {
    const invalidate = () => {
      map.invalidateSize();
    };

    invalidate();
    const timer = setTimeout(invalidate, 150);

    const container = map.getContainer();
    let observer: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        map.invalidateSize();
      });
      observer.observe(container);
    }

    return () => {
      clearTimeout(timer);
      if (observer) observer.disconnect();
    };
  }, [isFullScreen, map]);

  return null;
}

/** Helper component to fit map bounds to selected boundary polygon or min/max points */
function GraphMapAutoFit({ polygon, minPoint, maxPoint }: { polygon: Point3DCoord[]; minPoint: Point3DCoord; maxPoint: Point3DCoord }) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (!hasFittedRef.current) {
      hasFittedRef.current = true;
      if (polygon && polygon.length >= 3) {
        const bounds = L.latLngBounds(polygon.map((p) => [p.x ?? 0, p.y ?? p.x ?? 0]));
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [35, 35], maxZoom: 17, animate: false });
        }
      } else if (minPoint && maxPoint && minPoint.x !== undefined && maxPoint.x !== undefined && (minPoint.x !== -100 || maxPoint.x !== 100)) {
        const bounds = L.latLngBounds([
          [minPoint.x ?? 40.0, minPoint.y ?? -4.0],
          [maxPoint.x ?? 41.0, maxPoint.y ?? -3.0],
        ]);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [35, 35], maxZoom: 17, animate: false });
        }
      }
    }
  }, [map, polygon, minPoint, maxPoint]);

  return null;
}

export const GraphRouteCanvas: React.FC<GraphRouteCanvasProps> = ({ config, onChange }) => {
  const nodes: GraphNode[] = config.graphNodes ?? [];
  const edges: GraphEdge[] = config.graphEdges ?? [];
  const sequence: string[] = config.graphSequence ?? [];

  const minPoint = config.minPoint ?? { x: -100, y: -100 };
  const maxPoint = config.maxPoint ?? { x: 100, y: 100 };
  const polygon = config.boundaryPolygon ?? [];
  const obstacles = config.obstacles ?? [];

  const isGeo = config.coordinateSystem === 'GEOSPATIAL';

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(nodes[0]?.id ?? null);
  const [activeTool, setActiveTool] = useState<'ADD_EXTEND' | 'CONNECT' | 'SELECT' | 'DELETE'>('ADD_EXTEND');
  const [connectOriginId, setConnectOriginId] = useState<string | null>(null);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showCoordinateLabels, setShowCoordinateLabels] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Handle ESC key press to exit full screen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 700, h: 340 });

  useEffect(() => {
    if (!selectedNodeId && nodes.length > 0) {
      setSelectedNodeId(nodes[0].id);
    }
  }, [nodes, selectedNodeId]);

  // Responsive canvas size calculation
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      const h = isFullScreen ? Math.max(340, Math.floor(rect.height)) : 340;
      setCanvasSize({ w, h });
    };

    updateSize();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateSize);
      observer.observe(container);
      return () => observer.disconnect();
    }
  }, [isFullScreen]);

  // --- 2D CARTESIAN CANVAS PROJECTION MATH ---
  const canvasW = canvasSize.w;
  const canvasH = canvasSize.h;
  const margin = 36;
  const viewWidth = canvasW - margin * 2;
  const viewHeight = canvasH - margin * 2;

  // Auto-fit domain bounds precisely to selected region polygon or min/max points for 2D mode
  let baseMinX = minPoint.x ?? -100;
  let baseMaxX = maxPoint.x ?? 100;
  let baseMinY = minPoint.y ?? -100;
  let baseMaxY = maxPoint.y ?? 100;

  if (polygon && polygon.length >= 3) {
    const xs = polygon.map((p) => p.x ?? 0);
    const ys = polygon.map((p) => p.y ?? 0);
    baseMinX = Math.min(...xs);
    baseMaxX = Math.max(...xs);
    baseMinY = Math.min(...ys);
    baseMaxY = Math.max(...ys);
  }

  // 5% Viewport padding to ensure handles on region boundary are fully visible
  const spanXRaw = Math.abs(baseMaxX - baseMinX);
  const spanYRaw = Math.abs(baseMaxY - baseMinY);
  const padX = spanXRaw > 0 ? spanXRaw * 0.05 : 10;
  const padY = spanYRaw > 0 ? spanYRaw * 0.05 : 10;

  const minX = baseMinX - padX;
  const maxX = baseMaxX + padX;
  const minY = baseMinY - padY;
  const maxY = baseMaxY + padY;

  const spanX = Math.abs(maxX - minX) > 0 ? Math.abs(maxX - minX) : 200;
  const spanY = Math.abs(maxY - minY) > 0 ? Math.abs(maxY - minY) : 200;

  // Projection: Domain coordinate -> Canvas pixel (2D Mode)
  const toCanvasX = (val: number) => {
    return margin + ((val - minX) / spanX) * viewWidth;
  };

  const toCanvasY = (val: number) => {
    return canvasH - margin - ((val - minY) / spanY) * viewHeight;
  };

  // Inverse projection: Canvas pixel -> Domain coordinate (2D Mode)
  const fromCanvasX = (px: number) => {
    const raw = minX + ((px - margin) / viewWidth) * spanX;
    const clamped = Math.max(minX, Math.min(maxX, raw));
    return Math.round(clamped * 10) / 10;
  };

  const fromCanvasY = (py: number) => {
    const raw = minY + ((canvasH - margin - py) / viewHeight) * spanY;
    const clamped = Math.max(minY, Math.min(maxY, raw));
    return Math.round(clamped * 10) / 10;
  };

  // Render 2D Spatial Boundaries plane on HTML5 Canvas
  useEffect(() => {
    if (isGeo) return; // Skip 2D canvas drawing when rendering Leaflet map
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasW, canvasH);

    // Dark grid background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 1. Render Grid Lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const gridStep = spanX <= 20 ? 2 : (spanX <= 50 ? 5 : (spanX <= 100 ? 10 : (spanX <= 500 ? 50 : 100)));

    for (let xVal = Math.ceil(minX / gridStep) * gridStep; xVal <= maxX; xVal += gridStep) {
      const px = toCanvasX(xVal);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, canvasH);
      ctx.stroke();
    }

    for (let yVal = Math.ceil(minY / gridStep) * gridStep; yVal <= maxY; yVal += gridStep) {
      const py = toCanvasY(yVal);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(canvasW, py);
      ctx.stroke();
    }

    // 2. Labeled Origin Axes (X=0 Red, Y=0 Green)
    const originX = toCanvasX(0);
    const originY = toCanvasY(0);

    if (minY <= 0 && maxY >= 0) {
      ctx.strokeStyle = '#ef4444'; // Red X Axis
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, originY);
      ctx.lineTo(canvasW, originY);
      ctx.stroke();
    }

    if (minX <= 0 && maxX >= 0) {
      ctx.strokeStyle = '#22c55e'; // Green Y Axis
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(originX, 0);
      ctx.lineTo(originX, canvasH);
      ctx.stroke();
    }

    // 3. Axis Ticks & Numerical Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    const labelStep = gridStep * 2;

    for (let xVal = Math.ceil(minX / labelStep) * labelStep; xVal <= maxX; xVal += labelStep) {
      const tx = toCanvasX(xVal);
      ctx.fillText(`${xVal}`, tx - 8, canvasH - 6);
    }

    for (let yVal = Math.ceil(minY / labelStep) * labelStep; yVal <= maxY; yVal += labelStep) {
      const ty = toCanvasY(yVal);
      ctx.fillText(`${yVal}`, 4, ty + 3);
    }

    // 4. Spatial Limits Box
    const boxLeft = toCanvasX(baseMinX);
    const boxRight = toCanvasX(baseMaxX);
    const boxTop = toCanvasY(baseMaxY);
    const boxBottom = toCanvasY(baseMinY);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(boxLeft, boxTop, boxRight - boxLeft, boxBottom - boxTop);
    ctx.setLineDash([]);

    // 5. Boundary Polygon
    if (polygon && polygon.length >= 3) {
      ctx.beginPath();
      const first = polygon[0];
      ctx.moveTo(toCanvasX(first.x ?? minX), toCanvasY(first.y ?? minY));

      for (let i = 1; i < polygon.length; i++) {
        const pt = polygon[i];
        ctx.lineTo(toCanvasX(pt.x ?? minX), toCanvasY(pt.y ?? minY));
      }
      ctx.closePath();

      ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
      ctx.fill();

      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Render boundary vertices
      polygon.forEach((pt) => {
        const cx = toCanvasX(pt.x ?? minX);
        const cy = toCanvasY(pt.y ?? minY);
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 6. Obstacles & Barriers Layer
    (obstacles || []).forEach((obs) => {
      if (!obs.enabled || !obs.points || obs.points.length === 0) return;

      ctx.beginPath();
      const firstPt = obs.points[0];
      ctx.moveTo(toCanvasX(firstPt.x ?? minX), toCanvasY(firstPt.y ?? minY));

      for (let i = 1; i < obs.points.length; i++) {
        const pt = obs.points[i];
        ctx.lineTo(toCanvasX(pt.x ?? minX), toCanvasY(pt.y ?? minY));
      }

      if (obs.type === 'WALL_SEGMENT') {
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.closePath();
        ctx.fillStyle = 'rgba(244, 63, 94, 0.22)';
        ctx.fill();
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  }, [isGeo, canvasW, canvasH, minX, maxX, minY, maxY, baseMinX, baseMaxX, baseMinY, baseMaxY, polygon, obstacles]);

  // Handle 2D Canvas click for adding nodes
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isGeo) return; // Leaflet handles clicks in Geospatial mode
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvasW / rect.width : 1;
    const scaleY = rect.height > 0 ? canvasH / rect.height : 1;
    const clickPx = (e.clientX - rect.left) * scaleX;
    const clickPy = (e.clientY - rect.top) * scaleY;

    const domainX = fromCanvasX(clickPx);
    const domainY = fromCanvasY(clickPy);

    handleAddNode(domainX, domainY);
  };

  // Helper to append a node at (x, y) with active edge connection
  const handleAddNode = (x: number, y: number) => {
    if (nodes.length === 0) {
      const valError = validateNodeAndEdge(null, { x, y }, obstacles, polygon, minPoint, maxPoint);
      if (valError) {
        setWarningMsg(valError);
        return;
      }
      setWarningMsg(null);

      const firstNode: GraphNode = {
        id: `node-${Date.now()}`,
        name: 'Node 0',
        x,
        y,
        z: 0,
      };
      const updatedNodes = [firstNode];
      setSelectedNodeId(firstNode.id);
      onChange({
        graphNodes: updatedNodes,
        graphSequence: [firstNode.id],
      });
    } else {
      const originId = selectedNodeId || nodes[nodes.length - 1].id;
      const originNode = nodes.find((n) => n.id === originId) || nodes[nodes.length - 1];

      const valError = validateNodeAndEdge(originNode, { x, y }, obstacles, polygon, minPoint, maxPoint);
      if (valError) {
        setWarningMsg(valError);
        return;
      }
      setWarningMsg(null);

      const newNode: GraphNode = {
        id: `node-${Date.now()}`,
        name: `Node ${nodes.length}`,
        x,
        y,
        z: 0,
      };
      const newEdge: GraphEdge = {
        id: `edge-${Date.now()}`,
        fromNodeId: originId,
        toNodeId: newNode.id,
        bidirectional: true,
      };
      const updatedNodes = [...nodes, newNode];
      const updatedEdges = [...edges, newEdge];
      const updatedSeq = sequence.includes(originId) ? [...sequence, newNode.id] : [...sequence, originId, newNode.id];

      setSelectedNodeId(newNode.id);
      onChange({
        graphNodes: updatedNodes,
        graphEdges: updatedEdges,
        graphSequence: updatedSeq,
      });
    }
  };

  const handleNodeClick = (node: GraphNode) => {
    if (activeTool === 'DELETE') {
      const updatedNodes = nodes.filter((n) => n.id !== node.id);
      const updatedEdges = edges.filter((edge) => edge.fromNodeId !== node.id && edge.toNodeId !== node.id);
      const updatedSeq = sequence.filter((id) => id !== node.id);
      if (selectedNodeId === node.id) {
        setSelectedNodeId(updatedNodes[0]?.id ?? null);
      }
      onChange({
        graphNodes: updatedNodes,
        graphEdges: updatedEdges,
        graphSequence: updatedSeq,
      });
      return;
    }

    if (activeTool === 'CONNECT') {
      if (!connectOriginId) {
        setConnectOriginId(node.id);
      } else if (connectOriginId !== node.id) {
        const originNode = nodes.find((n) => n.id === connectOriginId);
        if (originNode) {
          const valError = validateNodeAndEdge(originNode, node, obstacles, polygon, minPoint, maxPoint);
          if (valError) {
            setWarningMsg(valError);
            setConnectOriginId(null);
            return;
          }
        }
        setWarningMsg(null);

        const edgeExists = edges.some(
          (edge) =>
            (edge.fromNodeId === connectOriginId && edge.toNodeId === node.id) ||
            (edge.toNodeId === connectOriginId && edge.fromNodeId === node.id)
        );

        if (!edgeExists) {
          const newEdge: GraphEdge = {
            id: `edge-${Date.now()}`,
            fromNodeId: connectOriginId,
            toNodeId: node.id,
            bidirectional: true,
          };
          onChange({
            graphEdges: [...edges, newEdge],
          });
        }
        setConnectOriginId(null);
      }
      return;
    }

    setSelectedNodeId(node.id);
  };

  const handleEdgeClick = (edge: GraphEdge) => {
    if (activeTool === 'DELETE') {
      const updatedEdges = edges.filter((eg) => eg.id !== edge.id);
      onChange({ graphEdges: updatedEdges });
    }
  };

  const clearGraph = () => {
    setSelectedNodeId(null);
    setConnectOriginId(null);
    setWarningMsg(null);
    onChange({
      graphNodes: [],
      graphEdges: [],
      graphSequence: [],
    });
  };

  // Center calculation for Leaflet Map
  const geoCenter = useMemo(() => {
    if (polygon && polygon.length >= 3) {
      const lats = polygon.map((p) => p.x ?? 0);
      const lons = polygon.map((p) => p.y ?? p.x ?? 0);
      return [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2] as [number, number];
    }
    if (nodes.length > 0) {
      return [nodes[0].x, nodes[0].y] as [number, number];
    }
    if (minPoint && maxPoint && minPoint.x !== undefined && maxPoint.x !== undefined && (minPoint.x !== -100 || maxPoint.x !== 100)) {
      const minX = minPoint.x ?? 40.0;
      const maxX = maxPoint.x ?? 41.0;
      const minY = minPoint.y ?? -4.0;
      const maxY = maxPoint.y ?? -3.0;
      return [(minX + maxX) / 2, (minY + maxY) / 2] as [number, number];
    }
    return [40.4168, -3.7038] as [number, number]; // Default to Madrid / Iberia
  }, [polygon, nodes, minPoint, maxPoint]);

  // Leaflet Marker Icon generator (approx 3x smaller node icons: 10px)
  const createNodeIcon = (_node: GraphNode, isSelected: boolean, isConnectOrigin: boolean) => {
    const bgStyle = isSelected
      ? 'background-color:#22d3ee; box-shadow:0 0 10px rgba(34,211,238,0.9); border:1.5px solid #ffffff; transform:scale(1.3);'
      : isConnectOrigin
      ? 'background-color:#fbbf24; box-shadow:0 0 10px rgba(251,191,36,0.9); border:1.5px solid #ffffff; transform:scale(1.3);'
      : 'background-color:#0f172a; border:1.5px solid #22d3ee;';

    const html = `
      <div style="display:flex; align-items:center; justify-content:center; width:10px; height:10px; border-radius:9999px; cursor:pointer; transition:all 0.15s; ${bgStyle}">
      </div>
    `;

    return L.divIcon({
      html,
      className: 'custom-graph-node-marker',
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={
          isFullScreen
            ? 'fixed inset-0 z-[9999] bg-slate-950 p-4 md:p-6 flex flex-col h-screen w-screen space-y-3 overflow-hidden shadow-2xl animate-in fade-in duration-200'
            : 'space-y-3 bg-black/20 p-3 rounded-lg border border-[var(--c-br1)]'
        }
      >
        {/* Header & Tool Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
              {isGeo ? 'Route Graph Editor (Geospatial Map Region)' : 'Route Graph Editor (2D Spatial Boundary Plane)'}
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[320px] space-y-1.5 text-[11px] leading-relaxed">
                <p className="font-semibold text-cyan-400">{"Graph Route Instructions:"}</p>
                <p>{"1. Click anywhere on the map or plane to set the initial route node."}</p>
                <p>{"2. Select an origin node and click anywhere to place the next step and automatically draw a connecting edge."}</p>
                <p>{"3. Route points and edges crossing forbidden obstacle zones are blocked."}</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    variant={activeTool === 'ADD_EXTEND' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => {
                      setActiveTool('ADD_EXTEND');
                      setConnectOriginId(null);
                    }}
                  >
                    <Plus size={12} />
                    <span>{"Add & Extend"}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-[11px]">
                {"Click to add new destination nodes connected to the selected origin node"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    variant={activeTool === 'CONNECT' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => {
                      setActiveTool('CONNECT');
                      setConnectOriginId(null);
                    }}
                  >
                    <LinkIcon size={12} />
                    <span>{"Connect Nodes"}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-[11px]">
                {"Click two existing nodes sequentially to add a connecting edge between them"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    variant={activeTool === 'SELECT' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => {
                      setActiveTool('SELECT');
                      setConnectOriginId(null);
                    }}
                  >
                    <Move size={12} />
                    <span>{"Select Node"}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-[11px]">
                {"Select active origin node for route extension"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    variant={activeTool === 'DELETE' ? 'destructive' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => {
                      setActiveTool('DELETE');
                      setConnectOriginId(null);
                    }}
                  >
                    <Trash2 size={12} />
                    <span>{"Delete"}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-[11px]">
                {"Click any node or edge line to remove it from the graph"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    variant={showCoordinateLabels ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => setShowCoordinateLabels(!showCoordinateLabels)}
                  >
                    {showCoordinateLabels ? <Eye size={12} /> : <EyeOff size={12} />}
                    <span>{showCoordinateLabels ? 'Labels' : 'Labels'}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-[11px]">
                {showCoordinateLabels ? 'Hide node coordinate labels' : 'Show node coordinate labels'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    variant={isFullScreen ? 'secondary' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => setIsFullScreen(!isFullScreen)}
                  >
                    {isFullScreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    <span>{isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-[11px]">
                {isFullScreen ? 'Exit fullscreen editor view (Esc)' : 'Expand route graph editor to full screen'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300"
                    onClick={clearGraph}
                  >
                    <RotateCcw size={12} />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-[11px]">{"Clear all graph nodes and edges"}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Forbidden Zone / Obstacle Warning Banner */}
        {warningMsg && (
          <div className="flex items-center justify-between bg-rose-950/90 border border-rose-500/80 text-rose-200 px-3 py-1.5 rounded text-xs animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle size={14} className="text-rose-400 shrink-0" />
              <span>{warningMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setWarningMsg(null)}
              className="text-rose-400 hover:text-rose-200 text-xs font-bold px-1"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Editor Area (Geospatial OpenStreetMap or 2D Plane Canvas) */}
        <div
          ref={containerRef}
          style={isFullScreen ? { height: 'calc(100vh - 140px)', width: '100%' } : { height: '340px', width: '100%' }}
          className={`relative w-full border border-slate-800 rounded-md overflow-hidden select-none flex-1 min-h-0 ${
            activeTool === 'ADD_EXTEND' ? 'cursor-crosshair' : 'cursor-default'
          }`}
        >
          {isGeo ? (
            /* GEOSPATIAL MAP VIEW (Leaflet OpenStreetMap) */
            <MapContainer
              center={geoCenter}
              zoom={6}
              minZoom={2}
              maxBounds={[[-90, -180], [90, 180]]}
              maxBoundsViscosity={1.0}
              worldCopyJump={false}
              scrollWheelZoom={true}
              style={{ height: '100%', width: '100%', minHeight: isFullScreen ? 'calc(100vh - 140px)' : '340px', background: '#090d16' }}
            >
              <GraphMapEventsHandler
                activeTool={activeTool}
                nodes={nodes}
                selectedNodeId={selectedNodeId}
                obstacles={obstacles}
                polygon={polygon}
                minPoint={minPoint}
                maxPoint={maxPoint}
                onAddNode={handleAddNode}
                onWarning={setWarningMsg}
              />
              <GraphMapResizeHandler isFullScreen={isFullScreen} />
              <GraphMapAutoFit polygon={polygon} minPoint={minPoint} maxPoint={maxPoint} />

              {!isOffline && (
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  subdomains={['a', 'b', 'c']}
                  noWrap={true}
                  maxZoom={19}
                />
              )}

              {/* Offline Technical Grid Overlay */}
              {isOffline && <OfflineGridOverlay />}

              {/* Offline Warning Banner Overlay */}
              {isOffline && (
                <div className="absolute top-2 left-2 z-[1000] bg-amber-950/90 border border-amber-500/50 text-amber-200 text-[10px] font-mono px-2.5 py-1 rounded shadow-md flex items-center gap-2">
                  <WifiOff size={11} className="text-amber-400 shrink-0" />
                  <span>OFFLINE MODE - Technical Grid Active</span>
                </div>
              )}

              {/* Boundary Region Geofence Polygon */}
              {polygon && polygon.length >= 3 && (
                <LeafletPolygon
                  positions={polygon.map((p) => [p.x ?? 0, p.y ?? p.x ?? 0])}
                  pathOptions={{
                    color: '#06b6d4',
                    fillColor: '#06b6d4',
                    fillOpacity: 0.16,
                    weight: 2,
                  }}
                />
              )}

              {/* Obstacles Layer */}
              {(obstacles || []).map((obs) => {
                if (!obs.enabled || !obs.points || obs.points.length === 0) return null;

                if (obs.type === 'WALL_SEGMENT' && obs.points.length >= 2) {
                  return (
                    <LeafletPolyline
                      key={obs.id}
                      positions={obs.points.map((p) => [p.x ?? 0, p.y ?? p.x ?? 0])}
                      pathOptions={{
                        color: '#f43f5e',
                        weight: 3,
                        dashArray: '4, 4',
                      }}
                    />
                  );
                } else if (obs.points.length >= 3) {
                  return (
                    <LeafletPolygon
                      key={obs.id}
                      positions={obs.points.map((p) => [p.x ?? 0, p.y ?? p.x ?? 0])}
                      pathOptions={{
                        color: '#f43f5e',
                        fillColor: '#f43f5e',
                        fillOpacity: 0.22,
                        weight: 1.5,
                      }}
                    />
                  );
                }
                return null;
              })}

              {/* Graph Edges */}
              {edges.map((edge) => {
                const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
                const toNode = nodes.find((n) => n.id === edge.toNodeId);
                if (!fromNode || !toNode) return null;

                return (
                  <LeafletPolyline
                    key={edge.id}
                    positions={[
                      [fromNode.x, fromNode.y],
                      [toNode.x, toNode.y],
                    ]}
                    pathOptions={{
                      color: '#06b6d4',
                      weight: 3,
                      dashArray: edge.bidirectional ? undefined : '6, 4',
                    }}
                    eventHandlers={{
                      click: (e) => {
                        L.DomEvent.stopPropagation(e);
                        handleEdgeClick(edge);
                      },
                    }}
                  />
                );
              })}

              {/* Graph Nodes & Floating Coordinate Badges */}
              {nodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isConnectOrigin = connectOriginId === node.id;

                return (
                  <LeafletMarker
                    key={node.id}
                    position={[node.x, node.y]}
                    icon={createNodeIcon(node, isSelected, isConnectOrigin)}
                    eventHandlers={{
                      click: (e) => {
                        L.DomEvent.stopPropagation(e);
                        handleNodeClick(node);
                      },
                    }}
                  >
                    {showCoordinateLabels && (
                      <LeafletTooltip
                        permanent
                        direction="top"
                        offset={[0, -8]}
                        className="bg-slate-950/90 border border-cyan-400/80 text-cyan-300 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xl"
                      >
                        <span>(Lat: {node.x.toFixed(4)}°, Lon: {node.y.toFixed(4)}°)</span>
                      </LeafletTooltip>
                    )}
                  </LeafletMarker>
                );
              })}
            </MapContainer>
          ) : (
            /* 2D CARTESIAN PLANE VIEW (HTML5 Canvas) */
            <div onClick={handleCanvasClick} className="relative size-full">
              <canvas
                ref={canvasRef}
                width={canvasW}
                height={canvasH}
                className="absolute inset-0 size-full block pointer-events-none"
              />

              {/* SVG Overlay rendering Graph Edges in 2D mode */}
              <svg className="absolute inset-0 size-full pointer-events-none z-10">
                {edges.map((edge) => {
                  const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
                  const toNode = nodes.find((n) => n.id === edge.toNodeId);
                  if (!fromNode || !toNode) return null;

                  const x1 = toCanvasX(fromNode.x);
                  const y1 = toCanvasY(fromNode.y);
                  const x2 = toCanvasX(toNode.x);
                  const y2 = toCanvasY(toNode.y);

                  return (
                    <g key={edge.id} className="pointer-events-auto cursor-pointer" onClick={() => handleEdgeClick(edge)}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#06b6d4"
                        strokeWidth="3"
                        strokeDasharray={edge.bidirectional ? 'none' : '5 3'}
                        className="hover:stroke-rose-400 transition-colors"
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Render 2D Graph Nodes & Floating Coordinate Badges */}
              {nodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isConnectOrigin = connectOriginId === node.id;
                const cx = toCanvasX(node.x);
                const cy = toCanvasY(node.y);

                return (
                  <React.Fragment key={node.id}>
                    {showCoordinateLabels && (
                      <div
                        className="absolute -translate-x-1/2 -translate-y-full px-1.5 py-0.5 rounded bg-slate-950/95 border border-cyan-400/80 text-[10px] font-mono font-bold text-cyan-300 shadow-xl whitespace-nowrap pointer-events-none z-30"
                        style={{ left: `${cx}px`, top: `${cy - 8}px` }}
                      >
                        (X: {node.x.toFixed(1)}, Y: {node.y.toFixed(1)})
                      </div>
                    )}

                    <div
                      onClick={() => handleNodeClick(node)}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full cursor-pointer transition-all duration-150 z-30 ${
                        isSelected
                          ? 'bg-cyan-400 ring-2 ring-cyan-400/80 shadow-md scale-125'
                          : isConnectOrigin
                          ? 'bg-amber-400 ring-2 ring-amber-400/80 animate-bounce scale-125'
                          : 'bg-slate-900 text-cyan-300 border-2 border-cyan-400 hover:bg-cyan-950 hover:scale-110'
                      }`}
                      style={{ left: `${cx}px`, top: `${cy}px` }}
                    >
                      <span>{node.name || node.id.replace('node-', '')}</span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* Empty state hint overlay */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--c-tx4)] pointer-events-none space-y-1 z-20">
              <Plus size={24} className="text-cyan-400/80 animate-pulse" />
              <p className="text-xs font-semibold text-cyan-300">
                {isGeo
                  ? 'Click anywhere on the map to set the initial geospatial route point'
                  : 'Click anywhere on the boundary plane to set the first route point'}
              </p>
              <p className="text-[10px] text-slate-400">{"Subsequent clicks will add connected destination steps"}</p>
            </div>
          )}
        </div>

        {/* Selected Node Inspector Panel */}
        {selectedNodeId && (() => {
          const targetNode = nodes.find((n) => n.id === selectedNodeId);
          if (!targetNode) return null;

          return (
            <div className="flex items-center justify-between bg-slate-900/80 p-2 px-3 rounded border border-slate-800 text-xs">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <MapPin size={14} className="text-cyan-400" />
                  <Label className="text-[10px] text-cyan-400 font-semibold uppercase">Selected Node:</Label>
                  <input
                    type="text"
                    value={targetNode.name || ''}
                    onChange={(e) => {
                      const newName = e.target.value;
                      const updated = nodes.map((n) => (n.id === selectedNodeId ? { ...n, name: newName } : n));
                      onChange({ graphNodes: updated });
                    }}
                    className="h-6 w-24 px-1.5 bg-black/50 border border-slate-700 rounded text-cyan-300 text-xs"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] text-cyan-400 font-semibold uppercase">{isGeo ? 'Lat:' : 'X:'}</Label>
                  <input
                    type="number"
                    step={isGeo ? '0.0001' : '0.1'}
                    value={targetNode.x}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const valError = validateNodeAndEdge(null, { x: val, y: targetNode.y }, obstacles, polygon, minPoint, maxPoint);
                      if (valError) {
                        setWarningMsg(valError);
                        return;
                      }
                      setWarningMsg(null);
                      const updated = nodes.map((n) => (n.id === selectedNodeId ? { ...n, x: val } : n));
                      onChange({ graphNodes: updated });
                    }}
                    className="h-6 w-20 px-1.5 bg-black/50 border border-slate-700 rounded text-cyan-300 text-xs font-mono"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] text-cyan-400 font-semibold uppercase">{isGeo ? 'Lon:' : 'Y:'}</Label>
                  <input
                    type="number"
                    step={isGeo ? '0.0001' : '0.1'}
                    value={targetNode.y}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const valError = validateNodeAndEdge(null, { x: targetNode.x, y: val }, obstacles, polygon, minPoint, maxPoint);
                      if (valError) {
                        setWarningMsg(valError);
                        return;
                      }
                      setWarningMsg(null);
                      const updated = nodes.map((n) => (n.id === selectedNodeId ? { ...n, y: val } : n));
                      onChange({ graphNodes: updated });
                    }}
                    className="h-6 w-20 px-1.5 bg-black/50 border border-slate-700 rounded text-cyan-300 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="text-[10px] text-[var(--c-tx4)] font-mono">
                {"Graph: "}
                <span className="text-cyan-300 font-semibold">{nodes.length}</span>
                {" nodes, "}
                <span className="text-cyan-300 font-semibold">{edges.length}</span>
                {" edges"}
              </div>
            </div>
          );
        })()}
      </div>
    </TooltipProvider>
  );
};


