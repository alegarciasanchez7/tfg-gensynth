import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GraphNode, GraphEdge, PointVariableConfig, BoundaryObstacle, Point3DCoord } from '../../../../types';
import { defaultBoundsFor, centerOf } from '../../../../core/pointDefaults';
import { validateNodeAndEdge } from '../../../../core/routeGeometry';
import { fitWorldWindow, niceStep } from '../../../../core/worldWindow';
import { CommitInput } from '../../../common/CommitInput';
import { OfflineGridOverlay, MapAutoFit } from './mapShared';
import { useCanvasPalette } from './canvasPalette';
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
  Rectangle as LeafletRectangle,
  Tooltip as LeafletTooltip,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerIconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Default Leaflet marker icons bundled with the app (a CDN would break them offline). _getIconUrl
// would prefix Leaflet's image path to these bundler URLs, so it is removed.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIconUrl, iconRetinaUrl: markerIconRetinaUrl, shadowUrl: markerShadowUrl });

/** First free "Node N" name, so deleting a node and adding another never repeats a name. */
const nextNodeName = (nodes: GraphNode[]): string => {
  const used = new Set(nodes.map((n) => n.name));
  let i = nodes.length;
  while (used.has(`Node ${i}`)) i++;
  return `Node ${i}`;
};

