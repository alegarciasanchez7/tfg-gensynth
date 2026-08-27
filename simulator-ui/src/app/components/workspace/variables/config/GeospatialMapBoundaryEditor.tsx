import React, { useRef, useState, useEffect } from 'react';
import { Point3DCoord } from '../../../../types';

interface GeospatialMapBoundaryEditorProps {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  polygon?: Point3DCoord[];
  onChange: (bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number; polygon?: Point3DCoord[] }) => void;
  width?: number;
  height?: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  type: 'vertex' | 'edge';
  index: number;
  clickCoord: { lat: number; lon: number };
}

// Stylized landmass polygon outlines for world map background
const WORLD_LANDMASSES = [
  // North America
  [{ lat: 70, lon: -160 }, { lat: 70, lon: -60 }, { lat: 15, lon: -90 }, { lat: 30, lon: -120 }],
  // South America
  [{ lat: 10, lon: -80 }, { lat: -10, lon: -35 }, { lat: -50, lon: -70 }, { lat: -10, lon: -80 }],
  // Europe
  [{ lat: 70, lon: -10 }, { lat: 70, lon: 40 }, { lat: 35, lon: 35 }, { lat: 36, lon: -10 }],
  // Africa
  [{ lat: 35, lon: -15 }, { lat: 35, lon: 50 }, { lat: -35, lon: 30 }, { lat: -35, lon: 15 }],
  // Asia
  [{ lat: 70, lon: 40 }, { lat: 70, lon: 170 }, { lat: 10, lon: 130 }, { lat: 25, lon: 60 }],
  // Australia
  [{ lat: -12, lon: 115 }, { lat: -12, lon: 150 }, { lat: -38, lon: 145 }, { lat: -35, lon: 115 }],
];

