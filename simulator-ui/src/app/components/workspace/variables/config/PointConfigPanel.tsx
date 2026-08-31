import React, { useState, useEffect } from 'react';
import { 
  PointVariableConfig, 
  CoordinateSystem, 
  GeospatialFormat, 
  BoundaryBehavior 
} from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';

import { Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../../../ui/tooltip';

interface PointConfigPanelProps {
  config: PointVariableConfig;
  onChange: (newConfig: Partial<PointVariableConfig>) => void;
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
    <div ref={containerRef} className="relative w-full">
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
        <div className="absolute left-0 right-0 mt-1 z-50 bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-2xl max-h-[200px] overflow-y-auto">
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

export const PointConfigPanel: React.FC<PointConfigPanelProps> = ({ config, onChange }) => {
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
        {/* 1. Coordinate System Selector */}
        <div className="grid grid-cols-2 gap-3">
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
              onChange={(val) => onChange({ coordinateSystem: val as CoordinateSystem })}
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
        <div className="space-y-1">
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
            ]}
          />
        </div>

        {/* 3. Conditional Pattern Settings */}
        <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg2)] p-3 space-y-3">
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