interface GraphRouteCanvasProps {
  config: PointVariableConfig;
  onChange: (newConfig: Partial<PointVariableConfig>) => void;
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

/** Map centre and zoom, remembered so the fullscreen remount keeps the user's view. */
interface MapView {
  center: [number, number];
  zoom: number;
}

/** Reports the map view after every pan or zoom. */
function GraphMapViewTracker({ onViewChange }: { onViewChange: (view: MapView) => void }) {
  useMapEvents({
    moveend(e) {
      const map = e.target as L.Map;
      const c = map.getCenter();
      onViewChange({ center: [c.lat, c.lng], zoom: map.getZoom() });
    },
  });
  return null;
}

type NodeVisualState = 'normal' | 'selected' | 'origin';

/** Builds a node marker icon: a 10 px dot centred in a 22 px transparent hit area. */
const buildNodeIcon = (state: NodeVisualState): L.DivIcon => {
  const dotStyle =
    state === 'selected'
      ? 'background-color:#22d3ee; box-shadow:0 0 10px rgba(34,211,238,0.9); border:1.5px solid #ffffff; transform:scale(1.3);'
      : state === 'origin'
      ? 'background-color:#fbbf24; box-shadow:0 0 10px rgba(251,191,36,0.9); border:1.5px solid #ffffff; transform:scale(1.3);'
      : 'background-color:#0f172a; border:1.5px solid #22d3ee;';
  return L.divIcon({
    html: `<div style="display:flex; align-items:center; justify-content:center; width:22px; height:22px; cursor:pointer;"><div style="width:10px; height:10px; border-radius:9999px; box-sizing:border-box; ${dotStyle}"></div></div>`,
    className: 'custom-graph-node-marker',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
};

// Icons are cached per visual state: a new icon on every render would make react-leaflet call
// setIcon, which recreates the marker element and kills an ongoing drag
const NODE_ICONS: Record<NodeVisualState, L.DivIcon> = {
  normal: buildNodeIcon('normal'),
  selected: buildNodeIcon('selected'),
  origin: buildNodeIcon('origin'),
};

/** Draggable map marker of one route node. Takes primitives so it only re-renders when they change. */
const GraphNodeMarker = React.memo(function GraphNodeMarker({
  nodeId,
  lat,
  lon,
  visualState,
  draggable,
  showLabel,
  onNodeClick,
  onNodeDragEnd,
}: {
  nodeId: string;
  lat: number;
  lon: number;
  visualState: NodeVisualState;
  draggable: boolean;
  showLabel: boolean;
  onNodeClick: (nodeId: string) => void;
  /** Returns false when the move is rejected, so the marker goes back to its position. */
  onNodeDragEnd: (nodeId: string, lat: number, lon: number) => boolean;
}) {
  const position = useMemo<[number, number]>(() => [lat, lon], [lat, lon]);
  const eventHandlers = useMemo<L.LeafletEventHandlerFnMap>(
    () => ({
      click: (e) => {
        L.DomEvent.stopPropagation(e);
        onNodeClick(nodeId);
      },
      dragend: (e) => {
        const marker = e.target as L.Marker;
        const dropped = marker.getLatLng();
        const accepted = onNodeDragEnd(nodeId, dropped.lat, dropped.lng);
        if (!accepted) marker.setLatLng(position);
      },
    }),
    [nodeId, onNodeClick, onNodeDragEnd, position]
  );

  return (
    <LeafletMarker position={position} icon={NODE_ICONS[visualState]} draggable={draggable} eventHandlers={eventHandlers}>
      {showLabel && (
        <LeafletTooltip
          permanent
          direction="top"
          offset={[0, -8]}
          className="bg-[var(--c-bg1)]/90 border border-cyan-400/80 text-cyan-600 dark:text-cyan-300 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xl"
        >
          <span>(Lat: {lat.toFixed(4)}°, Lon: {lon.toFixed(4)}°)</span>
        </LeafletTooltip>
      )}
    </LeafletMarker>
  );
});

/** Style of the allowed region polygon on the map. */
const REGION_STYLE: L.PathOptions = {
  color: '#06b6d4',
  fillColor: '#06b6d4',
  fillOpacity: 0.16,
  weight: 2,
};

type GraphTool = 'ADD_EXTEND' | 'CONNECT' | 'SELECT' | 'DELETE';

/** One-line hint shown for each tool. */
const TOOL_HINTS: Record<GraphTool, string> = {
  ADD_EXTEND: 'Click empty space to add a node linked to the selected one · Drag a node to move it',
  SELECT: 'Click a node to select it · Drag a node to move it',
  CONNECT: 'Click the origin, then the target · Esc cancels',
  DELETE: 'Click a node or edge to delete it',
};

/** Time-based id for new graph nodes and edges ("node-<ms>", "edge-<ms>"). */
const newGraphId = (prefix: 'node' | 'edge'): string => `${prefix}-${Date.now()}`;

/** Minimum pointer travel (px) before a press on a node becomes a drag instead of a click. */
const DRAG_THRESHOLD_PX = 4;

interface DragState {
  nodeId: string;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  x: number;
  y: number;
}

export const GraphRouteCanvas: React.FC<GraphRouteCanvasProps> = ({ config, onChange }) => {
  const nodes = useMemo<GraphNode[]>(() => config.graphNodes ?? [], [config.graphNodes]);
  const edges = useMemo<GraphEdge[]>(() => config.graphEdges ?? [], [config.graphEdges]);
  const sequence: string[] = config.graphSequence ?? [];

  // Explicit region: the configured bounds, or the default region of the coordinate system
  const defaultBounds = useMemo(() => defaultBoundsFor(config.coordinateSystem), [config.coordinateSystem]);
  const minPoint: Point3DCoord = config.minPoint ?? defaultBounds.minPoint;
  const maxPoint: Point3DCoord = config.maxPoint ?? defaultBounds.maxPoint;
  const polygon = useMemo<Point3DCoord[]>(() => config.boundaryPolygon ?? [], [config.boundaryPolygon]);
  const obstacles = useMemo<BoundaryObstacle[]>(() => config.obstacles ?? [], [config.obstacles]);

  const isGeo = config.coordinateSystem === 'GEOSPATIAL';

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(nodes[0]?.id ?? null);
  // A selection that no longer exists falls back to the first node
  const selectedId =
    selectedNodeId && nodes.some((n) => n.id === selectedNodeId) ? selectedNodeId : (nodes[0]?.id ?? null);
  const [activeTool, setActiveTool] = useState<GraphTool>('ADD_EXTEND');
  const [connectOriginId, setConnectOriginId] = useState<string | null>(null);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showCoordinateLabels, setShowCoordinateLabels] = useState(true);

  // Map view kept across the fullscreen remount: tracked on every move, frozen when toggling
  const mapViewRef = useRef<MapView | null>(null);
  const [initialMapView, setInitialMapView] = useState<MapView | null>(null);

  const toggleFullScreen = (next: boolean) => {
    setInitialMapView(mapViewRef.current);
    setIsFullScreen(next);
  };

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

  // ESC cancels a pending connection first, then exits full screen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (connectOriginId) {
        setConnectOriginId(null);
        return;
      }
      if (isFullScreen) {
        setInitialMapView(mapViewRef.current);
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen, connectOriginId]);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = useCanvasPalette();
  const [canvasSize, setCanvasSize] = useState({ w: 700, h: 340 });

