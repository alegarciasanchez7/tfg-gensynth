import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Rectangle, Polyline, Tooltip as LeafletTooltip, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Point3DCoord, AltitudeUnit, AltitudeReference, AltitudePattern } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
import { Button } from '../../../ui/button';
import { Info, BoxSelect, AlertTriangle, WifiOff, Maximize2, Minimize2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../../ui/tooltip';
import { useBoundaryModalContext } from './BoundaryExpandModal';

// Helper to format DMS coordinates for map tooltips & cursor HUD
const formatDmsHelper = (val: number, isLat: boolean) => {
  const absVal = Math.abs(val);
  const deg = Math.floor(absVal);
  const minFull = (absVal - deg) * 60;
  const min = Math.floor(minFull);
  const sec = Math.round((minFull - min) * 60 * 100) / 100;
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  return `${deg}° ${min}' ${sec.toFixed(2)}" ${dir}`;
};

// Technical Lat/Lon Coordinate Grid Layer for Offline Fallback Mode
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
        <Polyline
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

// Fix default Leaflet marker icon asset URLs for React bundler
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface GeospatialMapBoundaryEditorProps {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  minAlt?: number;
  maxAlt?: number;
  altitudeUnit?: AltitudeUnit;
  altitudeReference?: AltitudeReference;
  altitudePattern?: AltitudePattern;
  initialAltitude?: number;
  maxVerticalStep?: number;
  altitudeOscillationSpeed?: number;
  polygon?: Point3DCoord[];
  onChange: (bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    minAlt?: number;
    maxAlt?: number;
    altitudeUnit?: AltitudeUnit;
    altitudeReference?: AltitudeReference;
    altitudePattern?: AltitudePattern;
    initialAltitude?: number;
    maxVerticalStep?: number;
    altitudeOscillationSpeed?: number;
    polygon?: Point3DCoord[];
  }) => void;
  width?: number;
  height?: number;
}

interface SelectionBounds {
  start: L.LatLng;
  current: L.LatLng;
}

// Custom Map Selection & Event Handler
function MapEventsHelper({
  isDrawMode,
  isDraggingMarkerRef,
  onBoxSelectionComplete,
  onMapRightClick,
  onCursorMove,
  onCursorLeave,
}: {
  isDrawMode: boolean;
  isDraggingMarkerRef: React.RefObject<boolean>;
  onBoxSelectionComplete: (minLat: number, maxLat: number, minLon: number, maxLon: number) => void;
  onMapRightClick: (lat: number, lon: number) => void;
  onCursorMove: (lat: number, lon: number) => void;
  onCursorLeave: () => void;
}) {
  const [selection, setSelection] = useState<SelectionBounds | null>(null);
  const isSelectingRef = useRef(false);

  const map = useMapEvents({
    mousedown(e) {
      if (!isDrawMode) return;
      const target = e.originalEvent.target as HTMLElement;
      if (target && (target.closest('.leaflet-marker-icon') || target.closest('.leaflet-interactive'))) {
        return;
      }
      if (e.originalEvent.button === 0) {
        isSelectingRef.current = true;
        setSelection({ start: e.latlng, current: e.latlng });
        map.dragging.disable();
      }
    },
    mousemove(e) {
      if (isDraggingMarkerRef.current) return;
      onCursorMove(e.latlng.lat, e.latlng.lng);
      if (isDrawMode && isSelectingRef.current && selection) {
        setSelection((prev) => (prev ? { ...prev, current: e.latlng } : null));
      }
    },
    mouseout() {
      if (!isDraggingMarkerRef.current) {
        onCursorLeave();
      }
    },
    mouseup(e) {
      if (isDrawMode && isSelectingRef.current && selection) {
        isSelectingRef.current = false;
        map.dragging.enable();
        const lat1 = selection.start.lat;
        const lat2 = e.latlng.lat;
        const lon1 = selection.start.lng;
        const lon2 = e.latlng.lng;
        if (Math.abs(lat1 - lat2) > 0.001 || Math.abs(lon1 - lon2) > 0.001) {
          const minLat = Math.round(Math.min(lat1, lat2) * 10000) / 10000;
          const maxLat = Math.round(Math.max(lat1, lat2) * 10000) / 10000;
          const minLon = Math.round(Math.min(lon1, lon2) * 10000) / 10000;
          const maxLon = Math.round(Math.max(lon1, lon2) * 10000) / 10000;
          onBoxSelectionComplete(minLat, maxLat, minLon, maxLon);
        }
        setSelection(null);
      }
    },
    contextmenu(e) {
      onMapRightClick(e.latlng.lat, e.latlng.lng);
    },
  });

  return selection ? (
    <Rectangle
      bounds={[
        [selection.start.lat, selection.start.lng],
        [selection.current.lat, selection.current.lng],
      ]}
      pathOptions={{
        color: '#f43f5e',
        fillColor: '#f43f5e',
        fillOpacity: 0.25,
        dashArray: '5, 5',
      }}
    />
  ) : null;
}

