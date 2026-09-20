import React, { useState, useEffect } from 'react';
import { 
  PointVariableConfig, 
  CoordinateSystem, 
  GeospatialFormat, 
  BoundaryBehavior,
  GraphNavigationMode,
  GraphNode,
  type GraphEdge,
  VariableScope 
} from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';

import { Info, Route, ArrowRight, X, Trash2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../../../ui/tooltip';

import { ListReferenceSelector } from './ListReferenceSelector';
import { GraphRouteCanvas } from './GraphRouteCanvas';

interface PointConfigPanelProps {
  config: PointVariableConfig;
  onChange: (newConfig: Partial<PointVariableConfig>) => void;
  flowId?: string;
  groupId?: string;
  variableScope?: VariableScope;
}

interface CustomDropdownProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({ id, value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  return (
    <div ref={containerRef} className={`relative w-full ${isOpen ? 'z-[9999]' : ''}`}>
      <button
        id={id}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-input-background dark:bg-input/30 px-3 py-1 text-xs text-[var(--c-tx2)] outline-none hover:bg-white/5 transition-colors cursor-pointer"
      >
        <span>{selectedOption.label}</span>
        <svg
          className={`size-3.5 opacity-60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 z-[9999] bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-2xl max-h-[200px] overflow-y-auto">
          <div className="p-1 space-y-0.5">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center justify-between cursor-pointer ${
                  opt.value === value
                    ? 'bg-violet-500/20 text-violet-400 font-semibold'
                    : 'hover:bg-white/5 text-[var(--c-tx2)]'
                }`}
              >
                <span>{opt.label}</span>
                {opt.value === value && (
                  <svg className="size-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const PointConfigPanel: React.FC<PointConfigPanelProps> = ({ config, onChange, flowId, groupId, variableScope }) => {
  const coordSystem: CoordinateSystem = config.coordinateSystem ?? 'CARTESIAN_3D';
  const geoFormat: GeospatialFormat = config.geospatialFormat ?? 'DECIMAL_DEGREES';
  const pattern = config.pattern ?? 'RANDOM_POINT';
  const boundaryBehavior: BoundaryBehavior = config.boundaryBehavior ?? 'CLAMP';

  // Local string state helpers for input fields
  const [stepDistanceStr, setStepDistanceStr] = useState(String(config.maxStepDistance ?? 0.1));
  const [inertiaStr, setInertiaStr] = useState(String(config.inertia ?? 0.0));
  const [orbitRadiusStr, setOrbitRadiusStr] = useState(String(config.orbitRadius ?? 10.0));
  const [angularSpeedStr, setAngularSpeedStr] = useState(String(config.angularSpeed ?? 0.1));
  const [spiralRateStr, setSpiralRateStr] = useState(String(config.spiralRate ?? 0.0));
  const [jitterRadiusStr, setJitterRadiusStr] = useState(String(config.jitterRadius ?? 0.0));

  const isGeospatial = coordSystem === 'GEOSPATIAL';
  const is2D = coordSystem === 'CARTESIAN_2D';

  const labelX = isGeospatial ? 'Latitude' : 'X';
  const labelY = isGeospatial ? 'Longitude' : 'Y';
  const labelZ = isGeospatial ? 'Altitude' : 'Z';

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <ListReferenceSelector
          config={config}
          onChange={onChange}
          variableScope={variableScope || 'local'}
          variableType="point"
          flowId={flowId}
          groupId={groupId}
        />
        {/* 1. Coordinate System Selector */}
        <div className="grid grid-cols-2 gap-3 relative z-30">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="point-coord-system" className="text-[10px] uppercase text-[var(--c-tx4)]">
                Coordinate System
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                    <Info size={10} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px] space-y-1 text-[11px] leading-relaxed">
                  <p>{"Select the coordinate spatial representation:"}</p>
                  <p>{"• 2D Cartesian: Flat plane coordinates (X, Y)."}</p>
                  <p>{"• 3D Cartesian: Spatial coordinates (X, Y, Z)."}</p>
                  <p>{"• Geospatial: Real WGS84 GPS degrees (Lat, Lon, Alt)."}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <CustomDropdown
              id="point-coord-system"
              value={coordSystem}
              onChange={(val) => {
                if (val !== coordSystem) {
                  onChange({
                    coordinateSystem: val as CoordinateSystem,
                    graphNodes: [],
                    graphEdges: [],
                    graphSequence: [],
                  });
                }
              }}
              options={[
                { value: 'CARTESIAN_2D', label: '2D Cartesian (X, Y)' },
                { value: 'CARTESIAN_3D', label: '3D Cartesian (X, Y, Z)' },
                { value: 'GEOSPATIAL', label: 'Geospatial (Lat, Lon, Alt)' },
              ]}
            />
          </div>

          {/* Geospatial Format Selector */}
          {isGeospatial ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="point-geo-format" className="text-[10px] uppercase text-[var(--c-tx4)]">
                  Geospatial Format
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                      <Info size={10} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[280px] space-y-1 text-[11px] leading-relaxed">
                    <p>{"Format output coordinate strings:"}</p>
                    <p>{"• Decimal Degrees: Standard numerical floats (e.g. 40.4168° N, -3.7038° W)."}</p>
                    <p>{"• DMS: Formatted Degrees, Minutes & Seconds (e.g. 40° 25' 0.48\" N)."}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <CustomDropdown
                id="point-geo-format"
                value={geoFormat}
                onChange={(val) => onChange({ geospatialFormat: val as GeospatialFormat })}
                options={[
                  { value: 'DECIMAL_DEGREES', label: 'Decimal Degrees (40.7128°)' },
                  { value: 'DEGREES_MINUTES_SECONDS', label: 'Degrees, Minutes, Sec (DMS)' },
                ]}
              />
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="point-boundary" className="text-[10px] uppercase text-[var(--c-tx4)]">
                  Boundary Behavior
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                      <Info size={10} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[280px] space-y-1 text-[11px] leading-relaxed">
                    <p>{"Action taken when point touches spatial limits:"}</p>
                    <p>{"• Clamp: Stops moving at the boundary wall."}</p>
                    <p>{"• Bounce: Rebounds trajectory velocity upon collision."}</p>
                    <p>{"• Wrap: Teleports to the opposite side of boundary."}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <CustomDropdown
                id="point-boundary"
                value={boundaryBehavior}
                onChange={(val) => onChange({ boundaryBehavior: val as BoundaryBehavior })}
                options={[
                  { value: 'CLAMP', label: 'Clamp (Stop at boundary)' },
                  { value: 'BOUNCE', label: 'Bounce (Rebound velocity)' },
                  { value: 'WRAP', label: 'Wrap (Toroidal space)' },
                ]}
              />
            </div>
          )}
        </div>

        {/* 2. Generation Pattern Selector */}
        <div className="space-y-1 relative z-20">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="point-pattern" className="text-[10px] uppercase text-[var(--c-tx4)]">
              Movement Pattern
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={10} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[300px] space-y-1 text-[11px] leading-relaxed">
                <p>{"Defines point trajectory over time:"}</p>
                <p>{"• Fixed Point: Static constant position."}</p>
                <p>{"• Random Point: Uniform random sampling inside polygon."}</p>
                <p>{"• Random Walk: Physics-based step motion with inertia."}</p>
                <p>{"• Circular Orbit: Rotates around a center location."}</p>
                <p>{"• Waypoint Navigation: Smooth path interpolation."}</p>
                <p>{"• Graph Route: Connected graph nodes & edges route traversal."}</p>
              </TooltipContent>
            </Tooltip>
          </div>
            <CustomDropdown
              id="point-pattern"
              value={pattern}
              onChange={(val) => onChange({ pattern: val as any })}
              options={[
                { value: 'FIXED_POINT', label: 'Fixed Point (Constant)' },
                { value: 'RANDOM_POINT', label: 'Random Point (Within bounds)' },
                { value: 'RANDOM_WALK', label: 'Random Walk (Continuous step)' },
                { value: 'CIRCULAR_ORBIT', label: 'Circular Orbit / Spiral' },
                { value: 'WAYPOINT_NAVIGATION', label: 'Waypoint Navigation' },
                ...(coordSystem !== 'CARTESIAN_3D'
                  ? [{ value: 'GRAPH_ROUTE', label: 'Graph Route (Connected Graph Path)' }]
                  : []),
              ]}
            />
        </div>

        {/* 3. Conditional Pattern Settings */}
        <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg2)] p-3 space-y-3 relative z-0">
          {pattern === 'GRAPH_ROUTE' && (
            <div className="space-y-4">
              <GraphRouteCanvas config={config} onChange={onChange} />

              <div className="grid grid-cols-2 gap-3 pt-1">
                {/* Navigation Mode */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="graph-nav-mode" className="text-[10px] uppercase text-[var(--c-tx4)]">
                      Graph Navigation Mode
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                          <Info size={10} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px] space-y-1 text-[11px] leading-relaxed">
                        <p>{"• Random Neighbor: Moves randomly along connected edges to adjacent neighbor nodes."}</p>
                        <p>{"• Sequence: Follows a fixed ordered sequence of graph node IDs."}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <CustomDropdown
                    id="graph-nav-mode"
                    value={config.graphNavigationMode ?? 'RANDOM_NEIGHBOR'}
                    onChange={(val) => onChange({ graphNavigationMode: val as GraphNavigationMode })}
                    options={[
                      { value: 'RANDOM_NEIGHBOR', label: 'Random Neighbor (Graph Walk)' },
                      { value: 'SEQUENCE', label: 'Fixed Sequence (Node Path)' },
                    ]}
                  />
                </div>

                {/* Interpolation Steps */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="graph-interp-steps" className="text-[10px] uppercase text-[var(--c-tx4)]">
                      Ticks Per Edge (Interpolation)
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                          <Info size={10} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px] text-[11px] leading-relaxed">
                        {"Number of simulation ticks (sub-steps) required to move along an edge between two connected nodes. For example, 3 ticks means 3 intermediate position updates along the edge."}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="graph-interp-steps"
                    type="number"
                    min={1}
                    value={config.graphInterpolationSteps ?? 1}
                    onChange={(e) => onChange({ graphInterpolationSteps: parseInt(e.target.value) || 1 })}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                {/* Stop Probability */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="graph-stop-prob" className="text-[10px] uppercase text-[var(--c-tx4)]">
                      Pause Probability (0.0 - 1.0)
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                          <Info size={10} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[260px] text-[11px] leading-relaxed">
                        {"Probability per tick of remaining stopped/paused at a node instead of immediately continuing motion."}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="graph-stop-prob"
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={config.graphStopProbability ?? 0.0}
                    onChange={(e) => {
                      const parsed = parseFloat(e.target.value.replace(',', '.'));
                      onChange({ graphStopProbability: isNaN(parsed) ? 0.0 : parsed });
                    }}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                {/* Stop Ticks */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="graph-stop-ticks" className="text-[10px] uppercase text-[var(--c-tx4)]">
                      Pause Duration (Ticks)
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                          <Info size={10} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[260px] text-[11px] leading-relaxed">
                        {"Number of consecutive simulation ticks to stay paused when a stop event triggers."}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="graph-stop-ticks"
                    type="number"
                    min={0}
                    value={config.graphStopTicks ?? 0}
                    onChange={(e) => onChange({ graphStopTicks: parseInt(e.target.value) || 0 })}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Prevent Cycles Toggle */}
              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="graph-prevent-cycles" className="text-[10px] uppercase text-[var(--c-tx4)] cursor-pointer">
                    Prevent Cyclic Loops (Anti-Backtracking)
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                        <Info size={10} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[280px] text-[11px] leading-relaxed">
                      {"Prevents the generator from immediately retracing steps or getting stuck bouncing between the same adjacent nodes."}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <input
                  id="graph-prevent-cycles"
                  type="checkbox"
                  checked={config.graphPreventCycles ?? true}
                  onChange={(e) => onChange({ graphPreventCycles: e.target.checked })}
                  className="rounded border-[var(--c-br1)] bg-[var(--c-bg1)] text-cyan-500 focus:ring-0"
                />
              </div>

              {/* Fixed Sequence (Node Path) Builder UI */}
              {config.graphNavigationMode === 'SEQUENCE' && (() => {
                const graphNodes = config.graphNodes ?? [];
                const graphEdges: GraphEdge[] = config.graphEdges ?? [];
                const sequence = config.graphSequence ?? [];

                const getNeighborNodes = (lastId: string): GraphNode[] => {
                  const neighborIds = new Set<string>();
                  graphEdges.forEach((edge) => {
                    if (edge.fromNodeId === lastId && edge.toNodeId) {
                      neighborIds.add(edge.toNodeId);
                    }
                    if (edge.toNodeId === lastId && edge.fromNodeId && edge.bidirectional !== false) {
                      neighborIds.add(edge.fromNodeId);
                    }
                  });
                  return graphNodes.filter((node) => neighborIds.has(node.id));
                };

                const isInitial = sequence.length === 0;
                const lastNodeId = sequence[sequence.length - 1];
                const lastNode = graphNodes.find((n) => n.id === lastNodeId);
                const candidateNodes = isInitial
                  ? graphNodes
                  : getNeighborNodes(lastNodeId);

                return (
                  <div className="p-3 bg-[var(--c-bg3)] border border-cyan-500/20 rounded-md space-y-3 pt-2 mt-2">
                    <div className="flex items-center justify-between border-b border-[var(--c-br2)] pb-2">
                      <div className="flex items-center gap-2">
                        <Route size={14} className="text-cyan-400" />
                        <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                          Fixed Sequence Path Order
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-[10px] text-[var(--c-tx3)] cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={config.graphLoopSequence ?? true}
                            onChange={(e) => onChange({ graphLoopSequence: e.target.checked })}
                            className="rounded border-[var(--c-br1)] bg-slate-900 text-cyan-500 focus:ring-0 h-3 w-3"
                          />
                          Loop Sequence
                        </label>
                        {sequence.length > 0 && (
                          <button
                            type="button"
                            onClick={() => onChange({ graphSequence: [] })}
                            className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1"
                          >
                            <Trash2 size={10} />
                            Clear Path
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sequence Badge Chips */}
                    {sequence.length === 0 ? (
                      <div className="p-2 bg-slate-900/50 rounded border border-dashed border-slate-800 text-[11px] text-slate-400 text-center">
                        No nodes added to the sequence yet. Select an initial starting node below.
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-900/70 rounded border border-slate-800">
                        {sequence.map((nodeId, idx) => {
                          const nodeObj = graphNodes.find((n) => n.id === nodeId);
                          const displayName = nodeObj?.name || nodeId;
                          return (
                            <React.Fragment key={`${nodeId}-${idx}`}>
                              {idx > 0 && <ArrowRight size={10} className="text-cyan-500/60 shrink-0" />}
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded text-cyan-300 text-[11px] font-mono">
                                <span className="text-[9px] text-slate-400 font-sans">{idx + 1}.</span>
                                <span>{displayName}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = sequence.filter((_, i) => i !== idx);
                                    onChange({ graphSequence: updated });
                                  }}
                                  className="text-slate-400 hover:text-rose-400 ml-1 transition-colors"
                                  title="Remove node from sequence"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    )}

                    {/* Dropdown to Append Next Step */}
                    <div className="space-y-1 pt-1">
                      <Label className="text-[10px] text-slate-400 uppercase">
                        {isInitial
                          ? '1. Select Initial Starting Node'
                          : `2. Add Next Connected Step (Neighbors of ${lastNode?.name || lastNodeId})`}
                      </Label>

                      {candidateNodes.length === 0 ? (
                        <div className="text-[11px] text-amber-400/90 italic bg-amber-500/10 border border-amber-500/20 p-2 rounded">
                          {isInitial
                            ? 'No nodes exist in graph. Create nodes in the Route Graph Editor above first.'
                            : `Node "${lastNode?.name || lastNodeId}" has no connected neighbor edges. Connect edges to extend the sequence.`}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            id="add-next-sequence-node-select"
                            value=""
                            onChange={(e) => {
                              const selectedId = e.target.value;
                              if (selectedId) {
                                onChange({ graphSequence: [...sequence, selectedId] });
                              }
                            }}
                            className="h-8 flex-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 px-2 font-mono focus:border-cyan-500 focus:outline-none"
                          >
                            <option value="" disabled>
                              {isInitial
                                ? '-- Choose initial node --'
                                : `-- Add neighbor of ${lastNode?.name || lastNodeId} --`}
                            </option>
                            {candidateNodes.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.name ? `${n.name} (${n.id})` : n.id} [{n.x.toFixed(4)}, {n.y.toFixed(4)}]
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {pattern === 'FIXED_POINT' && (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="fixed-x" className="text-[9px] text-[var(--c-tx4)]">{labelX}</Label>
                <Input
                  id="fixed-x"
                  type="number"
                  step="0.0001"
                  value={config.fixedPoint?.x ?? 0}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    onChange({ fixedPoint: { ...config.fixedPoint, x: val } });
                  }}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fixed-y" className="text-[9px] text-[var(--c-tx4)]">{labelY}</Label>
                <Input
                  id="fixed-y"
                  type="number"
                  step="0.0001"
                  value={config.fixedPoint?.y ?? 0}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    onChange({ fixedPoint: { ...config.fixedPoint, y: val } });
                  }}
                  className="h-8 text-xs font-mono"
                />
              </div>
              {!is2D && (
                <div className="space-y-1">
                  <Label htmlFor="fixed-z" className="text-[9px] text-[var(--c-tx4)]">{labelZ}</Label>
                  <Input
                    id="fixed-z"
                    type="number"
                    step="0.0001"
                    value={config.fixedPoint?.z ?? 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      onChange({ fixedPoint: { ...config.fixedPoint, z: val } });
                    }}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              )}
            </div>
          )}

          {(pattern === 'RANDOM_WALK' || pattern === 'CONTINUOUS_MOVEMENT') && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="point-step" className="text-[10px] uppercase text-[var(--c-tx4)]">
                    Max Step Distance
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                        <Info size={10} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[280px] space-y-1 text-[11px] leading-relaxed">
                      <p>{"Max step distance per tick. In Geographic mode:"}</p>
                      <p>{"• 0.000009° ≈ 1 meter (pedestrian/drone)"}</p>
                      <p>{"• 0.00009° ≈ 10 meters (vehicle)"}</p>
                      <p>{"• 0.0009° ≈ 100 meters (highway)"}</p>
                      <p>{"• 0.009° ≈ 1 kilometer (aircraft)"}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="point-step"
                  type="text"
                  placeholder="e.g. 0.000009"
                  value={stepDistanceStr}
                  onChange={(e) => {
                    setStepDistanceStr(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) onChange({ maxStepDistance: val });
                  }}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="point-inertia" className="text-[10px] uppercase text-[var(--c-tx4)]">
                    Momentum / Inertia (0 to 1)
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                        <Info size={10} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[260px] space-y-1 text-[11px] leading-relaxed">
                      <p>{"Smoothness factor (0.0 to 0.99)."}</p>
                      <p>{"Higher values preserve previous movement direction for realistic smooth trajectories."}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="point-inertia"
                  type="text"
                  placeholder="e.g. 0.8"
                  value={inertiaStr}
                  onChange={(e) => {
                    setInertiaStr(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) onChange({ inertia: Math.max(0, Math.min(1, val)) });
                  }}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          )}

          {pattern === 'CIRCULAR_ORBIT' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="orbit-radius" className="text-[9px] text-[var(--c-tx4)]">Orbit Radius</Label>
                  <Input
                    id="orbit-radius"
                    type="text"
                    value={orbitRadiusStr}
                    onChange={(e) => {
                      setOrbitRadiusStr(e.target.value);
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) onChange({ orbitRadius: val });
                    }}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="angular-speed" className="text-[9px] text-[var(--c-tx4)]">Angular Speed (rad/tick)</Label>
                  <Input
                    id="angular-speed"
                    type="text"
                    value={angularSpeedStr}
                    onChange={(e) => {
                      setAngularSpeedStr(e.target.value);
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) onChange({ angularSpeed: val });
                    }}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="spiral-rate" className="text-[9px] text-[var(--c-tx4)]">Spiral Rate (+/- r/tick)</Label>
                  <Input
                    id="spiral-rate"
                    type="text"
                    value={spiralRateStr}
                    onChange={(e) => {
                      setSpiralRateStr(e.target.value);
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) onChange({ spiralRate: val });
                    }}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {(pattern === 'WAYPOINT_NAVIGATION' || pattern === 'PATH_INTERPOLATOR') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase text-[var(--c-tx4)]">Interpolation Steps per Segment</Label>
                <Input
                  type="number"
                  min={1}
                  value={config.interpolationSteps ?? 1}
                  onChange={(e) => onChange({ interpolationSteps: parseInt(e.target.value) || 1 })}
                  className="h-7 w-20 text-xs font-mono"
                />
              </div>
            </div>
          )}
        </div>

        {/* 4. GPS Noise / Position Jitter */}
        <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg2)] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="gps-noise-toggle" className="text-[10px] uppercase text-[var(--c-tx4)] cursor-pointer">
                Position Jitter / GPS Satellite Noise
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                    <Info size={10} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] space-y-1 text-[11px] leading-relaxed">
                  <p>{"Simulate real-world GPS hardware sensor noise and position fluctuation around target coordinates."}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <input
              id="gps-noise-toggle"
              type="checkbox"
              checked={config.gpsNoiseEnabled ?? false}
              onChange={(e) => onChange({ gpsNoiseEnabled: e.target.checked })}
              className="rounded border-[var(--c-br1)] accent-violet-500 cursor-pointer"
            />
          </div>

          {config.gpsNoiseEnabled && (
            <div className="space-y-1 pt-1">
              <Label htmlFor="jitter-radius" className="text-[9px] text-[var(--c-tx4)]">
                Random Jitter Noise Radius
              </Label>
              <Input
                id="jitter-radius"
                type="text"
                placeholder="e.g. 0.000005"
                value={jitterRadiusStr}
                onChange={(e) => {
                  setJitterRadiusStr(e.target.value);
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) onChange({ jitterRadius: val });
                }}
                className="h-8 text-xs font-mono"
              />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};