  // 2D node drag: the ref holds the live gesture, the state renders the moved node. The state
  // remembers the nodes it was based on, so after a commit the dragged position stays on screen
  // until the updated nodes come back from the Core (no flicker to the old position).
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const [dragPos, setDragPos] = useState<{ nodeId: string; x: number; y: number; base: GraphNode[] } | null>(null);
  const activeDrag = dragPos && dragPos.base === nodes ? dragPos : null;
  const displayNodes = activeDrag
    ? nodes.map((n) => (n.id === activeDrag.nodeId ? { ...n, x: activeDrag.x, y: activeDrag.y } : n))
    : nodes;

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

  // Region box: the boundary polygon bounds when there is one, else the min/max bounds
  let baseMinX = minPoint.x ?? 0;
  let baseMaxX = maxPoint.x ?? 100;
  let baseMinY = minPoint.y ?? 0;
  let baseMaxY = maxPoint.y ?? 100;

  if (polygon && polygon.length >= 3) {
    const xs = polygon.map((p) => p.x ?? 0);
    const ys = polygon.map((p) => p.y ?? 0);
    baseMinX = Math.min(...xs);
    baseMaxX = Math.max(...xs);
    baseMinY = Math.min(...ys);
    baseMaxY = Math.max(...ys);
  }

  // Clicks and drags are clamped to the region plus 5% padding (so boundary handles stay usable)
  const spanXRaw = Math.abs(baseMaxX - baseMinX);
  const spanYRaw = Math.abs(baseMaxY - baseMinY);
  const padX = spanXRaw > 0 ? spanXRaw * 0.05 : 10;
  const padY = spanYRaw > 0 ? spanYRaw * 0.05 : 10;

  const minX = baseMinX - padX;
  const maxX = baseMaxX + padX;
  const minY = baseMinY - padY;
  const maxY = baseMaxY + padY;

  // One scale for both axes, so the region and the route keep their real proportions
  const { cx: worldCx, cy: worldCy, scale: worldScale } = fitWorldWindow(
    [{ x: baseMinX, y: baseMinY }, { x: baseMaxX, y: baseMaxY }],
    canvasW,
    canvasH,
    margin,
    0.05
  );

  // Projection: Domain coordinate -> Canvas pixel (2D Mode)
  const toCanvasX = (val: number) => canvasW / 2 + (val - worldCx) * worldScale;
  const toCanvasY = (val: number) => canvasH / 2 - (val - worldCy) * worldScale;

  // Inverse projection: Canvas pixel -> Domain coordinate (2D Mode)
  const fromCanvasX = (px: number) => {
    const raw = worldCx + (px - canvasW / 2) / worldScale;
    const clamped = Math.max(minX, Math.min(maxX, raw));
    return Math.round(clamped * 10) / 10;
  };

  const fromCanvasY = (py: number) => {
    const raw = worldCy - (py - canvasH / 2) / worldScale;
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

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Visible world extents: the grid covers the whole canvas, not only the region
    const visLeft = worldCx - canvasW / 2 / worldScale;
    const visRight = worldCx + canvasW / 2 / worldScale;
    const visBottom = worldCy - canvasH / 2 / worldScale;
    const visTop = worldCy + canvasH / 2 / worldScale;

    // 1. Render Grid Lines (at least ~40 px apart)
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    const gridStep = niceStep(40 / worldScale);
    const gridValues = (from: number, to: number, step: number): number[] => {
      const values: number[] = [];
      for (let i = Math.ceil(from / step); i * step <= to; i++) values.push(Number((i * step).toFixed(6)));
      return values;
    };

    for (const xVal of gridValues(visLeft, visRight, gridStep)) {
      const px = toCanvasX(xVal);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, canvasH);
      ctx.stroke();
    }

    for (const yVal of gridValues(visBottom, visTop, gridStep)) {
      const py = toCanvasY(yVal);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(canvasW, py);
      ctx.stroke();
    }

    // 2. Labeled Origin Axes (X=0, Y=0)
    const originX = toCanvasX(0);
    const originY = toCanvasY(0);