// Helper component to automatically fit Leaflet map bounds ONLY ONCE when loading initial geofence polygon
function MapAutoFitBounds({ polygon }: { polygon: Point3DCoord[] }) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (!hasFittedRef.current && polygon && polygon.length >= 3) {
      hasFittedRef.current = true;
      const bounds = L.latLngBounds(polygon.map((p) => [p.x ?? 0, p.y ?? p.x ?? 0]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [30, 30],
          maxZoom: 16,
          animate: false,
        });
      }
    }
  }, [map, polygon]);

  return null;
}

// Leaflet Map Resize Invalidater Helper
function MapResizeHandler({ isExpanded }: { isExpanded: boolean }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [isExpanded, map]);
  return null;
}

export const GeospatialMapBoundaryEditor: React.FC<GeospatialMapBoundaryEditorProps> = ({
  minLat,
  maxLat,
  minLon,
  maxLon,
  minAlt = 0,
  maxAlt = 100,
  altitudeUnit = 'METERS',
  altitudeReference = 'MSL',
  altitudePattern = 'FOLLOW_XY',
  initialAltitude,
  maxVerticalStep = 1.0,
  altitudeOscillationSpeed = 0.1,
  polygon = [],
  onChange,
  height = 280,
}) => {
  const modalCtx = useBoundaryModalContext();
  const [isMapExpanded, setIsMapExpanded] = useState(modalCtx?.isFullScreen ?? false);

  useEffect(() => {
    if (modalCtx && modalCtx.isFullScreen !== isMapExpanded) {
      setIsMapExpanded(modalCtx.isFullScreen);
    }
  }, [modalCtx?.isFullScreen]);

  const handleToggleExpandMap = () => {
    const nextVal = !isMapExpanded;
    setIsMapExpanded(nextVal);
    if (modalCtx && modalCtx.setIsFullScreen) {
      modalCtx.setIsFullScreen(nextVal);
    }
  };

  const [activePolygon, setActivePolygon] = useState<Point3DCoord[]>(
    polygon.length >= 3
      ? polygon
      : [
          { x: minLat, y: minLon, z: minAlt },
          { x: maxLat, y: minLon, z: minAlt },
          { x: maxLat, y: maxLon, z: minAlt },
          { x: minLat, y: maxLon, z: minAlt },
        ]
  );

  const [minAltStr, setMinAltStr] = useState(String(minAlt));
  const [maxAltStr, setMaxAltStr] = useState(String(maxAlt));
  const [initialAltStr, setInitialAltStr] = useState(initialAltitude !== undefined ? String(initialAltitude) : '');
  const [cursorPos, setCursorPos] = useState<{ lat: number; lon: number } | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

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

  useEffect(() => {
    setMinAltStr(String(minAlt));
    setMaxAltStr(String(maxAlt));
    setInitialAltStr(initialAltitude !== undefined ? String(initialAltitude) : '');
  }, [minAlt, maxAlt, initialAltitude]);

  useEffect(() => {
    if (polygon && polygon.length >= 3) {
      setActivePolygon(polygon);
    }
  }, [polygon]);

  const showTempFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const positions = useMemo(() => {
    return activePolygon.map((p) => [p.x ?? 0, p.y ?? p.x ?? 0] as [number, number]);
  }, [activePolygon]);

  const centerLat = useMemo(() => {
    const lats = activePolygon.map((p) => p.x ?? 0);
    return (Math.min(...lats) + Math.max(...lats)) / 2 || 40.0;
  }, [activePolygon]);

  const centerLon = useMemo(() => {
    const lons = activePolygon.map((p) => p.y ?? p.x ?? 0);
    return (Math.min(...lons) + Math.max(...lons)) / 2 || -3.0;
  }, [activePolygon]);

  const [isDrawMode, setIsDrawMode] = useState(false);
  const [showConfirmDrawModal, setShowConfirmDrawModal] = useState(false);

  const handleToggleDrawMode = () => {
    if (isDrawMode) {
      setIsDrawMode(false);
      return;
    }
    if (activePolygon && activePolygon.length >= 3) {
      setShowConfirmDrawModal(true);
    } else {
      setIsDrawMode(true);
    }
  };

  const confirmStartDrawMode = () => {
    setShowConfirmDrawModal(false);
    setIsDrawMode(true);
  };

  const handleBoxSelectionComplete = (
    calculatedMinLat: number,
    calculatedMaxLat: number,
    calculatedMinLon: number,
    calculatedMaxLon: number
  ) => {
    const currentZ = parseFloat(minAltStr) || minAlt;
    const newPolygon: Point3DCoord[] = [
      { x: calculatedMinLat, y: calculatedMinLon, z: currentZ },
      { x: calculatedMaxLat, y: calculatedMinLon, z: currentZ },
      { x: calculatedMaxLat, y: calculatedMaxLon, z: currentZ },
      { x: calculatedMinLat, y: calculatedMaxLon, z: currentZ },
    ];

    setActivePolygon(newPolygon);
    setIsDrawMode(false);
    onChange({
      minLat: calculatedMinLat,
      maxLat: calculatedMaxLat,
      minLon: calculatedMinLon,
      maxLon: calculatedMaxLon,
      minAlt: parseFloat(minAltStr) || minAlt,
      maxAlt: parseFloat(maxAltStr) || maxAlt,
      altitudeUnit,
      altitudeReference,
      polygon: newPolygon,
    });
    showTempFeedback('Geofence boundaries updated from drag selection box!');
  };

  const isDraggingMarkerRef = useRef(false);
  const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null);

  const handleMarkerDragStart = (index: number) => {
    isDraggingMarkerRef.current = true;
    setActiveDragIndex(index);
  };

  const handleMarkerDragEnd = (index: number, newLat: number, newLon: number) => {
    isDraggingMarkerRef.current = false;
    setActiveDragIndex(null);
    const roundedLat = Math.round(newLat * 10000) / 10000;
    const roundedLon = Math.round(newLon * 10000) / 10000;
    const updated = activePolygon.map((pt, i) =>
      i === index ? { ...pt, x: roundedLat, y: roundedLon } : pt
    );
    setActivePolygon(updated);
    recalculateGeoBounds(updated);
  };

  const handleMapRightClick = (lat: number, lon: number) => {
    const roundedLat = Math.round(lat * 10000) / 10000;
    const roundedLon = Math.round(lon * 10000) / 10000;
    const currentZ = parseFloat(minAltStr) || minAlt;
    const newPt = { x: roundedLat, y: roundedLon, z: currentZ };

    let bestIndex = activePolygon.length - 1;
    let minDist = Infinity;
    for (let i = 0; i < activePolygon.length; i++) {
      const p1 = activePolygon[i];
      const p2 = activePolygon[(i + 1) % activePolygon.length];
      const dist = Math.hypot(
        lat - ((p1.x ?? 0) + (p2.x ?? 0)) / 2,
        lon - ((p1.y ?? p1.x ?? 0) + (p2.y ?? p2.x ?? 0)) / 2
      );
      if (dist < minDist) {
        minDist = dist;
        bestIndex = i;
      }
    }
    const updated = [...activePolygon];
    updated.splice(bestIndex + 1, 0, newPt);
    setActivePolygon(updated);
    recalculateGeoBounds(updated);
    showTempFeedback('Geofence vertex added.');
  };

  const handleDeleteVertex = (index: number) => {
    if (activePolygon.length <= 3) {
      showTempFeedback('A geofence polygon must have at least 3 vertices.');
      return;
    }
    const updated = activePolygon.filter((_, i) => i !== index);
    setActivePolygon(updated);
    recalculateGeoBounds(updated);
    showTempFeedback('Geofence vertex deleted.');
  };

  const recalculateGeoBounds = (pts: Point3DCoord[]) => {
    const lats = pts.map((p) => p.x ?? 0);
    const lons = pts.map((p) => p.y ?? p.x ?? 0);
    onChange({
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLon: Math.min(...lons),
      maxLon: Math.max(...lons),
      minAlt: parseFloat(minAltStr) || minAlt,
      maxAlt: parseFloat(maxAltStr) || maxAlt,
      altitudeUnit,
      altitudeReference,
      polygon: pts,
    });
  };

  const handleAltitudeChange = (newMin: number, newMax: number) => {
    onChange({
      minLat,
      maxLat,
      minLon,
      maxLon,
      minAlt: newMin,
      maxAlt: newMax,
      altitudeUnit,
      altitudeReference,
      altitudePattern,
      initialAltitude: parseFloat(initialAltStr) || initialAltitude,
      maxVerticalStep,
      altitudeOscillationSpeed,
      polygon: activePolygon,
    });
  };

  const handleUnitChange = (newUnit: AltitudeUnit) => {
    onChange({
      minLat,
      maxLat,
      minLon,
      maxLon,
      minAlt: parseFloat(minAltStr) || minAlt,
      maxAlt: parseFloat(maxAltStr) || maxAlt,
      altitudeUnit: newUnit,
      altitudeReference,
      altitudePattern,
      initialAltitude: parseFloat(initialAltStr) || initialAltitude,
      maxVerticalStep,
      altitudeOscillationSpeed,
      polygon: activePolygon,
    });
  };

  const handleReferenceChange = (newRef: AltitudeReference) => {
    onChange({
      minLat,
      maxLat,
      minLon,
      maxLon,
      minAlt: parseFloat(minAltStr) || minAlt,
      maxAlt: parseFloat(maxAltStr) || maxAlt,
      altitudeUnit,
      altitudeReference: newRef,
      altitudePattern,
      initialAltitude: parseFloat(initialAltStr) || initialAltitude,
      maxVerticalStep,
      altitudeOscillationSpeed,
      polygon: activePolygon,
    });
  };

  const handlePatternChange = (newPattern: AltitudePattern) => {
    onChange({
      minLat,
      maxLat,
      minLon,
      maxLon,
      minAlt: parseFloat(minAltStr) || minAlt,
      maxAlt: parseFloat(maxAltStr) || maxAlt,
      altitudeUnit,
      altitudeReference,
      altitudePattern: newPattern,
      initialAltitude: parseFloat(initialAltStr) || initialAltitude,
      maxVerticalStep,
      altitudeOscillationSpeed,
      polygon: activePolygon,
    });
  };

  const handleInitialAltChange = (newInitAlt?: number) => {
    onChange({
      minLat,
      maxLat,
      minLon,
      maxLon,
      minAlt: parseFloat(minAltStr) || minAlt,
      maxAlt: parseFloat(maxAltStr) || maxAlt,
      altitudeUnit,
      altitudeReference,
      altitudePattern,
      initialAltitude: newInitAlt,
      maxVerticalStep,
      altitudeOscillationSpeed,
      polygon: activePolygon,
    });
  };

  const handleVerticalStepChange = (newStep: number) => {
    onChange({
      minLat,
      maxLat,
      minLon,
      maxLon,
      minAlt: parseFloat(minAltStr) || minAlt,
      maxAlt: parseFloat(maxAltStr) || maxAlt,
      altitudeUnit,
      altitudeReference,
      altitudePattern,
      initialAltitude: parseFloat(initialAltStr) || initialAltitude,
      maxVerticalStep: newStep,
      altitudeOscillationSpeed,
      polygon: activePolygon,
    });
  };

  const handleOscillationSpeedChange = (newSpeed: number) => {
    onChange({
      minLat,
      maxLat,
      minLon,
      maxLon,
      minAlt: parseFloat(minAltStr) || minAlt,
      maxAlt: parseFloat(maxAltStr) || maxAlt,
      altitudeUnit,
      altitudeReference,
      altitudePattern,
      initialAltitude: parseFloat(initialAltStr) || initialAltitude,
      maxVerticalStep,
      altitudeOscillationSpeed: newSpeed,
      polygon: activePolygon,
    });
  };

  const applyPreset = (preset: 'WORLD' | 'EUROPE' | 'IBERIA' | 'NORTH_AMERICA' | 'ASIA') => {
    let pts: Point3DCoord[] = [];
    const currentZ = parseFloat(minAltStr) || minAlt;
    switch (preset) {
      case 'WORLD':
        pts = [{ x: -60, y: -160, z: currentZ }, { x: 75, y: -160, z: currentZ }, { x: 75, y: 160, z: currentZ }, { x: -60, y: 160, z: currentZ }];
        break;
      case 'EUROPE':
        pts = [{ x: 35.0, y: -10.0, z: currentZ }, { x: 71.0, y: -10.0, z: currentZ }, { x: 71.0, y: 40.0, z: currentZ }, { x: 35.0, y: 40.0, z: currentZ }];
        break;
      case 'IBERIA':
        pts = [{ x: 36.0, y: -9.5, z: currentZ }, { x: 43.8, y: -9.5, z: currentZ }, { x: 43.8, y: 3.3, z: currentZ }, { x: 36.0, y: 3.3, z: currentZ }];
        break;
      case 'NORTH_AMERICA':
        pts = [{ x: 24.0, y: -125.0, z: currentZ }, { x: 49.0, y: -125.0, z: currentZ }, { x: 49.0, y: -66.0, z: currentZ }, { x: 24.0, y: -66.0, z: currentZ }];
        break;
      case 'ASIA':
        pts = [{ x: 5.0, y: 60.0, z: currentZ }, { x: 55.0, y: 60.0, z: currentZ }, { x: 55.0, y: 145.0, z: currentZ }, { x: 5.0, y: 145.0, z: currentZ }];
        break;
    }
    setActivePolygon(pts);
    recalculateGeoBounds(pts);
    showTempFeedback(`Applied ${preset} region geofence preset.`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs bg-[var(--c-bg2)] p-2 rounded border border-[var(--c-br1)]">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[var(--c-tx4)] font-medium mr-1 uppercase">Presets:</span>
          {(['IBERIA', 'EUROPE', 'WORLD', 'NORTH_AMERICA', 'ASIA'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => applyPreset(preset)}
              className="px-2 py-0.5 rounded text-[10px] bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors border border-violet-500/20 cursor-pointer"
            >
              {preset}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-[var(--c-tx4)]">
          {isDrawMode ? 'Click & drag box on map' : 'Drag vertices • Right-click to add/delete • Shift to pan'}
        </div>
      </div>

      {feedbackMsg && (
        <div className="px-2.5 py-1 text-[10px] rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 animate-pulse">
          {feedbackMsg}
        </div>
      )}

      {/* Confirmation Modal when replacing existing region */}
      {showConfirmDrawModal && (
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 max-w-md w-full shadow-2xl space-y-4 text-slate-200">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle size={20} className="shrink-0" />
              <h3 className="font-semibold text-sm">Draw New Geofence Region?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Creating a new selection box will replace your current {activePolygon.length}-vertex geofence region.
              Are you sure you want to delete the existing region and draw a new region box?
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmDrawModal(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={confirmStartDrawMode}
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
              >
                Proceed & Draw New Region
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded border border-[var(--c-br1)] overflow-hidden relative transition-all duration-300" style={{ height: isMapExpanded ? 'calc(100vh - 145px)' : `${height}px` }}>
        {/* Custom Map Expand / Maximize Button Overlay (directly below +/- Leaflet zoom controls) */}
        <div className="absolute top-[74px] left-[10px] z-[1000]">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleToggleExpandMap}
                className="w-7 h-7 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 rounded shadow-md flex items-center justify-center text-slate-200 hover:text-cyan-400 transition-colors cursor-pointer"
                aria-label={isMapExpanded ? 'Restore Normal Map View' : 'Expand Full Map View'}
              >
                {isMapExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-[10px] px-2 py-1 leading-tight">
              {isMapExpanded ? 'Restore normal view' : 'Expand full map view'}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Compact Bottom-Left "New Box Region" Button Overlay */}
        <button
          type="button"
          onClick={handleToggleDrawMode}
          className={`absolute bottom-2 left-2 z-[1000] px-2 py-1 rounded text-[9px] font-medium flex items-center gap-1 transition-all cursor-pointer border backdrop-blur shadow-md ${
            isDrawMode
              ? 'bg-rose-950/90 text-rose-300 border-rose-500/50 animate-pulse'
              : 'bg-slate-900/85 text-cyan-300 hover:bg-slate-800 border-slate-700/80 hover:border-cyan-500/40'
          }`}
        >
          <BoxSelect size={10} />
          <span>{isDrawMode ? 'Cancel Selection' : 'New Box Region'}</span>
        </button>

        {/* Active Drawing Mode Banner Overlay */}
        {isDrawMode && (
          <div className="absolute top-2 left-2 z-[1000] bg-rose-950/90 border border-rose-500/50 text-rose-200 text-[10px] font-mono px-3 py-1.5 rounded shadow-lg flex items-center gap-2 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span className="font-semibold uppercase tracking-wider">BOX DRAWING MODE ACTIVE</span>
            <span className="text-[9px] text-rose-300 opacity-90">• Drag selection box on map</span>
            <button
              type="button"
              onClick={() => setIsDrawMode(false)}
              className="ml-2 underline hover:text-white font-sans text-[10px] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Offline Mode Automatic Fallback Banner */}
        {isOffline && (
          <div className="absolute top-2 left-2 z-[1000] bg-amber-950/90 border border-amber-500/50 text-amber-200 text-[10px] font-mono px-3 py-1.5 rounded shadow-lg flex items-center gap-2">
            <WifiOff size={12} className="text-amber-400 shrink-0" />
            <span className="font-semibold uppercase tracking-wider">OFFLINE MODE ACTIVE</span>
            <span className="text-[9px] text-amber-300 opacity-90">• Technical Lat/Lon Grid Canvas Active</span>
            <button
              type="button"
              onClick={() => setIsOffline(false)}
              className="ml-2 underline hover:text-white font-sans text-[10px] cursor-pointer"
            >
              Retry Online Map
            </button>
          </div>
        )}

        {/* Real-Time Live Cursor & Dragging Node Coordinates HUD Badge Overlay */}
        <div className="absolute top-2 right-2 z-[1000] bg-slate-900/90 backdrop-blur border border-slate-700/80 text-[10px] font-mono px-2.5 py-1.5 rounded shadow-lg pointer-events-none text-slate-200 flex items-center gap-3">
          {activeDragIndex !== null ? (
            <div className="flex items-center gap-1.5 text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span className="font-semibold text-[9px] uppercase tracking-wider text-amber-400">MOVING POINT #{activeDragIndex + 1}:</span>
              <span>
                {(activePolygon[activeDragIndex]?.x ?? 0).toFixed(4)}° {(activePolygon[activeDragIndex]?.x ?? 0) >= 0 ? 'N' : 'S'}, {(activePolygon[activeDragIndex]?.y ?? activePolygon[activeDragIndex]?.x ?? 0).toFixed(4)}° {(activePolygon[activeDragIndex]?.y ?? activePolygon[activeDragIndex]?.x ?? 0) >= 0 ? 'E' : 'W'}
              </span>
            </div>
          ) : cursorPos ? (
            <>
              <div className="flex items-center gap-1.5 text-cyan-300">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                <span className="font-semibold text-[9px] uppercase tracking-wider text-cyan-400">CURSOR:</span>
                <span>
                  {cursorPos.lat.toFixed(4)}° {cursorPos.lat >= 0 ? 'N' : 'S'}, {cursorPos.lon.toFixed(4)}° {cursorPos.lon >= 0 ? 'E' : 'W'}
                </span>
              </div>
              <div className="text-[9px] text-slate-400 border-l border-slate-700 pl-2">
                {formatDmsHelper(cursorPos.lat, true)}, {formatDmsHelper(cursorPos.lon, false)}
              </div>
            </>
          ) : (
            <div className="text-slate-400 italic text-[9px]">Hover or drag point markers for live coordinates</div>
          )}
        </div>

        <MapContainer
          center={[centerLat, centerLon]}
          zoom={5}
          minZoom={2}
          maxBounds={[[-90, -180], [90, 180]]}
          maxBoundsViscosity={1.0}
          worldCopyJump={false}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%', background: '#0f172a' }}
        >
          {!isOffline && (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              subdomains={['a', 'b', 'c']}
              noWrap={true}
              maxZoom={19}
              keepBuffer={6}
              updateWhenZooming={false}
              updateWhenIdle={true}
              crossOrigin={true}
              bounds={[[-90, -180], [90, 180]]}
              eventHandlers={{
                tileerror: () => setIsOffline(true),
              }}
            />
          )}
          {isOffline && <OfflineGridOverlay />}
          <MapEventsHelper
            isDrawMode={isDrawMode}
            isDraggingMarkerRef={isDraggingMarkerRef}
            onBoxSelectionComplete={handleBoxSelectionComplete}
            onMapRightClick={handleMapRightClick}
            onCursorMove={(lat, lon) => setCursorPos({ lat, lon })}
            onCursorLeave={() => setCursorPos(null)}
          />
          <MapAutoFitBounds polygon={activePolygon} />
          <MapResizeHandler isExpanded={isMapExpanded} />
          {positions.length >= 3 && (
            <Polygon
              positions={positions}
              pathOptions={{
                color: '#8b5cf6',
                fillColor: '#8b5cf6',
                fillOpacity: 0.2,
                weight: 2,
                interactive: false,
              }}
            />
          )}
          {activePolygon.map((pt, i) => (
            <Marker
              key={i}
              position={[pt.x ?? 0, pt.y ?? pt.x ?? 0]}
              draggable={true}
              eventHandlers={{
                dragstart: () => {
                  handleMarkerDragStart(i);
                },
                dragend: (e) => {
                  const latLng = e.target.getLatLng();
                  handleMarkerDragEnd(i, latLng.lat, latLng.lng);
                },
                contextmenu: () => {
                  handleDeleteVertex(i);
                },
              }}
            >
              <LeafletTooltip direction="top" offset={[0, -20]} opacity={0.95}>
                <div className="font-mono text-[10px] leading-snug">
                  <div className="font-semibold text-violet-400">Point #{i + 1}</div>
                  <div>
                    {(pt.x ?? 0).toFixed(4)}° {(pt.x ?? 0) >= 0 ? 'N' : 'S'}, {(pt.y ?? pt.x ?? 0).toFixed(4)}° {(pt.y ?? pt.x ?? 0) >= 0 ? 'E' : 'W'}
                  </div>
                  <div className="text-[9px] text-slate-400">
                    {formatDmsHelper(pt.x ?? 0, true)}, {formatDmsHelper(pt.y ?? pt.x ?? 0, false)}
                  </div>
                </div>
              </LeafletTooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {isMapExpanded ? (
        <div className="flex items-center justify-between p-2.5 rounded border border-cyan-500/30 bg-cyan-950/30 text-[11px] text-cyan-300">
          <span>Full Map View Active — Altitude settings are hidden to maximize map area.</span>
          <button
            type="button"
            onClick={handleToggleExpandMap}
            className="underline hover:text-white cursor-pointer font-medium text-xs"
          >
            Restore Altitude Settings &amp; Normal View
          </button>
        </div>
      ) : (
        <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] uppercase text-[var(--c-tx4)]">
              Geospatial Altitude Dynamics & Datum Settings
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={10} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[340px] space-y-1.5 p-3 text-[11px] leading-relaxed">
                <p className="font-semibold text-violet-300">Altitude & Elevation Dynamics Workflow:</p>
                <p>1. Pattern: Select how elevation Z varies independently from 2D map movement.</p>
                <p>2. Dynamic Inputs: Configure single fixed height or min/max elevation range & step limits.</p>
                <p>3. Unit & Reference: Select measurement unit and physical datum baseline (MSL / AGL / Ellipsoid).</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* 1. FIRST: Independent Altitude Dynamics Pattern Selector */}
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <Label htmlFor="geo-alt-pattern" className="text-[9px] text-[var(--c-tx4)]">Independent Altitude Dynamics Pattern</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={9} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[300px] p-2 text-[10px] leading-relaxed space-y-1">
                <p className="font-semibold text-emerald-300">Vertical (Z) Generation Dynamics:</p>
                <p>• Follow Primary XY: Inherits motion from 2D plane.</p>
                <p>• Fixed Altitude: Constant fixed elevation height.</p>
                <p>• Random Elevation: Uniform random value in [Min Alt, Max Alt] per tick.</p>
                <p>• Climb & Descent Walk: Smooth continuous step ascent and descent.</p>
                <p>• Sinusoidal Oscillation: Smooth hovering sine wave oscillation.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <select
            id="geo-alt-pattern"
            value={altitudePattern}
            onChange={(e) => handlePatternChange(e.target.value as AltitudePattern)}
            className="h-8 w-full rounded border border-input bg-input-background dark:bg-input/30 px-2 py-1 text-xs text-[var(--c-tx2)] outline-none hover:bg-white/5 cursor-pointer"
          >
            <option value="FOLLOW_XY">Follow Primary XY Pattern</option>
            <option value="FIXED_ALTITUDE">Fixed Altitude (Constant Height)</option>
            <option value="RANDOM_UNIFORM">Random Elevation (Uniform in Range)</option>
            <option value="RANDOM_WALK">Continuous Climb & Descent Walk</option>
            <option value="SINE_OSCILLATION">Sinusoidal Hover Oscillation (Sine Wave)</option>
          </select>
        </div>

        {/* 2. SECOND: Dynamic Altitude Value Input(s) matching selected Pattern */}
        {altitudePattern === 'FIXED_ALTITUDE' ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label htmlFor="geo-fixed-alt" className="text-[9px] text-[var(--c-tx4)]">Fixed Altitude</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                    <Info size={9} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] p-2 text-[10px] leading-relaxed">
                  Fixed constant elevation height. Elevation range bounds are hidden because altitude remains static.
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              id="geo-fixed-alt"
              type="text"
              placeholder="e.g. 50.0"
              value={minAltStr}
              onChange={(e) => {
                setMinAltStr(e.target.value);
                setMaxAltStr(e.target.value);
                const fixedVal = parseFloat(e.target.value);
                if (!isNaN(fixedVal)) handleAltitudeChange(fixedVal, fixedVal);
              }}
              className="h-8 text-xs font-mono"
            />
          </div>
        ) : (
          <div className={`grid ${altitudePattern === 'RANDOM_WALK' || altitudePattern === 'SINE_OSCILLATION' || altitudePattern === 'FOLLOW_XY' ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label htmlFor="geo-min-alt" className="text-[9px] text-[var(--c-tx4)]">Min Altitude</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                      <Info size={9} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[260px] p-2 text-[10px] leading-relaxed">
                    Lower elevation bound [Min Alt]. The generator will never produce values below this threshold.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="geo-min-alt"
                type="text"
                placeholder="e.g. 0.0"
                value={minAltStr}
                onChange={(e) => {
                  setMinAltStr(e.target.value);
                  const minVal = parseFloat(e.target.value);
                  const maxVal = parseFloat(maxAltStr) || maxAlt;
                  if (!isNaN(minVal)) handleAltitudeChange(minVal, maxVal);
                }}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label htmlFor="geo-max-alt" className="text-[9px] text-[var(--c-tx4)]">Max Altitude</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                      <Info size={9} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[260px] p-2 text-[10px] leading-relaxed">
                    Upper elevation bound [Max Alt]. The generator will never produce values above this threshold.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="geo-max-alt"
                type="text"
                placeholder="e.g. 100.0"
                value={maxAltStr}
                onChange={(e) => {
                  setMaxAltStr(e.target.value);
                  const maxVal = parseFloat(e.target.value);
                  const minVal = parseFloat(minAltStr) || minAlt;
                  if (!isNaN(maxVal)) handleAltitudeChange(minVal, maxVal);
                }}
                className="h-8 text-xs font-mono"
              />
            </div>

            {altitudePattern === 'FOLLOW_XY' && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label htmlFor="geo-init-alt" className="text-[9px] text-[var(--c-tx4)]">Initial Altitude (Seed)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                        <Info size={9} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[250px] p-2 text-[10px] leading-relaxed">
                      Starting altitude seed value. Altitude begins at this value and varies alongside 2D plane motion.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="geo-init-alt"
                  type="text"
                  placeholder="e.g. 50.0"
                  value={initialAltStr}
                  onChange={(e) => {
                    setInitialAltStr(e.target.value);
                    const val = parseFloat(e.target.value);
                    handleInitialAltChange(isNaN(val) ? undefined : val);
                  }}
                  className="h-8 text-xs font-mono"
                />
              </div>
            )}

            {altitudePattern === 'RANDOM_WALK' && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label htmlFor="geo-v-step" className="text-[9px] text-[var(--c-tx4)]">Max Vertical Step (m/tick)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                        <Info size={9} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[250px] p-2 text-[10px] leading-relaxed">
                      Maximum vertical step distance (in elevation units/meters) altitude can ascend or descend per tick.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="geo-v-step"
                  type="text"
                  placeholder="e.g. 1.0"
                  value={String(maxVerticalStep)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) handleVerticalStepChange(val);
                  }}
                  className="h-8 text-xs font-mono"
                />
              </div>
            )}

            {altitudePattern === 'SINE_OSCILLATION' && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label htmlFor="geo-osc-speed" className="text-[9px] text-[var(--c-tx4)]">Oscillation Speed (rad/tick)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                        <Info size={9} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[250px] p-2 text-[10px] leading-relaxed">
                      Angular speed of the sinusoidal hovering wave (radians per tick). Controls climb/descent frequency.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="geo-osc-speed"
                  type="text"
                  placeholder="e.g. 0.1"
                  value={String(altitudeOscillationSpeed)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) handleOscillationSpeedChange(val);
                  }}
                  className="h-8 text-xs font-mono"
                />
              </div>
            )}
          </div>
        )}

        {/* 3. THIRD: Measurement Unit and Datum Reference Selectors */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label htmlFor="geo-alt-unit" className="text-[9px] text-[var(--c-tx4)]">Altitude Measurement Unit</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                    <Info size={9} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] p-2 text-[10px] leading-relaxed">
                  Physical unit for output altitude: Meters (m), Feet (ft), Kilometers (km), or Miles (mi).
                </TooltipContent>
              </Tooltip>
            </div>
            <select
              id="geo-alt-unit"
              value={altitudeUnit}
              onChange={(e) => handleUnitChange(e.target.value as AltitudeUnit)}
              className="h-8 w-full rounded border border-input bg-input-background dark:bg-input/30 px-2 py-1 text-xs text-[var(--c-tx2)] outline-none hover:bg-white/5 cursor-pointer"
            >
              <option value="METERS">Meters (m)</option>
              <option value="FEET">Feet (ft)</option>
              <option value="KILOMETERS">Kilometers (km)</option>
              <option value="MILES">Miles (mi)</option>
            </select>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label htmlFor="geo-alt-ref" className="text-[9px] text-[var(--c-tx4)]">Datum / Altitude Reference</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                    <Info size={9} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px] p-2 text-[10px] leading-relaxed">
                  • MSL: Orthometric height relative to mean sea level (WGS84 EGM96).<br/>
                  • AGL: Relative height above local terrain ground level.<br/>
                  • ELLIPSOID: Pure WGS84 mathematical ellipsoid height (GPS hardware HAE).
                </TooltipContent>
              </Tooltip>
            </div>
            <select
              id="geo-alt-ref"
              value={altitudeReference}
              onChange={(e) => handleReferenceChange(e.target.value as AltitudeReference)}
              className="h-8 w-full rounded border border-input bg-input-background dark:bg-input/30 px-2 py-1 text-xs text-[var(--c-tx2)] outline-none hover:bg-white/5 cursor-pointer"
            >
              <option value="MSL">MSL (Mean Sea Level / ASL)</option>
              <option value="AGL">AGL (Above Ground Level)</option>
              <option value="ELLIPSOID">ELLIPSOID (WGS84 HAE)</option>
            </select>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
