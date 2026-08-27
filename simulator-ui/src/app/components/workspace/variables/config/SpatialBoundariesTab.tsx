import React, { useState, useEffect } from 'react';
import { PointVariableConfig, BoundaryBehavior, CoordinateSystem, Point3DCoord } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
import { Button } from '../../../ui/button';
import { Maximize2 } from 'lucide-react';
import { Canvas2DBoundaryEditor } from './Canvas2DBoundaryEditor';
import { Isometric3DBoundaryEditor } from './Isometric3DBoundaryEditor';
import { GeospatialMapBoundaryEditor } from './GeospatialMapBoundaryEditor';
import { BoundaryExpandModal } from './BoundaryExpandModal';

interface SpatialBoundariesTabProps {
  config: PointVariableConfig;
  onChange: (newConfig: Partial<PointVariableConfig>) => void;
}

export const SpatialBoundariesTab: React.FC<SpatialBoundariesTabProps> = ({ config, onChange }) => {
  const coordSystem: CoordinateSystem = config.coordinateSystem ?? 'CARTESIAN_3D';
  const boundaryBehavior: BoundaryBehavior = config.boundaryBehavior ?? 'CLAMP';

  const minPoint = config.minPoint ?? { x: 0, y: 0, z: 0 };
  const maxPoint = config.maxPoint ?? { x: 100, y: 100, z: 100 };
  const polygon = config.boundaryPolygon ?? [];

  const [isModalOpen, setIsModalOpen] = useState(false);

  // Local state strings for precise numeric typing
  const [minXStr, setMinXStr] = useState(String(minPoint.x ?? 0));
  const [maxXStr, setMaxXStr] = useState(String(maxPoint.x ?? 100));
  const [minYStr, setMinYStr] = useState(String(minPoint.y ?? 0));
  const [maxYStr, setMaxYStr] = useState(String(maxPoint.y ?? 100));
  const [minZStr, setMinZStr] = useState(String(minPoint.z ?? 0));
  const [maxZStr, setMaxZStr] = useState(String(maxPoint.z ?? 100));

  const is2D = coordSystem === 'CARTESIAN_2D';
  const isGeo = coordSystem === 'GEOSPATIAL';

  const labelX = isGeo ? 'Latitude' : 'X';
  const labelY = isGeo ? 'Longitude' : 'Y';
  const labelZ = isGeo ? 'Altitude' : 'Z';

  useEffect(() => {
    if (minPoint.x !== undefined) setMinXStr(String(minPoint.x));
    if (maxPoint.x !== undefined) setMaxXStr(String(maxPoint.x));
    if (minPoint.y !== undefined) setMinYStr(String(minPoint.y));
    if (maxPoint.y !== undefined) setMaxYStr(String(maxPoint.y));
    if (minPoint.z !== undefined) setMinZStr(String(minPoint.z));
    if (maxPoint.z !== undefined) setMaxZStr(String(maxPoint.z));
  }, [minPoint.x, maxPoint.x, minPoint.y, maxPoint.y, minPoint.z, maxPoint.z]);

  const updateBounds = (updates: {
    minX?: number;
    maxX?: number;
    minY?: number;
    maxY?: number;
    minZ?: number;
    maxZ?: number;
    polygon?: Point3DCoord[];
  }) => {
    const newMin = {
      x: updates.minX ?? minPoint.x ?? 0,
      y: updates.minY ?? minPoint.y ?? 0,
      z: updates.minZ ?? minPoint.z ?? 0,
    };
    const newMax = {
      x: updates.maxX ?? maxPoint.x ?? 100,
      y: updates.maxY ?? maxPoint.y ?? 100,
      z: updates.maxZ ?? maxPoint.z ?? 100,
    };
    onChange({
      minPoint: newMin,
      maxPoint: newMax,
      boundaryPolygon: updates.polygon ?? polygon,
    });
  };

  const renderVisualEditor = (modalMode = false) => {
    const canvasW = modalMode ? 760 : 360;
    const canvasH = modalMode ? 420 : (isGeo ? 180 : 200);

    return (
      <>
        {is2D && (
          <Canvas2DBoundaryEditor
            minX={minPoint.x ?? 0}
            maxX={maxPoint.x ?? 100}
            minY={minPoint.y ?? 0}
            maxY={maxPoint.y ?? 100}
            polygon={polygon}
            width={canvasW}
            height={canvasH}
            onChange={(b) => updateBounds({ minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY, polygon: b.polygon })}
          />
        )}

        {coordSystem === 'CARTESIAN_3D' && (
          <Isometric3DBoundaryEditor
            minX={minPoint.x ?? 0}
            maxX={maxPoint.x ?? 100}
            minY={minPoint.y ?? 0}
            maxY={maxPoint.y ?? 100}
            minZ={minPoint.z ?? 0}
            maxZ={maxPoint.z ?? 100}
            polygon={polygon}
            width={modalMode ? 520 : 260}
            height={modalMode ? 320 : 160}
            onChange={(b) => updateBounds({ minZ: b.minZ, maxZ: b.maxZ, polygon: b.polygon })}
          />
        )}

        {isGeo && (
          <GeospatialMapBoundaryEditor
            minLat={minPoint.x ?? 0}
            maxLat={maxPoint.x ?? 90}
            minLon={minPoint.y ?? -180}
            maxLon={maxPoint.y ?? 180}
            polygon={polygon}
            width={canvasW}
            height={canvasH}
            onChange={(b) => updateBounds({ minX: b.minLat, maxX: b.maxLat, minY: b.minLon, maxY: b.maxLon, polygon: b.polygon })}
          />
        )}
      </>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. Header with Expand View Button */}
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase text-[var(--c-tx4)]">Spatial Boundary Collision & Limit Rules</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsModalOpen(true)}
          className="h-7 text-xs border-[var(--c-br1)] bg-[var(--c-bg2)] hover:bg-white/10 text-violet-300 flex items-center gap-1.5 cursor-pointer"
        >
          <Maximize2 size={12} />
          <span>Expand View / High-Precision Editor</span>
        </Button>
      </div>

      {/* 2. Boundary Behavior Quick Selector */}
      <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] p-3 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'CLAMP', label: 'Clamp (Stop)', desc: 'Halts motion at boundary edges' },
            { value: 'BOUNCE', label: 'Bounce (Rebound)', desc: 'Inverts velocity vector component' },
            { value: 'WRAP', label: 'Wrap (Toroidal)', desc: 'Wraps position to opposite side' },
          ].map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => onChange({ boundaryBehavior: b.value as BoundaryBehavior })}
              className={`p-2 rounded border text-left transition-colors cursor-pointer ${
                boundaryBehavior === b.value
                  ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                  : 'border-[var(--c-br1)] bg-[var(--c-bg2)] text-[var(--c-tx3)] hover:bg-white/5'
              }`}
            >
              <div className="text-xs font-semibold">{b.label}</div>
              <div className="text-[9px] text-[var(--c-tx4)] mt-0.5">{b.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Visual Interactive Boundary Canvas */}
      <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] p-3 space-y-2">
        {renderVisualEditor(false)}
      </div>

      {/* 4. Manual Numeric Input Grid */}
      <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] p-3 space-y-3">
        <Label className="text-[10px] uppercase text-[var(--c-tx4)]">Exact Coordinate Boundary Ranges</Label>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="bound-min-x" className="text-[9px] text-[var(--c-tx4)]">Min {labelX}</Label>
            <Input
              id="bound-min-x"
              type="text"
              value={minXStr}
              onChange={(e) => {
                setMinXStr(e.target.value);
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) updateBounds({ minX: val });
              }}
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bound-max-x" className="text-[9px] text-[var(--c-tx4)]">Max {labelX}</Label>
            <Input
              id="bound-max-x"
              type="text"
              value={maxXStr}
              onChange={(e) => {
                setMaxXStr(e.target.value);
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) updateBounds({ maxX: val });
              }}
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="bound-min-y" className="text-[9px] text-[var(--c-tx4)]">Min {labelY}</Label>
            <Input
              id="bound-min-y"
              type="text"
              value={minYStr}
              onChange={(e) => {
                setMinYStr(e.target.value);
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) updateBounds({ minY: val });
              }}
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bound-max-y" className="text-[9px] text-[var(--c-tx4)]">Max {labelY}</Label>
            <Input
              id="bound-max-y"
              type="text"
              value={maxYStr}
              onChange={(e) => {
                setMaxYStr(e.target.value);
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) updateBounds({ maxY: val });
              }}
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>

        {!is2D && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="bound-min-z" className="text-[9px] text-[var(--c-tx4)]">Min {labelZ}</Label>
              <Input
                id="bound-min-z"
                type="text"
                value={minZStr}
                onChange={(e) => {
                  setMinZStr(e.target.value);
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) updateBounds({ minZ: val });
                }}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bound-max-z" className="text-[9px] text-[var(--c-tx4)]">Max {labelZ}</Label>
              <Input
                id="bound-max-z"
                type="text"
                value={maxZStr}
                onChange={(e) => {
                  setMaxZStr(e.target.value);
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) updateBounds({ maxZ: val });
                }}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* 5. Expand View Modal */}
      <BoundaryExpandModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={coordSystem === 'GEOSPATIAL' ? 'Geospatial Geofence Editor' : (is2D ? '2D Spatial Boundary Grid' : '3D Spatial Volume Editor')}
      >
        {renderVisualEditor(true)}
      </BoundaryExpandModal>
    </div>
  );
};