    if (visBottom <= 0 && visTop >= 0) {
      ctx.strokeStyle = palette.axisX;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, originY);
      ctx.lineTo(canvasW, originY);
      ctx.stroke();
    }

    if (visLeft <= 0 && visRight >= 0) {
      ctx.strokeStyle = palette.axisY;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(originX, 0);
      ctx.lineTo(originX, canvasH);
      ctx.stroke();
    }

    // 3. Axis Ticks & Numerical Labels
    ctx.fillStyle = palette.gridLabel;
    ctx.font = '9px monospace';
    const labelStep = gridStep * 2;

    for (const xVal of gridValues(visLeft, visRight, labelStep)) {
      const tx = toCanvasX(xVal);
      ctx.fillText(`${xVal}`, tx - 8, canvasH - 6);
    }

    for (const yVal of gridValues(visBottom, visTop, labelStep)) {
      const ty = toCanvasY(yVal);
      ctx.fillText(`${yVal}`, 4, ty + 3);
    }

    // 4. Spatial Limits Box
    const boxLeft = toCanvasX(baseMinX);
    const boxRight = toCanvasX(baseMaxX);
    const boxTop = toCanvasY(baseMaxY);
    const boxBottom = toCanvasY(baseMinY);

    ctx.strokeStyle = palette.boundsBox;
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
  }, [isGeo, canvasW, canvasH, worldCx, worldCy, worldScale, minX, minY, baseMinX, baseMaxX, baseMinY, baseMaxY, polygon, obstacles, palette]);

  /** Converts a pointer position to canvas pixels, accounting for CSS scaling of the canvas. */
  const clientToCanvas = (clientX: number, clientY: number): { px: number; py: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvasW / rect.width : 1;
    const scaleY = rect.height > 0 ? canvasH / rect.height : 1;
    return { px: (clientX - rect.left) * scaleX, py: (clientY - rect.top) * scaleY };
  };

  // Handle 2D Canvas click for adding nodes: only on empty plane and with the Add & Extend tool
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isGeo) return; // Leaflet handles clicks in Geospatial mode
    if (activeTool !== 'ADD_EXTEND' || e.target !== e.currentTarget) return;
    const p = clientToCanvas(e.clientX, e.clientY);
    if (!p) return;
    handleAddNode(fromCanvasX(p.px), fromCanvasY(p.py));
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
        id: newGraphId('node'),
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
      const originId = selectedId || nodes[nodes.length - 1].id;
      const originNode = nodes.find((n) => n.id === originId) || nodes[nodes.length - 1];

      const valError = validateNodeAndEdge(originNode, { x, y }, obstacles, polygon, minPoint, maxPoint);
      if (valError) {
        setWarningMsg(valError);
        return;
      }
      setWarningMsg(null);

      const newNode: GraphNode = {
        id: newGraphId('node'),
        name: nextNodeName(nodes),
        x,
        y,
        z: 0,
      };
      const newEdge: GraphEdge = {
        id: newGraphId('edge'),
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

  /** Validates a node moved to (x, y) together with every edge connected to it. */
  const validateNodeMove = (nodeId: string, x: number, y: number): string | null => {
    const target = { x, y };
    const nodeError = validateNodeAndEdge(null, target, obstacles, polygon, minPoint, maxPoint);
    if (nodeError) return nodeError;

    for (const edge of edges) {
      const otherId = edge.fromNodeId === nodeId ? edge.toNodeId : edge.toNodeId === nodeId ? edge.fromNodeId : null;
      const other = otherId ? nodes.find((n) => n.id === otherId) : undefined;
      if (!other) continue;
      const edgeError = validateNodeAndEdge(other, target, obstacles, polygon, minPoint, maxPoint);
      if (edgeError) return edgeError;
    }
    return null;
  };

  /** Moves a node with a single onChange; returns false and shows the warning when the move is invalid. */
  const commitNodeMove = (nodeId: string, x: number, y: number): boolean => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return false;
    if (node.x === x && node.y === y) return true;

    const valError = validateNodeMove(nodeId, x, y);
    if (valError) {
      setWarningMsg(valError);
      return false;
    }
    setWarningMsg(null);
    onChange({ graphNodes: nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)) });
    return true;
  };

  const handleNodeClick = (node: GraphNode) => {
    if (activeTool === 'DELETE') {
      const updatedNodes = nodes.filter((n) => n.id !== node.id);
      const updatedEdges = edges.filter((edge) => edge.fromNodeId !== node.id && edge.toNodeId !== node.id);
      const updatedSeq = sequence.filter((id) => id !== node.id);
      if (selectedId === node.id) {
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
            id: newGraphId('edge'),
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

  // Nodes can be dragged with the tools that do not use the node click for something else
  const canDrag = activeTool === 'ADD_EXTEND' || activeTool === 'SELECT';

  const handleNodePointerDown = (e: React.PointerEvent<HTMLButtonElement>, node: GraphNode) => {
    suppressClickRef.current = false;
    setDragPos(null);
    if (!canDrag || e.button !== 0) return;
    e.stopPropagation();
    if (typeof e.currentTarget.setPointerCapture === 'function') {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    dragRef.current = {
      nodeId: node.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      x: node.x,
      y: node.y,
    };
  };

  const handleNodePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
    const p = clientToCanvas(e.clientX, e.clientY);
    if (!p) return;
    drag.moved = true;
    drag.x = fromCanvasX(p.px);
    drag.y = fromCanvasY(p.py);
    setDragPos({ nodeId: drag.nodeId, x: drag.x, y: drag.y, base: nodes });
  };

  const handleNodePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (!drag.moved) return; // A plain click: handled by onClick

    // The click that follows the drag must not select, delete or connect
    suppressClickRef.current = true;
    setSelectedNodeId(drag.nodeId);
    if (!commitNodeMove(drag.nodeId, drag.x, drag.y)) {
      setDragPos(null); // Rejected: back to the stored position
    }
  };

  const handleNodePointerCancel = () => {
    dragRef.current = null;
    setDragPos(null);
  };

  const handleNodeElementClick = (e: React.MouseEvent<HTMLButtonElement>, node: GraphNode) => {
    e.stopPropagation();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    handleNodeClick(node);
  };

  // Stable callbacks for the memoised map markers, delegating to the latest handlers
  const geoHandlersRef = useRef<{
    click: (nodeId: string) => void;
    dragEnd: (nodeId: string, lat: number, lon: number) => boolean;
  } | null>(null);
  useLayoutEffect(() => {
    geoHandlersRef.current = {
      click: (nodeId) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (node) handleNodeClick(node);
      },
      dragEnd: (nodeId, lat, lon) => {
        setSelectedNodeId(nodeId);
        return commitNodeMove(nodeId, Math.round(lat * 10000) / 10000, Math.round(lon * 10000) / 10000);
      },
    };
  });
  const onMarkerClick = useCallback((nodeId: string) => geoHandlersRef.current?.click(nodeId), []);
  const onMarkerDragEnd = useCallback(
    (nodeId: string, lat: number, lon: number) => geoHandlersRef.current?.dragEnd(nodeId, lat, lon) ?? false,
    []
  );
  const handleMapViewChange = useCallback((view: MapView) => {
    mapViewRef.current = view;
  }, []);

  /** Commits a typed coordinate after parsing and validating it. */
  const commitCoordinate = (node: GraphNode, axis: 'x' | 'y', raw: string): boolean => {
    const text = raw.trim();
    const val = Number(text);
    if (text === '' || !Number.isFinite(val)) {
      setWarningMsg('Enter a valid number for the node coordinate.');
      return false;
    }
    return commitNodeMove(node.id, axis === 'x' ? val : node.x, axis === 'y' ? val : node.y);
  };

  const commitName = (node: GraphNode, raw: string): boolean => {
    onChange({ graphNodes: nodes.map((n) => (n.id === node.id ? { ...n, name: raw } : n)) });
    return true;
  };

  const selectTool = (tool: GraphTool) => {
    setActiveTool(tool);
    setConnectOriginId(null);
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

  // Initial centre for the Leaflet map (the auto-fit or the remembered view refines it)
  let geoCenter: [number, number];
  if (polygon.length >= 3) {
    const lats = polygon.map((p) => p.x ?? 0);
    const lons = polygon.map((p) => p.y ?? p.x ?? 0);
    geoCenter = [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2];
  } else if (nodes.length > 0) {
    geoCenter = [nodes[0].x, nodes[0].y];
  } else {
    const c = centerOf(minPoint, maxPoint);
    geoCenter = [c.x, c.y];
  }

  const inputClass = 'h-6 px-1.5 bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded text-cyan-600 dark:text-cyan-300 text-xs';

  const toolButtons: { tool: GraphTool; label: string; tooltip: string; icon: React.ReactNode }[] = [
    {
      tool: 'ADD_EXTEND',
      label: 'Add & Extend',
      tooltip: 'Click empty space to add a node connected to the selected node',
      icon: <Plus size={12} />,
    },
    {
      tool: 'CONNECT',
      label: 'Connect Nodes',
      tooltip: 'Click two existing nodes sequentially to add a connecting edge between them',
      icon: <LinkIcon size={12} />,
    },
    {
      tool: 'SELECT',
      label: 'Select / Move',
      tooltip: 'Click a node to make it the origin for new nodes, or drag it to move it',
      icon: <Move size={12} />,
    },
    {
      tool: 'DELETE',
      label: 'Delete',
      tooltip: 'Click any node or edge line to remove it from the graph',
      icon: <Trash2 size={12} />,
    },
  ];

  const editor = (
      <div
        className={
          isFullScreen
            ? 'fixed inset-0 z-[9999] bg-[var(--c-bg1)] p-4 md:p-6 flex flex-col h-screen w-screen space-y-3 overflow-hidden shadow-2xl animate-in fade-in duration-200'
            : 'space-y-3 bg-[var(--c-bg1)] p-3 rounded-lg border border-[var(--c-br1)]'
        }
      >
        {/* Header & Tool Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
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
                <p>{"1. Add & Extend: click empty space to place a node; it is linked to the selected node."}</p>
                <p>{"2. Select / Move: click a node to select it, drag it to move it (dragging also works in Add & Extend)."}</p>
                <p>{"3. Connect Nodes: click the origin node, then the target node (Esc cancels)."}</p>
                <p>{"4. Delete: click a node or an edge to remove it."}</p>
                <p>{"Nodes and edges outside the region or crossing forbidden obstacle zones are blocked."}</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {toolButtons.map(({ tool, label, tooltip, icon }) => (
              <Tooltip key={tool}>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      type="button"
                      variant={activeTool === tool ? (tool === 'DELETE' ? 'destructive' : 'default') : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      aria-pressed={activeTool === tool}
                      onClick={() => selectTool(tool)}
                    >
                      {icon}
                      <span>{label}</span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="text-[11px]">{tooltip}</TooltipContent>
              </Tooltip>
            ))}

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
                    <span>Labels</span>
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
                    onClick={() => toggleFullScreen(!isFullScreen)}
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
                    className="h-7 px-2 text-xs text-rose-400 hover:text-rose-600 dark:hover:text-rose-300"
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

        {/* Editor Area (Geospatial OpenStreetMap or 2D Plane Canvas) */}
        <div
          ref={containerRef}
          style={isFullScreen ? { height: 'calc(100vh - 140px)', width: '100%' } : { height: '340px', width: '100%' }}
          className={`relative w-full border border-[var(--c-br2)] rounded-md overflow-hidden select-none flex-1 min-h-0 ${
            activeTool === 'ADD_EXTEND' ? 'cursor-crosshair' : 'cursor-default'
          }`}
        >
          {isGeo ? (
            /* GEOSPATIAL MAP VIEW (Leaflet OpenStreetMap) */
            <MapContainer
              center={initialMapView?.center ?? geoCenter}
              zoom={initialMapView?.zoom ?? 6}
              minZoom={2}
              maxBounds={[[-90, -180], [90, 180]]}
              maxBoundsViscosity={1.0}
              worldCopyJump={false}
              scrollWheelZoom={true}
              doubleClickZoom={false}
              style={{ height: '100%', width: '100%', minHeight: isFullScreen ? 'calc(100vh - 140px)' : '340px', background: palette.deepBackground }}
            >
              <GraphMapEventsHandler
                activeTool={activeTool}
                nodes={nodes}
                selectedNodeId={selectedId}
                obstacles={obstacles}
                polygon={polygon}
                minPoint={minPoint}
                maxPoint={maxPoint}
                onAddNode={handleAddNode}
                onWarning={setWarningMsg}
              />
              <GraphMapResizeHandler isFullScreen={isFullScreen} />
              {/* The tracker goes first so it also records the view set by the auto-fit */}
              <GraphMapViewTracker onViewChange={handleMapViewChange} />
              <MapAutoFit polygon={polygon} minPoint={minPoint} maxPoint={maxPoint} enabled={initialMapView === null} />

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
                <div className="absolute top-2 left-2 z-[1000] bg-amber-100 dark:bg-amber-950/90 border border-amber-500/50 text-amber-700 dark:text-amber-200 text-[10px] font-mono px-2.5 py-1 rounded shadow-md flex items-center gap-2">
                  <WifiOff size={11} className="text-amber-400 shrink-0" />
                  <span>OFFLINE MODE - Technical Grid Active</span>
                </div>
              )}

              {/* Boundary Region: the geofence polygon, or the min/max box when there is none */}
              {polygon && polygon.length >= 3 ? (
                <LeafletPolygon
                  positions={polygon.map((p) => [p.x ?? 0, p.y ?? p.x ?? 0])}
                  pathOptions={REGION_STYLE}
                />
              ) : (
                <LeafletRectangle
                  bounds={[
                    [minPoint.x ?? 0, minPoint.y ?? 0],
                    [maxPoint.x ?? 0, maxPoint.y ?? 0],
                  ]}
                  pathOptions={REGION_STYLE}
                  // Not interactive, so clicks always reach the map (a prop: pathOptions is only a style)
                  interactive={false}
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
              {nodes.map((node) => (
                <GraphNodeMarker
                  key={node.id}
                  nodeId={node.id}
                  lat={node.x}
                  lon={node.y}
                  visualState={selectedId === node.id ? 'selected' : connectOriginId === node.id ? 'origin' : 'normal'}
                  draggable={canDrag}
                  showLabel={showCoordinateLabels}
                  onNodeClick={onMarkerClick}
                  onNodeDragEnd={onMarkerDragEnd}
                />
              ))}
            </MapContainer>
          ) : (
            /* 2D CARTESIAN PLANE VIEW (HTML5 Canvas). The plane is a pointer-only drawing surface (a click adds
               a node at the pointer position), hence presentational; its nodes are native buttons. */
            <div role="presentation" onClick={handleCanvasClick} data-testid="graph-plane" className="relative size-full">
              <canvas
                ref={canvasRef}
                width={canvasW}
                height={canvasH}
                className="absolute inset-0 size-full block pointer-events-none"
              />

              {/* SVG Overlay rendering Graph Edges in 2D mode */}
              <svg aria-label="Route edges" className="absolute inset-0 size-full pointer-events-none z-10">
                {edges.map((edge) => {
                  const fromNode = displayNodes.find((n) => n.id === edge.fromNodeId);
                  const toNode = displayNodes.find((n) => n.id === edge.toNodeId);
                  if (!fromNode || !toNode) return null;

                  const x1 = toCanvasX(fromNode.x);
                  const y1 = toCanvasY(fromNode.y);
                  const x2 = toCanvasX(toNode.x);
                  const y2 = toCanvasY(toNode.y);

                  return (
                    <g
                      key={edge.id}
                      className="pointer-events-auto cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdgeClick(edge);
                      }}
                    >
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
              {displayNodes.map((node) => {
                const isSelected = selectedId === node.id;
                const isConnectOrigin = connectOriginId === node.id;
                const isDragging = activeDrag?.nodeId === node.id;
                const cx = toCanvasX(node.x);
                const cy = toCanvasY(node.y);

                return (
                  <React.Fragment key={node.id}>
                    {showCoordinateLabels && (
                      <div
                        className="absolute -translate-x-1/2 -translate-y-full px-1.5 py-0.5 rounded bg-[var(--c-bg1)]/95 border border-cyan-400/80 text-[10px] font-mono font-bold text-cyan-600 dark:text-cyan-300 shadow-xl whitespace-nowrap pointer-events-none z-30"
                        style={{ left: `${cx}px`, top: `${cy - 8}px` }}
                      >
                        (X: {node.x.toFixed(1)}, Y: {node.y.toFixed(1)})
                      </div>
                    )}

                    {/* 22 px transparent hit area around the 10 px dot; a native button, so the node is
                        also reachable and usable (select / delete / connect) from the keyboard */}
                    <button
                      type="button"
                      data-testid={`graph-node-${node.id}`}
                      onPointerDown={(e) => handleNodePointerDown(e, node)}
                      onPointerMove={handleNodePointerMove}
                      onPointerUp={handleNodePointerUp}
                      onPointerCancel={handleNodePointerCancel}
                      onClick={(e) => handleNodeElementClick(e, node)}
                      className={`group absolute -translate-x-1/2 -translate-y-1/2 w-[22px] h-[22px] flex items-center justify-center touch-none z-30 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 ${
                        canDrag ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'
                      }`}
                      style={{ left: `${cx}px`, top: `${cy}px` }}
                    >
                      <span
                        className={`block w-2.5 h-2.5 rounded-full ${
                          isSelected
                            ? 'bg-cyan-400 ring-2 ring-cyan-400/80 shadow-md scale-125'
                            : isConnectOrigin
                            ? 'bg-amber-400 ring-2 ring-amber-400/80 scale-125'
                            : 'bg-[var(--c-bg2)] border-2 border-cyan-400 group-hover:bg-cyan-100 dark:group-hover:bg-cyan-950 group-hover:scale-110'
                        }`}
                      />
                      <span className="absolute left-full top-1/2 -translate-y-1/2 text-[10px] font-semibold text-cyan-600 dark:text-cyan-300 whitespace-nowrap pointer-events-none">
                        {node.name || node.id.replace('node-', '')}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* Forbidden Zone / Obstacle Warning Banner, over the editor so the view does not shift */}
          {warningMsg && (
            <div className="absolute top-2 left-14 right-2 z-[1100] flex items-center justify-between bg-rose-100 dark:bg-rose-950/90 border border-rose-500/80 text-rose-700 dark:text-rose-200 px-3 py-1.5 rounded text-xs shadow-md animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle size={14} className="text-rose-400 shrink-0" />
                <span>{warningMsg}</span>
              </div>
              <button
                type="button"
                aria-label="Dismiss warning"
                onClick={() => setWarningMsg(null)}
                className="text-rose-400 hover:text-rose-700 dark:hover:text-rose-200 text-xs font-bold px-1"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Active tool hint */}
          {nodes.length > 0 && (
            <div className="absolute top-2 right-2 z-[1000] max-w-[calc(100%-1rem)] truncate px-2 py-0.5 rounded bg-[var(--c-bg1)]/85 border border-[var(--c-br2)] text-[10px] text-[var(--c-tx3)] pointer-events-none">
              {TOOL_HINTS[activeTool]}
            </div>
          )}

          {/* Empty state hint overlay */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--c-tx4)] pointer-events-none space-y-1 z-[1000]">
              <Plus size={24} className="text-cyan-400/80 animate-pulse" />
              <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-300">
                {isGeo
                  ? 'Click anywhere on the map to set the initial geospatial route point'
                  : 'Click anywhere on the boundary plane to set the first route point'}
              </p>
              <p className="text-[10px] text-[var(--c-tx4)]">{"Subsequent clicks will add connected destination steps"}</p>
            </div>
          )}
        </div>

        {/* Selected Node Inspector Panel */}
        {selectedId && (() => {
          const targetNode = nodes.find((n) => n.id === selectedId);
          if (!targetNode) return null;

          return (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--c-bg2)]/80 p-2 px-3 rounded border border-[var(--c-br2)] text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <MapPin size={14} className="text-cyan-400" />
                  <Label className="text-[10px] text-cyan-400 font-semibold uppercase">Selected Node:</Label>
                  <CommitInput
                    key={`${targetNode.id}-name-${targetNode.name ?? ''}`}
                    value={targetNode.name || ''}
                    ariaLabel="Node name"
                    onCommit={(raw) => commitName(targetNode, raw)}
                    className={`${inputClass} w-24`}
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] text-cyan-400 font-semibold uppercase">{isGeo ? 'Lat:' : 'X:'}</Label>
                  <CommitInput
                    key={`${targetNode.id}-x-${targetNode.x}`}
                    value={String(targetNode.x)}
                    ariaLabel={isGeo ? 'Node latitude' : 'Node X'}
                    inputMode="decimal"
                    onCommit={(raw) => commitCoordinate(targetNode, 'x', raw)}
                    className={`${inputClass} w-20 font-mono`}
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] text-cyan-400 font-semibold uppercase">{isGeo ? 'Lon:' : 'Y:'}</Label>
                  <CommitInput
                    key={`${targetNode.id}-y-${targetNode.y}`}
                    value={String(targetNode.y)}
                    ariaLabel={isGeo ? 'Node longitude' : 'Node Y'}
                    inputMode="decimal"
                    onCommit={(raw) => commitCoordinate(targetNode, 'y', raw)}
                    className={`${inputClass} w-20 font-mono`}
                  />
                </div>
              </div>

              <div className="text-[10px] text-[var(--c-tx4)] font-mono">
                {"Graph: "}
                <span className="text-cyan-600 dark:text-cyan-300 font-semibold">{nodes.length}</span>
                {" nodes, "}
                <span className="text-cyan-600 dark:text-cyan-300 font-semibold">{edges.length}</span>
                {" edges"}
              </div>
            </div>
          );
        })()}
      </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      {/* In fullscreen the editor is rendered in <body>: inside the panel it would stay in the
          stacking context of its ancestors and the app bars and side panels would cover it */}
      {isFullScreen ? createPortal(editor, document.body) : editor}
    </TooltipProvider>
  );
};
