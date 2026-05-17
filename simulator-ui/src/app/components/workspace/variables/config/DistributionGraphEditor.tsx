import React, { useEffect } from 'react';
import { Button } from '../../../ui/button';
import { Label } from '../../../ui/label';
import { BarChart3, Sliders, Sparkles, TrendingUp } from 'lucide-react';

interface WeightedValue {
  value?: number;
  from?: number;
  to?: number;
  weight: number;
}

interface DistributionGraphEditorProps {
  min: number;
  max: number;
  points: WeightedValue[];
  onChange: (points: WeightedValue[]) => void;
  boundaryMode?: 'LEFT' | 'RIGHT' | 'SPLIT';
  onBoundaryModeChange?: (mode: 'LEFT' | 'RIGHT' | 'SPLIT') => void;
}

export const DistributionGraphEditor: React.FC<DistributionGraphEditorProps> = ({
  min = 0,
  max = 100,
  points = [],
  onChange,
  boundaryMode = 'RIGHT',
  onBoundaryModeChange,
}) => {

  const generatePreset = (type: 'uniform' | 'normal' | 'exponential' | 'skewed', overrideCount?: number) => {
    const newPoints: WeightedValue[] = [];
    const range = max - min;
    const numBars = overrideCount ?? points.length ?? 5;

    for (let i = 0; i < numBars; i++) {
      const fromVal = min + range * (i / numBars);
      const toVal = min + range * ((i + 1) / numBars);
      const fraction = (i + 0.5) / numBars; // middle of the interval
      let weight = 50;

      if (type === 'uniform') {
        weight = 50;
      } else if (type === 'normal') {
        // Gaussian curve centered at 0.5
        const x = fraction - 0.5;
        weight = Math.round(100 * Math.exp(-(x * x) / (2 * 0.15 * 0.15)));
      } else if (type === 'exponential') {
        // Exponential decay starting at min
        weight = Math.round(100 * Math.exp(-i * 0.8));
      } else if (type === 'skewed') {
        // Skewed towards max
        weight = Math.round(100 * fraction);
      }

      newPoints.push({
        from: Math.round(fromVal * 100) / 100,
        to: Math.round(toVal * 100) / 100,
        weight: Math.max(0, Math.min(100, weight)),
      });
    }
    onChange(newPoints);
  };

  // Initialize defaults if empty or old format
  useEffect(() => {
    if (!points || points.length === 0 || points[0]?.from === undefined) {
      generatePreset('uniform', 5);
    }
  }, []);

  const handleWeightChange = (index: number, newWeight: number) => {
    const val = Math.max(0, Math.min(100, newWeight));
    const updated = [...points];
    if (updated[index]) {
      updated[index] = {
        ...updated[index],
        weight: Math.round(val),
      };
      onChange(updated);
    }
  };

  const handleBoundaryChange = (index: number, newToVal: number) => {
    const updated = [...points];
    
    // Clamp B_{i+1} to be between its interval start and next interval's end
    const currentFrom = updated[index]?.from ?? min;
    const nextMax = updated[index + 2]?.from ?? max;
    const val = Math.max(currentFrom, Math.min(nextMax, newToVal));

    if (updated[index]) {
      updated[index] = {
        ...updated[index],
        to: Math.round(val * 100) / 100,
      };
    }
    if (updated[index + 1]) {
      updated[index + 1] = {
        ...updated[index + 1],
        from: Math.round(val * 100) / 100,
      };
    }
    onChange(updated);
  };

  const handleIntervalsCountChange = (count: number) => {
    const newCount = Math.max(2, Math.min(15, count));
    if (newCount === points.length) return;
    generatePreset('uniform', newCount);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between relative z-10">
        <Label className="text-[11px] text-[var(--c-tx4)] uppercase tracking-wider">
          Custom Weights Equalizer
        </Label>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--c-tx4)]">Intervals:</span>
            <input
              type="number"
              value={points.length}
              onChange={(e) => handleIntervalsCountChange(parseInt(e.target.value) || 5)}
              className="w-12 rounded border border-[var(--c-br1)] bg-[var(--c-bg3)] px-1 py-0.5 text-center text-xs text-[var(--c-tx1)]"
              min={2}
              max={15}
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--c-tx4)]">Boundary:</span>
            <select
              value={boundaryMode}
              onChange={(e) => onBoundaryModeChange?.(e.target.value as 'LEFT' | 'RIGHT' | 'SPLIT')}
              className="rounded border border-[var(--c-br1)] bg-[var(--c-bg3)] px-1 py-0.5 text-xs text-[var(--c-tx1)] font-mono outline-none"
            >
              <option value="RIGHT">Right [A, B)</option>
              <option value="LEFT">Left (A, B]</option>
              <option value="SPLIT">Split (50/50)</option>
            </select>
          </div>
          <span className="text-[9px] text-[var(--c-tx4)] italic hidden lg:inline">
            Contiguous value ranges (complete & closed)
          </span>
        </div>
      </div>

      {/* Equalizer with axes wrapped in a bordered card container */}
      <div className="rounded-lg border border-[var(--c-br1)] bg-[var(--c-bg2)]/30 p-4 relative z-0">
        <div className="flex gap-2">
          {/* Y Axis Label */}
          <div className="flex flex-col justify-between items-center text-[8px] font-mono text-[var(--c-tx4)] select-none py-3 border-r border-[var(--c-br1)] pr-2 w-8">
            <span>100%</span>
            <span className="origin-center -rotate-90 my-3 tracking-wider whitespace-nowrap font-bold text-[7px] uppercase text-cyan-400">
              WEIGHT
            </span>
            <span>0%</span>
          </div>

          {/* Equalizer bars */}
          <div className="flex-1 space-y-1.5">
            <div className="flex h-44 items-end justify-between gap-1.5 rounded border border-[var(--c-br1)] bg-[var(--c-bg3)] p-2">
              {points.map((pt, idx) => {
                return (
                  <div key={`bar-${idx}`} className="flex flex-1 flex-col items-center h-full group">
                    <div className="relative flex-1 w-full flex items-end justify-center pb-1">
                      {/* Visual Glow Bar */}
                      <div
                        className="w-full max-w-[20px] rounded-t bg-cyan-500/20 border-t-2 border-cyan-400 group-hover:bg-cyan-500/35 transition-all duration-100"
                        style={{ height: `${pt.weight}%` }}
                      />
                      
                      {/* Invisible larger hover zone for easier touch/drag */}
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={pt.weight}
                        onChange={(e) => handleWeightChange(idx, parseInt(e.target.value) || 0)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-row-resize"
                        style={{ transform: 'rotate(270deg)', transformOrigin: 'center' }}
                      />

                      {/* Micro weight tooltip on hover */}
                      <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150 bottom-full mb-1 bg-[var(--c-bg4)] border border-[var(--c-br1)] rounded px-1 py-0.5 text-[8px] text-[var(--c-tx1)] font-mono z-10 pointer-events-none">
                        {pt.weight}%
                      </div>
                    </div>

                    {/* Slider thumb/indicator - INPUT to customize each interval range */}
                    <div className="w-full text-center mt-1 border-t border-[var(--c-br1)] pt-1 select-none">
                      <div className="flex flex-col items-center text-[7px] text-[var(--c-tx4)] font-mono">
                        <span className="opacity-60">FROM:</span>
                        <span className="text-[8px] text-[var(--c-tx2)] font-semibold truncate max-w-full">
                          {pt.from?.toFixed(1) ?? '0.0'}
                        </span>
                        <span className="opacity-60 mt-0.5">TO:</span>
                        {idx < points.length - 1 ? (
                          <input
                            type="number"
                            value={pt.to ?? 0}
                            onChange={(e) => handleBoundaryChange(idx, parseFloat(e.target.value) || 0)}
                            className="w-full text-center text-[10px] text-cyan-400 font-bold bg-[var(--c-bg4)] hover:bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded py-0.5 px-0.5 font-mono outline-none transition-all focus:border-cyan-400"
                            step="any"
                          />
                        ) : (
                          <span className="text-[8px] text-[var(--c-tx2)] font-semibold truncate max-w-full">
                            {pt.to?.toFixed(1) ?? '100.0'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* X Axis Label */}
            <div className="text-center text-[7px] font-mono font-bold tracking-wider text-[var(--c-tx4)] uppercase select-none">
              POSSIBLE VALUE RANGE (INTERVALS)
            </div>
          </div>
        </div>
      </div>

      {/* Preset configurations */}
      <div className="grid grid-cols-4 gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => generatePreset('uniform')}
          className="flex h-7 items-center justify-center gap-1 text-[10px]"
        >
          <Sliders size={10} className="text-cyan-400" /> Uniform
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => generatePreset('normal')}
          className="flex h-7 items-center justify-center gap-1 text-[10px]"
        >
          <Sparkles size={10} className="text-purple-400" /> Normal
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => generatePreset('exponential')}
          className="flex h-7 items-center justify-center gap-1 text-[10px]"
        >
          <TrendingUp size={10} className="text-amber-400" /> Decay
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => generatePreset('skewed')}
          className="flex h-7 items-center justify-center gap-1 text-[10px]"
        >
          <BarChart3 size={10} className="text-emerald-400" /> Skewed
        </Button>
      </div>
    </div>
  );
};
