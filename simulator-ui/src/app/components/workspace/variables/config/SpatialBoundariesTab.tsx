import React, { useState, useEffect } from 'react';
import { PointVariableConfig, BoundaryBehavior, CoordinateSystem, Point3DCoord, Shape3DType, type BoundaryObstacle } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
import { Button } from '../../../ui/button';
import { Info, Maximize2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../../../ui/tooltip';
import { Canvas2DBoundaryEditor } from './Canvas2DBoundaryEditor';
import { Isometric3DBoundaryEditor } from './Isometric3DBoundaryEditor';
import { GeospatialMapBoundaryEditor } from './GeospatialMapBoundaryEditor';
import { BoundaryExpandModal, useBoundaryModalContext } from './BoundaryExpandModal';
import { BoundaryObstaclesEditor } from './BoundaryObstaclesEditor';

interface SpatialBoundariesTabProps {
  config: PointVariableConfig;
  onChange: (newConfig: Partial<PointVariableConfig>) => void;
}

// Modal View Component that adapts dynamically based on isFullScreen context
const Modal2DVisualEditor: React.FC<{
  minPoint: Point3DCoord;
  maxPoint: Point3DCoord;
  polygon: Point3DCoord[];
  config: PointVariableConfig;
  updateBounds: (b: any) => void;
  onChange: (b: any) => void;
}> = ({ minPoint, maxPoint, polygon, config, updateBounds, onChange }) => {
  const { isFullScreen } = useBoundaryModalContext();
  const [selectedObstacleId, setSelectedObstacleId] = useState<string | null>(null);

  if (isFullScreen) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1 min-h-0 h-full w-full">
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col h-full min-h-0">
          <Canvas2DBoundaryEditor
            minX={minPoint.x ?? 0}
            maxX={maxPoint.x ?? 100}
            minY={minPoint.y ?? 0}
            maxY={maxPoint.y ?? 100}
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
          <h3 className="text-xs font-semibold uppercase text-violet-300 tracking-wider shrink-0">
            2D Barriers & Obstacles Management
          </h3>
          <div className="flex-1 min-h-0">
            <BoundaryObstaclesEditor
              obstacles={config.obstacles || []}
              selectedObstacleId={selectedObstacleId}
              onSelectObstacle={setSelectedObstacleId}
              onChange={(newObs) => onChange({ obstacles: newObs })}
            />
          </div>
        </div>
      </div>
    );
  }

  // Standard Windowed High-Precision Editor Modal
  return (
    <div className="space-y-4">
      <Canvas2DBoundaryEditor
        minX={minPoint.x ?? 0}
        maxX={maxPoint.x ?? 100}
        minY={minPoint.y ?? 0}
        maxY={maxPoint.y ?? 100}
        polygon={polygon}
        obstacles={config.obstacles || []}
        selectedObstacleId={selectedObstacleId}
        onSelectObstacle={setSelectedObstacleId}
        width={850}
        height={420}
        fillContainer={false}
        showToolbar={true}
        onChange={(b) => updateBounds({ minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY, polygon: b.polygon, obstacles: b.obstacles })}
      />
      <div className="bg-[var(--c-bg4)] p-4 rounded-xl border border-[var(--c-br1)]">
        <BoundaryObstaclesEditor
          obstacles={config.obstacles || []}
          selectedObstacleId={selectedObstacleId}
          onSelectObstacle={setSelectedObstacleId}
          onChange={(newObs) => onChange({ obstacles: newObs })}
        />
      </div>
    </div>
  );
};

export const SpatialBoundariesTab: React.FC<SpatialBoundariesTabProps> = ({ config, onChange }) => {
  const coordSystem: CoordinateSystem = config.coordinateSystem ?? 'CARTESIAN_3D';
  const boundaryBehavior: BoundaryBehavior = config.boundaryBehavior ?? 'CLAMP';

  const minPoint = config.minPoint ?? { x: 0, y: 0, z: 0 };
  const maxPoint = config.maxPoint ?? { x: 100, y: 100, z: 100 };
  const polygon = config.boundaryPolygon ?? [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tabSelectedObsId, setTabSelectedObsId] = useState<string | null>(null);

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
    altitudeUnit?: any;
    altitudeReference?: any;
    altitudePattern?: any;
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
      altitudeUnit: updates.altitudeUnit ?? config.altitudeUnit,
      altitudeReference: updates.altitudeReference ?? config.altitudeReference,
      altitudePattern: updates.altitudePattern ?? config.altitudePattern,
      initialAltitude: updates.initialAltitude ?? config.initialAltitude,
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

  const renderVisualEditor = (modalMode = false) => {
    const canvasW = modalMode ? 820 : 360;
    const canvasH = modalMode ? 520 : (isGeo ? 180 : 200);

    if (modalMode && is2D) {
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
            minX={minPoint.x ?? 0}
            maxX={maxPoint.x ?? 100}
            minY={minPoint.y ?? 0}
            maxY={maxPoint.y ?? 100}
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
            minX={minPoint.x ?? 0}
            maxX={maxPoint.x ?? 100}
            minY={minPoint.y ?? 0}
            maxY={maxPoint.y ?? 100}
            minZ={minPoint.z ?? 0}
            maxZ={maxPoint.z ?? 100}
            polygon={polygon}
            shape3DType={config.shape3DType ?? 'cube'}
            shape3DWidth={config.shape3DWidth}
            shape3DLength={config.shape3DLength}
            shape3DHeight={config.shape3DHeight}
            shape3DRadius={config.shape3DRadius ?? 50}
            width={canvasW}
            height={canvasH}
            onChange={(b) =>
              updateBounds({
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
            minLat={minPoint.x ?? 0}
            maxLat={maxPoint.x ?? 90}
            minLon={minPoint.y ?? -180}
            maxLon={maxPoint.y ?? 180}
            minAlt={minPoint.z ?? 0}
            maxAlt={maxPoint.z ?? 100}
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="h-7 text-xs gap-1.5 border-violet-500/40 text-violet-400 hover:bg-violet-500/10 cursor-pointer"
          >
            <Maximize2 size={12} />
            <span>Expand View / High-Precision Editor</span>
          </Button>
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
          {!isModalOpen ? (
            renderVisualEditor(false)
          ) : (
            <div className="py-8 text-center text-xs text-[var(--c-tx4)] italic">
              Visual editor expanded in modal window...
            </div>
          )}
        </div>

        {/* 3b. 2D Wall Barriers & Forbidden Interior Obstacle Zones */}
        {is2D && (
          <BoundaryObstaclesEditor
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
                  <span className="text-[10px] font-semibold text-violet-300 w-16">Vertex {i + 1}:</span>
                  <div className="flex gap-3 text-[11px]">
                    <span>{labelX}: <strong className="text-white">{pt.x ?? 0}</strong></span>
                    <span>{labelY}: <strong className="text-white">{pt.y ?? pt.x ?? 0}</strong></span>
                    {!is2D && <span>{labelZ}: <strong className="text-white">{pt.z ?? 0}</strong></span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. Expand View Modal */}
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
