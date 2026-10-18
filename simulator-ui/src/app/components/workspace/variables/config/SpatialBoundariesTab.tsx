import React, { useState } from 'react';
import { PointVariableConfig, BoundaryBehavior, CoordinateSystem, Point3DCoord, Shape3DType, type BoundaryObstacle } from '../../../../types';
import { defaultBoundsFor, type FullPoint } from '../../../../core/pointDefaults';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
import { Button } from '../../../ui/button';
import { Info, Maximize2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../../../ui/tooltip';
import { Canvas2DBoundaryEditor } from './Canvas2DBoundaryEditor';
import { Isometric3DBoundaryEditor } from './Isometric3DBoundaryEditor';
import { GeospatialMapBoundaryEditor } from './GeospatialMapBoundaryEditor';
import { BoundaryExpandModal } from './BoundaryExpandModal';
import { BoundaryObstaclesEditor } from './BoundaryObstaclesEditor';

interface SpatialBoundariesTabProps {
  config: PointVariableConfig;
  onChange: (newConfig: Partial<PointVariableConfig>) => void;
}

/** Partial update of the region; omitted fields keep their current value. */
interface BoundsUpdate {
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  minZ?: number;
  maxZ?: number;
  altitudeUnit?: PointVariableConfig['altitudeUnit'];
  altitudeReference?: PointVariableConfig['altitudeReference'];
  altitudePattern?: PointVariableConfig['altitudePattern'];
  /** An explicit `undefined` clears it (the geospatial editor sends it when the field is emptied). */
  initialAltitude?: number;
  maxVerticalStep?: number;
  altitudeOscillationSpeed?: number;
  polygon?: Point3DCoord[];
  obstacles?: BoundaryObstacle[];
  shape3DType?: Shape3DType;
  shape3DWidth?: number;
  shape3DLength?: number;
  shape3DHeight?: number;
  shape3DRadius?: number;
}

/** Keys of the Min/Max numeric inputs, which keep their typed text until committed. */
type BoundFieldKey = 'minX' | 'maxX' | 'minY' | 'maxY' | 'minZ' | 'maxZ';

/** 2D editor of the fullscreen view: canvas filling the space and the obstacles side panel. */
const Modal2DVisualEditor: React.FC<{
  minPoint: FullPoint;
  maxPoint: FullPoint;
  polygon: Point3DCoord[];
  config: PointVariableConfig;
  updateBounds: (b: BoundsUpdate) => void;
  onChange: (newConfig: Partial<PointVariableConfig>) => void;
}> = ({ minPoint, maxPoint, polygon, config, updateBounds, onChange }) => {
  const [selectedObstacleId, setSelectedObstacleId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1 min-h-0 h-full w-full">
      <div className="lg:col-span-7 xl:col-span-8 flex flex-col h-full min-h-0">
        <Canvas2DBoundaryEditor
          minX={minPoint.x}
          maxX={maxPoint.x}
          minY={minPoint.y}
          maxY={maxPoint.y}
          polygon={polygon}
          obstacles={config.obstacles || []}
          selectedObstacleId={selectedObstacleId}
          onSelectObstacle={setSelectedObstacleId}
          fillContainer={true}
          showToolbar={true}
          onChange={(b) => updateBounds({ minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY, polygon: b.polygon, obstacles: b.obstacles })}
        />
      </div>
      <div className="lg:col-span-5 xl:col-span-4 flex flex-col h-full min-h-0 bg-[var(--c-bg4)] p-4 rounded-xl border border-[var(--c-br1)] overflow-y-auto space-y-4">
        <h3 className="text-xs font-semibold uppercase text-violet-600 dark:text-violet-300 tracking-wider shrink-0">
          2D Barriers & Obstacles Management
        </h3>
        <div className="flex-1 min-h-0">
          <BoundaryObstaclesEditor
            obstacles={config.obstacles || []}
            minPoint={minPoint}
            maxPoint={maxPoint}
            selectedObstacleId={selectedObstacleId}
            onSelectObstacle={setSelectedObstacleId}
            onChange={(newObs) => onChange({ obstacles: newObs })}
          />
        </div>
      </div>
    </div>
  );
};

export const SpatialBoundariesTab: React.FC<SpatialBoundariesTabProps> = ({ config, onChange }) => {
  const coordSystem: CoordinateSystem = config.coordinateSystem ?? 'CARTESIAN_3D';
  const boundaryBehavior: BoundaryBehavior = config.boundaryBehavior ?? 'CLAMP';

  // Missing coordinates fall back to the default region of the coordinate system (as in the Core)
  const defaults = defaultBoundsFor(config.coordinateSystem);
  const minPoint: FullPoint = {
    x: config.minPoint?.x ?? defaults.minPoint.x,
    y: config.minPoint?.y ?? defaults.minPoint.y,
    z: config.minPoint?.z ?? defaults.minPoint.z,
  };
  const maxPoint: FullPoint = {
    x: config.maxPoint?.x ?? defaults.maxPoint.x,
    y: config.maxPoint?.y ?? defaults.maxPoint.y,
    z: config.maxPoint?.z ?? defaults.maxPoint.z,
  };
  const polygon = config.boundaryPolygon ?? [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tabSelectedObsId, setTabSelectedObsId] = useState<string | null>(null);

  // Text being typed in the Min/Max inputs; a field without a draft shows the current value
  const [boundDrafts, setBoundDrafts] = useState<Partial<Record<BoundFieldKey, string>>>({});

  const is2D = coordSystem === 'CARTESIAN_2D';
  const isGeo = coordSystem === 'GEOSPATIAL';

  const labelX = isGeo ? 'Latitude' : 'X';
  const labelY = isGeo ? 'Longitude' : 'Y';
  const labelZ = isGeo ? 'Altitude' : 'Z';

  const updateBounds = (updates: BoundsUpdate) => {
    const newMin = {
      x: updates.minX ?? minPoint.x,
      y: updates.minY ?? minPoint.y,
      z: updates.minZ ?? minPoint.z,
    };
    const newMax = {
      x: updates.maxX ?? maxPoint.x,
      y: updates.maxY ?? maxPoint.y,
      z: updates.maxZ ?? maxPoint.z,
    };
    onChange({
      minPoint: newMin,
      maxPoint: newMax,
      altitudeUnit: updates.altitudeUnit ?? config.altitudeUnit,
      altitudeReference: updates.altitudeReference ?? config.altitudeReference,
      altitudePattern: updates.altitudePattern ?? config.altitudePattern,
      initialAltitude: 'initialAltitude' in updates ? updates.initialAltitude : config.initialAltitude,
      maxVerticalStep: updates.maxVerticalStep ?? config.maxVerticalStep,
      altitudeOscillationSpeed: updates.altitudeOscillationSpeed ?? config.altitudeOscillationSpeed,
      boundaryPolygon: updates.polygon ?? polygon,
      obstacles: updates.obstacles ?? config.obstacles,
      shape3DType: updates.shape3DType ?? config.shape3DType,
      shape3DWidth: updates.shape3DWidth ?? config.shape3DWidth,
      shape3DLength: updates.shape3DLength ?? config.shape3DLength,
      shape3DHeight: updates.shape3DHeight ?? config.shape3DHeight,
      shape3DRadius: updates.shape3DRadius ?? config.shape3DRadius,
    });
  };

  const boundValue = (key: BoundFieldKey): number => {
    const axis = key.slice(3).toLowerCase() as 'x' | 'y' | 'z';
    return key.startsWith('min') ? minPoint[axis] : maxPoint[axis];
  };

  /**
   * Commits a Min/Max input: a non-finite value reverts the text, and a min above its max
   * swaps the pair (the Core rejects inverted bounds).
   */
  const commitBound = (key: BoundFieldKey) => {
    const raw = boundDrafts[key];
    setBoundDrafts(({ [key]: _committed, ...rest }) => rest);
    if (raw === undefined || raw.trim() === '') return;
    const axis = key.slice(3) as 'X' | 'Y' | 'Z';
    let value = Number(raw);
    if (!Number.isFinite(value)) return;
    // Geospatial: x is latitude (±90°) and y is longitude (±180°)
    if (coordSystem === 'GEOSPATIAL' && axis !== 'Z') {
      const limit = axis === 'X' ? 90 : 180;
      value = Math.max(-limit, Math.min(limit, value));
    }
    if (value === boundValue(key)) return;

    const other = boundValue(key.startsWith('min') ? `max${axis}` : `min${axis}`);
    updateBounds({ [`min${axis}`]: Math.min(value, other), [`max${axis}`]: Math.max(value, other) });
  };

  const renderBoundInput = (key: BoundFieldKey, label: string) => {
    const id = `bound-${key.slice(0, 3)}-${key.slice(3).toLowerCase()}`;
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-[9px] text-[var(--c-tx4)]">{label}</Label>
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          value={boundDrafts[key] ?? String(boundValue(key))}
          onChange={(e) => {
            const text = e.target.value;
            setBoundDrafts((prev) => ({ ...prev, [key]: text }));
          }}
          onBlur={() => commitBound(key)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitBound(key);
          }}
          className="h-8 text-xs font-mono"
        />
      </div>
    );
  };

  /** Visual editor of the tab, or of the fullscreen view when `fullscreen` is set. */
  const renderVisualEditor = (fullscreen = false) => {
    const canvasW = 360;
    const canvasH = isGeo ? 180 : 200;

    if (fullscreen && is2D) {
      return (
        <Modal2DVisualEditor
          minPoint={minPoint}
          maxPoint={maxPoint}
          polygon={polygon}
          config={config}
          updateBounds={updateBounds}
          onChange={onChange}
        />
      );
    }

    return (
      <>
        {is2D && (
          <Canvas2DBoundaryEditor
            minX={minPoint.x}
            maxX={maxPoint.x}
            minY={minPoint.y}
            maxY={maxPoint.y}
            polygon={polygon}
            obstacles={config.obstacles || []}
            selectedObstacleId={tabSelectedObsId}
            onSelectObstacle={setTabSelectedObsId}
            width={canvasW}
            height={canvasH}
            fillContainer={false}
            showToolbar={false}
            onChange={(b) => updateBounds({ minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY, polygon: b.polygon, obstacles: b.obstacles })}
          />
        )}

        {coordSystem === 'CARTESIAN_3D' && (
          <Isometric3DBoundaryEditor
            minX={minPoint.x}
            maxX={maxPoint.x}
            minY={minPoint.y}
            maxY={maxPoint.y}
            minZ={minPoint.z}
            maxZ={maxPoint.z}
            polygon={polygon}
            shape3DType={config.shape3DType ?? 'cube'}
            shape3DWidth={config.shape3DWidth}
            shape3DLength={config.shape3DLength}
            shape3DHeight={config.shape3DHeight}
            shape3DRadius={config.shape3DRadius ?? 50}
            width={canvasW}
            height={canvasH}
            fillContainer={fullscreen}
            onChange={(b) =>
              updateBounds({
                minX: b.minX,
                maxX: b.maxX,
                minY: b.minY,
                maxY: b.maxY,
                minZ: b.minZ,
                maxZ: b.maxZ,
                polygon: b.polygon,
                shape3DType: b.shape3DType,
                shape3DWidth: b.shape3DWidth,
                shape3DLength: b.shape3DLength,
                shape3DHeight: b.shape3DHeight,
                shape3DRadius: b.shape3DRadius,
              })
            }
          />
        )}

        {isGeo && (
          <GeospatialMapBoundaryEditor
            minLat={minPoint.x}
            maxLat={maxPoint.x}
            minLon={minPoint.y}
            maxLon={maxPoint.y}
            minAlt={minPoint.z}
            maxAlt={maxPoint.z}
            altitudeUnit={config.altitudeUnit ?? 'METERS'}
            altitudeReference={config.altitudeReference ?? 'MSL'}
            altitudePattern={config.altitudePattern ?? 'FOLLOW_XY'}
            initialAltitude={config.initialAltitude}
            maxVerticalStep={config.maxVerticalStep ?? 1.0}
            altitudeOscillationSpeed={config.altitudeOscillationSpeed ?? 0.1}
            polygon={polygon}
            width={canvasW}
            height={canvasH}
            onChange={(b) =>
              updateBounds({
                minX: b.minLat,
                maxX: b.maxLat,
                minY: b.minLon,
                maxY: b.maxLon,
                minZ: b.minAlt,
                maxZ: b.maxAlt,
                altitudeUnit: b.altitudeUnit,
                altitudeReference: b.altitudeReference,
                altitudePattern: b.altitudePattern,
                initialAltitude: b.initialAltitude,
                maxVerticalStep: b.maxVerticalStep,
                altitudeOscillationSpeed: b.altitudeOscillationSpeed,
                polygon: b.polygon,
              })
            }
          />
        )}
      </>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* 1. Editor Header / Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] uppercase text-[var(--c-tx4)]">
              Visual Spatial Boundaries & Geofence
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={10} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] space-y-1 text-[11px] leading-relaxed">
                <p>{"Interactive 2D, 3D and Leaflet World Map editor."}</p>
                <p>{"• Draw selection box or drag vertex markers to define geofence limits."}</p>
                <p>{"• Right-click edges to insert vertices, right-click points to delete."}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(true)}
                  className="h-7 px-2 text-xs gap-1"
                >
                  <Maximize2 size={12} />
                  <span>Fullscreen</span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-[11px]">
              Open the boundary editor in fullscreen (Esc to exit)
            </TooltipContent>
          </Tooltip>
        </div>

        {/* 2. Boundary Behavior Quick Selector */}
        <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] p-3 space-y-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Label className="text-[10px] uppercase text-[var(--c-tx4)]">
              Boundary Collision Action
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={10} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] space-y-1 text-[11px] leading-relaxed">
                <p>{"Action taken when a point touches the geofence limit:"}</p>
                <p>{"• Clamp: Stops at boundary wall."}</p>
                <p>{"• Bounce: Rebounds trajectory velocity."}</p>
                <p>{"• Wrap: Teleports to opposite side of space."}</p>
              </TooltipContent>
            </Tooltip>
          </div>
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
                    ? 'border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-300'
                    : 'border-[var(--c-br1)] bg-[var(--c-bg2)] text-[var(--c-tx3)] hover:bg-[var(--c-bg5)]'
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
          {!isModalOpen ? (
            renderVisualEditor(false)
          ) : (
            <div className="py-8 text-center text-xs text-[var(--c-tx4)] italic">
              Editing in fullscreen…
            </div>
          )}
        </div>

        {/* 3b. 2D Wall Barriers & Forbidden Interior Obstacle Zones */}
        {is2D && (
          <BoundaryObstaclesEditor
          minPoint={minPoint}
          maxPoint={maxPoint}
            obstacles={config.obstacles || []}
            selectedObstacleId={tabSelectedObsId}
            onSelectObstacle={setTabSelectedObsId}
            onChange={(newObs) => onChange({ obstacles: newObs })}
          />
        )}

        {/* 4. Manual Numeric Input Grid (Outer Envelope Bounding Box) */}
        <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] uppercase text-[var(--c-tx4)]">
                Outer Envelope Bounding Box (AABB Bounds)
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                    <Info size={10} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px] space-y-1 text-[11px] leading-relaxed">
                  <p>{"Axis-Aligned Bounding Box (AABB) enclosing the overall spatial envelope."}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="text-[9px] text-[var(--c-tx4)]">
              {polygon.length >= 3 ? `Encloses ${polygon.length}-Vertex Custom Figure` : 'Standard Rectangular Bounds'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {renderBoundInput('minX', `Min ${labelX}`)}
            {renderBoundInput('maxX', `Max ${labelX}`)}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {renderBoundInput('minY', `Min ${labelY}`)}
            {renderBoundInput('maxY', `Max ${labelY}`)}
          </div>

          {!is2D && (
            <div className="grid grid-cols-2 gap-3">
              {renderBoundInput('minZ', `Min ${labelZ}`)}
              {renderBoundInput('maxZ', `Max ${labelZ}`)}
            </div>
          )}
        </div>

        {/* 5. Custom Polygon Vertices List Inspector */}
        {polygon.length >= 3 && (
          <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] uppercase text-[var(--c-tx4)]">
                  Exact Individual Polygon Vertices ({polygon.length} Points)
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                      <Info size={10} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[280px] space-y-1 text-[11px] leading-relaxed">
                    <p>{"Coordinates of each vertex of the custom polygon geofence."}</p>
                    <p>{"Evaluated with Even-Odd Ray-Casting algorithm."}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <span className="text-[9px] text-violet-400 font-mono">Ray-Casting Algorithm Active</span>
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
              {polygon.map((pt, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-1.5 rounded border border-[var(--c-br1)] bg-[var(--c-bg2)] text-xs font-mono text-[var(--c-tx2)]"
                >
                  <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-300 w-16">Vertex {i + 1}:</span>
                  <div className="flex gap-3 text-[11px]">
                    <span>{labelX}: <strong className="text-[var(--c-tx1)]">{pt.x ?? 0}</strong></span>
                    <span>{labelY}: <strong className="text-[var(--c-tx1)]">{pt.y ?? 0}</strong></span>
                    {!is2D && <span>{labelZ}: <strong className="text-[var(--c-tx1)]">{pt.z ?? 0}</strong></span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. Fullscreen Editor */}
        <BoundaryExpandModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={coordSystem === 'GEOSPATIAL' ? 'Geospatial Geofence Editor' : (is2D ? '2D Spatial Boundary Grid' : '3D Spatial Volume Editor')}
        >
          {renderVisualEditor(true)}
        </BoundaryExpandModal>
      </div>
    </TooltipProvider>
  );
};