export const GeospatialMapBoundaryEditor: React.FC<GeospatialMapBoundaryEditorProps> = ({
  minLat,
  maxLat,
  minLon,
  maxLon,
  polygon = [],
  onChange,
  width = 360,
  height = 180,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activePolygon, setActivePolygon] = useState<Point3DCoord[]>(
    polygon.length >= 3 ? polygon : [
      { x: minLat, y: minLon },
      { x: maxLat, y: minLon },
      { x: maxLat, y: maxLon },
      { x: minLat, y: maxLon },
    ]
  );

  // Zoom & Pan state for high precision geospatial editing
  const [zoom, setZoom] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    if (polygon && polygon.length >= 3) {
      setActivePolygon(polygon);
    }
  }, [polygon]);

  // Coordinate projection math with Zoom & Pan
  const toCanvasX = (lon: number) => {
    const base = ((lon + 180) / 360) * width;
    return width / 2 + (base - width / 2) * zoom + panOffset.x;
  };

  const toCanvasY = (lat: number) => {
    const base = height - ((lat + 90) / 180) * height;
    return height / 2 + (base - height / 2) * zoom + panOffset.y;
  };

  const fromCanvasLon = (px: number) => {
    const unprojected = (px - panOffset.x - width / 2) / zoom + width / 2;
    return Math.round(Math.max(-180, Math.min(180, (unprojected / width) * 360 - 180)) * 100) / 100;
  };

  const fromCanvasLat = (py: number) => {
    const unprojected = (py - panOffset.y - height / 2) / zoom + height / 2;
    return Math.round(Math.max(-90, Math.min(90, ((height - unprojected) / height) * 180 - 90)) * 100) / 100;
  };

  // Render world map projection, continents, graticule, and multi-vertex geo-fence
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Deep ocean background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // Render latitude / longitude graticule grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const stepDeg = zoom > 4 ? 5 : (zoom > 2 ? 15 : 30);
    for (let lon = -180; lon <= 180; lon += stepDeg) {
      const x = toCanvasX(lon);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let lat = -90; lat <= 90; lat += stepDeg) {
      const y = toCanvasY(lat);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Render Equator & Prime Meridian
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, toCanvasY(0));
    ctx.lineTo(width, toCanvasY(0));
    ctx.moveTo(toCanvasX(0), 0);
    ctx.lineTo(toCanvasX(0), height);
    ctx.stroke();

    // Render World Continents Landmasses
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    WORLD_LANDMASSES.forEach((land) => {
      ctx.beginPath();
      ctx.moveTo(toCanvasX(land[0].lon), toCanvasY(land[0].lat));
      for (let i = 1; i < land.length; i++) {
        ctx.lineTo(toCanvasX(land[i].lon), toCanvasY(land[i].lat));
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    // Render multi-vertex Geo-Fence polygon
    if (activePolygon.length >= 3) {
      ctx.beginPath();
      const first = activePolygon[0];
      ctx.moveTo(toCanvasX(first.y ?? first.x ?? 0), toCanvasY(first.x ?? 0));

      for (let i = 1; i < activePolygon.length; i++) {
        const pt = activePolygon[i];
        ctx.lineTo(toCanvasX(pt.y ?? pt.x ?? 0), toCanvasY(pt.x ?? 0));
      }
      ctx.closePath();

      ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
      ctx.fill();

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Render vertex markers
      activePolygon.forEach((pt, i) => {
        const cx = toCanvasX(pt.y ?? pt.x ?? 0);
        const cy = toCanvasY(pt.x ?? 0);

        ctx.fillStyle = draggingIndex === i ? '#f472b6' : '#34d399';
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#065f46';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }

    // Overlay info
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    ctx.fillText(`Zoom: ${zoom.toFixed(1)}x | Geofence Vertices: ${activePolygon.length}`, 8, height - 8);
  }, [activePolygon, draggingIndex, zoom, panOffset, width, height]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2) return;
    setContextMenu(null);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Check vertex hit
    let found: number | null = null;
    activePolygon.forEach((pt, i) => {
      const cx = toCanvasX(pt.y ?? pt.x ?? 0);
      const cy = toCanvasY(pt.x ?? 0);
      if (Math.hypot(mx - cx, my - cy) < 12) {
        found = i;
      }
    });

    if (found !== null) {
      setDraggingIndex(found);
    } else {
      // Start background pan
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingIndex !== null) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = Math.max(0, Math.min(width, e.clientX - rect.left));
      const mouseY = Math.max(0, Math.min(height, e.clientY - rect.top));

      const newLon = fromCanvasLon(mouseX);
      const newLat = fromCanvasLat(mouseY);

      const updated = activePolygon.map((pt, i) => (i === draggingIndex ? { x: newLat, y: newLon } : pt));
      setActivePolygon(updated);
      recalculateGeoBounds(updated);
    } else if (isPanning) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setDraggingIndex(null);
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.2 : 0.8;
    setZoom((prev) => Math.max(1.0, Math.min(20.0, prev * zoomFactor)));
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const clickCoord = { lat: fromCanvasLat(my), lon: fromCanvasLon(mx) };

    // Check vertex click
    for (let i = 0; i < activePolygon.length; i++) {
      const cx = toCanvasX(activePolygon[i].y ?? activePolygon[i].x ?? 0);
      const cy = toCanvasY(activePolygon[i].x ?? 0);
      if (Math.hypot(mx - cx, my - cy) < 12) {
        setContextMenu({ x: mx, y: my, type: 'vertex', index: i, clickCoord });
        return;
      }
    }

    // Check edge click
    const n = activePolygon.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = toCanvasX(activePolygon[i].y ?? activePolygon[i].x ?? 0);
      const y1 = toCanvasY(activePolygon[i].x ?? 0);
      const x2 = toCanvasX(activePolygon[j].y ?? activePolygon[j].x ?? 0);
      const y2 = toCanvasY(activePolygon[j].x ?? 0);

      const dist = pointToSegmentDistance(mx, my, x1, y1, x2, y2);
      if (dist < 10) {
        setContextMenu({ x: mx, y: my, type: 'edge', index: i, clickCoord });
        return;
      }
    }
  };

  const pointToSegmentDistance = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  };

  const handleInsertPointOnEdge = () => {
    if (!contextMenu || contextMenu.type !== 'edge') return;
    const edgeIndex = contextMenu.index;
    const newPt = { x: contextMenu.clickCoord.lat, y: contextMenu.clickCoord.lon };

    const updated = [...activePolygon];
    updated.splice(edgeIndex + 1, 0, newPt);

    setActivePolygon(updated);
    recalculateGeoBounds(updated);
    setContextMenu(null);
    showTempFeedback('Geofence point added on map boundary edge.');
  };

  const handleDeleteVertex = () => {
    if (!contextMenu || contextMenu.type !== 'vertex') return;
    if (activePolygon.length <= 3) {
      showTempFeedback('A geofence polygon must have at least 3 vertices.');
      setContextMenu(null);
      return;
    }

    const vertexIndex = contextMenu.index;
    const updated = activePolygon.filter((_, i) => i !== vertexIndex);

    setActivePolygon(updated);
    recalculateGeoBounds(updated);
    setContextMenu(null);
    showTempFeedback('Geofence point deleted. Polygon reconnected.');
  };

  const recalculateGeoBounds = (pts: Point3DCoord[]) => {
    const lats = pts.map((p) => p.x ?? 0);
    const lons = pts.map((p) => p.y ?? p.x ?? 0);

    const calculatedMinLat = Math.min(...lats);
    const calculatedMaxLat = Math.max(...lats);
    const calculatedMinLon = Math.min(...lons);
    const calculatedMaxLon = Math.max(...lons);

    onChange({
      minLat: calculatedMinLat,
      maxLat: calculatedMaxLat,
      minLon: calculatedMinLon,
      maxLon: calculatedMaxLon,
      polygon: pts,
    });
  };

  const applyPreset = (preset: 'WORLD' | 'EUROPE' | 'NORTH_AMERICA' | 'ASIA') => {
    let pts: Point3DCoord[] = [];
    switch (preset) {
      case 'WORLD':
        pts = [{ x: -90, y: -180 }, { x: 90, y: -180 }, { x: 90, y: 180 }, { x: -90, y: 180 }];
        setZoom(1.0);
        setPanOffset({ x: 0, y: 0 });
        break;
      case 'EUROPE':
        pts = [{ x: 35.0, y: -10.0 }, { x: 71.0, y: -10.0 }, { x: 71.0, y: 40.0 }, { x: 35.0, y: 40.0 }];
        setZoom(2.5);
        setPanOffset({ x: 40, y: -30 });
        break;
      case 'NORTH_AMERICA':
        pts = [{ x: 15.0, y: -170.0 }, { x: 72.0, y: -170.0 }, { x: 72.0, y: -50.0 }, { x: 15.0, y: -50.0 }];
        setZoom(2.0);
        setPanOffset({ x: -120, y: -20 });
        break;
      case 'ASIA':
        pts = [{ x: -10.0, y: 60.0 }, { x: 55.0, y: 60.0 }, { x: 55.0, y: 150.0 }, { x: -10.0, y: 150.0 }];
        setZoom(2.0);
        setPanOffset({ x: 150, y: -10 });
        break;
    }
    setActivePolygon(pts);
    recalculateGeoBounds(pts);
  };

  const showTempFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  return (
    <div className="space-y-2 relative" onClick={() => setContextMenu(null)}>
      <div className="flex items-center justify-between text-[11px] text-[var(--c-tx4)]">
        <span>Geographic World Map ({activePolygon.length} Vertices)</span>
        <div className="flex items-center gap-1.5 text-[9px]">
          {/* Zoom Controls */}
          <div className="flex items-center border border-[var(--c-br1)] rounded overflow-hidden bg-white/5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(20.0, z * 1.5))}
              className="px-2 py-0.5 hover:bg-white/10 text-white font-bold"
              title="Zoom In (+)"
            >
              +
            </button>
            <span className="px-1.5 text-[var(--c-tx3)] font-mono">{zoom.toFixed(1)}x</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1.0, z / 1.5))}
              className="px-2 py-0.5 hover:bg-white/10 text-white font-bold"
              title="Zoom Out (-)"
            >
              -
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setZoom(1.0);
              setPanOffset({ x: 0, y: 0 });
            }}
            className="px-1.5 py-0.5 rounded border border-[var(--c-br1)] bg-white/5 hover:bg-white/10"
            title="Reset Zoom & Pan"
          >
            Reset
          </button>

          {/* Regional Presets */}
          <button type="button" onClick={() => applyPreset('WORLD')} className="px-1.5 py-0.5 rounded border border-[var(--c-br1)] bg-white/5 hover:bg-white/10">World</button>
          <button type="button" onClick={() => applyPreset('EUROPE')} className="px-1.5 py-0.5 rounded border border-[var(--c-br1)] bg-white/5 hover:bg-white/10">Europe</button>
          <button type="button" onClick={() => applyPreset('NORTH_AMERICA')} className="px-1.5 py-0.5 rounded border border-[var(--c-br1)] bg-white/5 hover:bg-white/10">N. America</button>
          <button type="button" onClick={() => applyPreset('ASIA')} className="px-1.5 py-0.5 rounded border border-[var(--c-br1)] bg-white/5 hover:bg-white/10">Asia</button>
        </div>
      </div>

      {feedbackMsg && (
        <div className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded px-2.5 py-1">
          {feedbackMsg}
        </div>
      )}

      <div className="relative rounded border border-[var(--c-br1)] overflow-hidden flex justify-center bg-[var(--c-bg2)]">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
          className="cursor-crosshair"
        />

        {/* Context Menu */}
        {contextMenu && (
          <div
            style={{ left: contextMenu.x, top: contextMenu.y }}
            className="absolute z-50 bg-[var(--c-bg4)] border border-[var(--c-br1)] rounded shadow-xl py-1 text-xs text-[var(--c-tx1)] animate-in fade-in duration-100"
          >
            {contextMenu.type === 'edge' && (
              <button
                type="button"
                onClick={handleInsertPointOnEdge}
                className="w-full text-left px-3 py-1.5 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span>+ Insert Geofence Point Here on Edge</span>
              </button>
            )}
            {contextMenu.type === 'vertex' && (
              <button
                type="button"
                onClick={handleDeleteVertex}
                className={`w-full text-left px-3 py-1.5 transition-colors flex items-center gap-2 cursor-pointer ${
                  activePolygon.length <= 3
                    ? 'opacity-50 text-[var(--c-tx4)] cursor-not-allowed'
                    : 'hover:bg-red-500/20 hover:text-red-400'
                }`}
              >
                <span>✕ Delete Point (Min 3 required)</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
