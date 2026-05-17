import React, { useRef, useState, useEffect } from 'react';
import { Button } from '../../../ui/button';
import { Label } from '../../../ui/label';
import { Activity, RotateCcw, TrendingUp, Zap } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface SequentialGraphEditorProps {
  min: number;
  max: number;
  points: Point[];
  onChange: (points: Point[]) => void;
}

export const SequentialGraphEditor: React.FC<SequentialGraphEditorProps> = ({
  min = 0,
  max = 100,
  points = [],
  onChange,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);
  const [maxTicks, setMaxTicks] = useState<number>(10);

  // Initialize default points if empty
  useEffect(() => {
    if (!points || points.length === 0) {
      generatePreset('sine');
    } else {
      // Set maxTicks to the max X value in points
      const maxX = Math.max(...points.map((p) => p.x), 10);
      setMaxTicks(maxX);
    }
  }, []);

  // Global window listener to release drag state under any circumstance
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setActivePointIndex(null);
    };
    window.addEventListener('pointerup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalMouseUp);
    };
  }, []);

  const generatePreset = (type: 'sine' | 'ramp' | 'triangle' | 'constant') => {
    const newPoints: Point[] = [];
    const range = max - min;
    const mid = min + range / 2;

    for (let i = 0; i <= maxTicks; i++) {
      let y = mid;
      if (type === 'sine') {
        y = mid + (range / 2) * Math.sin((i / maxTicks) * Math.PI * 2);
      } else if (type === 'ramp') {
        y = min + range * (i / maxTicks);
      } else if (type === 'triangle') {
        const factor = i / maxTicks;
        y = min + range * (factor < 0.5 ? factor * 2 : (1 - factor) * 2);
      } else if (type === 'constant') {
        y = mid;
      }
      // Round to 2 decimal places
      y = Math.round(y * 100) / 100;
      newPoints.push({ x: i, y });
    }
    onChange(newPoints);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGCircleElement>, index: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setActivePointIndex(index);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activePointIndex === null || !svgRef.current) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    
    // Normalize coordinates inside SVG viewbox
    const clientY = e.clientY - rect.top;

    const svgHeight = rect.height;

    // Viewbox padding
    const paddingY = 30;

    const plotHeight = svgHeight - paddingY * 2;

    // Calculate Y value based on mouse Y position
    const relativeY = (clientY - paddingY) / plotHeight;
    const clampedRelativeY = Math.max(0, Math.min(1, relativeY));
    
    // Invert because Y = 0 is top of screen
    let newValue = max - clampedRelativeY * (max - min);
    newValue = Math.round(newValue * 100) / 100;

    const updatedPoints = [...points];
    if (updatedPoints[activePointIndex]) {
      updatedPoints[activePointIndex] = {
        ...updatedPoints[activePointIndex],
        y: newValue,
      };
      onChange(updatedPoints);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGCircleElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
    setActivePointIndex(null);
  };

  // Adjust number of ticks
  const handleTicksChange = (newMaxTicks: number) => {
    const val = Math.max(2, Math.min(50, newMaxTicks));
    setMaxTicks(val);

    // Rescale points to fit the new size
    const newPoints: Point[] = [];
    const range = max - min;

    for (let i = 0; i <= val; i++) {
      // Find nearest existing point or interpolate
      const targetPercent = i / val;
      const existingIdx = Math.round(targetPercent * (points.length - 1));
      const y = points[existingIdx]?.y ?? (min + range / 2);
      newPoints.push({ x: i, y });
    }
    onChange(newPoints);
  };

  // SVG coordinate mapper
  const getSvgCoordinates = (pt: Point) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    
    const paddingX = 40;
    const paddingY = 20;

    const plotWidth = 400 - paddingX * 2; // viewBox width is 400
    const plotHeight = 150 - paddingY * 2; // viewBox height is 150

    const pctX = pt.x / maxTicks;
    const pctY = (pt.y - min) / (max - min || 1);

    const x = paddingX + pctX * plotWidth;
    const y = paddingY + (1 - pctY) * plotHeight; // Invert Y

    return { x, y };
  };

  // Generate gridlines
  const gridLines = [];
  const svgGridHeight = 150 - 40;
  const paddingX = 40;
  const paddingY = 20;

  // Horizontal grid lines
  for (let i = 0; i <= 4; i++) {
    const pct = i / 4;
    const y = paddingY + pct * svgGridHeight;
    const val = max - pct * (max - min);
    gridLines.push(
      <g key={`h-grid-${i}`}>
        <line
          x1={paddingX}
          y1={y}
          x2={400 - paddingX}
          y2={y}
          stroke="var(--c-br1)"
          strokeWidth="0.5"
          strokeDasharray="2,2"
        />
        <text
          x={paddingX - 8}
          y={y + 3}
          fill="var(--c-tx4)"
          fontSize="6.5"
          textAnchor="end"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          {val.toFixed(1)}
        </text>
      </g>
    );
  }

  // Generate points coordinates for rendering
  const svgPoints = points.map((p) => getSvgCoordinates(p));
  const pathD = svgPoints.reduce((acc, pt, idx) => {
    return acc + (idx === 0 ? `M ${pt.x} ${pt.y}` : ` L ${pt.x} ${pt.y}`);
  }, '');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-[var(--c-tx4)] uppercase tracking-wider">
          Sequence Editor ({points.length} points)
        </Label>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[var(--c-tx4)]">Ticks:</span>
          <input
            type="number"
            value={maxTicks}
            onChange={(e) => handleTicksChange(parseInt(e.target.value) || 10)}
            className="w-12 rounded border border-[var(--c-br1)] bg-[var(--c-bg3)] px-1 py-0.5 text-center text-xs text-[var(--c-tx1)]"
            min={2}
            max={50}
          />
        </div>
      </div>

      <div className="relative rounded border border-[var(--c-br1)] bg-[var(--c-bg3)] p-2">
        <svg
          ref={svgRef}
          viewBox="0 0 400 150"
          className="w-full select-none overflow-visible"
          onPointerMove={handlePointerMove}
          onPointerUp={() => setActivePointIndex(null)}
          onPointerLeave={() => setActivePointIndex(null)}
          style={{ touchAction: 'none' }}
        >
          {/* Axis Labels */}
          <text
            x={10}
            y={75}
            fill="var(--c-tx4)"
            fontSize="6"
            opacity="0.6"
            transform="rotate(-90 10 75)"
            textAnchor="middle"
            style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em', fontWeight: 600 }}
          >
            VALUE (Y)
          </text>
          <text
            x={200}
            y={145}
            fill="var(--c-tx4)"
            fontSize="6"
            opacity="0.6"
            textAnchor="middle"
            style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em', fontWeight: 600 }}
          >
            SEQUENCE TICK (X)
          </text>

          {/* Grid lines */}
          {gridLines}

          {/* Line connecting points */}
          {svgPoints.length > 1 && (
            <>
              {/* Glowing background line */}
              <path
                d={pathD}
                fill="none"
                stroke="rgba(6, 182, 212, 0.4)"
                strokeWidth="4"
                className="blur-[2px]"
              />
              {/* Main crisp line */}
              <path
                d={pathD}
                fill="none"
                stroke="rgb(6, 182, 212)"
                strokeWidth="1.5"
              />
            </>
          )}

          {/* Interactive Nodes */}
          {svgPoints.map((pt, idx) => {
            const isHovered = activePointIndex === idx;
            return (
              <g key={`node-${idx}`} className="cursor-ns-resize group">
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="10"
                  fill="transparent"
                  onPointerDown={(e) => handlePointerDown(e, idx)}
                  onPointerUp={handlePointerUp}
                />
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? "5" : "3.5"}
                  fill={isHovered ? "rgb(6, 182, 212)" : "var(--c-bg4)"}
                  stroke="rgb(6, 182, 212)"
                  strokeWidth="2"
                  onPointerDown={(e) => handlePointerDown(e, idx)}
                  onPointerUp={handlePointerUp}
                />
                {/* Micro tooltip inside SVG */}
                {(isHovered || activePointIndex === idx) && (
                  <g transform={`translate(${pt.x}, ${pt.y - 12})`}>
                    <rect
                      x="-20"
                      y="-12"
                      width="40"
                      height="12"
                      rx="2"
                      fill="var(--c-bg4)"
                      stroke="var(--c-br1)"
                      strokeWidth="0.5"
                    />
                    <text
                      x="0"
                      y="-4"
                      fill="var(--c-tx1)"
                      fontSize="6"
                      textAnchor="middle"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    >
                      {points[idx]?.y.toFixed(1)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Preset generators for quick drawing */}
      <div className="grid grid-cols-4 gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => generatePreset('sine')}
          className="flex h-7 items-center justify-center gap-1 text-[10px]"
        >
          <Activity size={10} className="text-cyan-400" /> Sine Wave
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => generatePreset('ramp')}
          className="flex h-7 items-center justify-center gap-1 text-[10px]"
        >
          <TrendingUp size={10} className="text-emerald-400" /> Ramp
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => generatePreset('triangle')}
          className="flex h-7 items-center justify-center gap-1 text-[10px]"
        >
          <Zap size={10} className="text-amber-400" /> Triangle
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => generatePreset('constant')}
          className="flex h-7 items-center justify-center gap-1 text-[10px]"
        >
          <RotateCcw size={10} className="text-rose-400" /> Flat Line
        </Button>
      </div>
    </div>
  );
};
