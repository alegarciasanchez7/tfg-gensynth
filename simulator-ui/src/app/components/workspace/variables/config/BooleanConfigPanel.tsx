import React from 'react';
import { BooleanVariableConfig, BooleanGenerationPattern } from '../../../../types';
import { Switch } from '../../../ui/switch';
import { Label } from '../../../ui/label';
import { Input } from '../../../ui/input';
import { CustomDropdown } from '../../../ui/custom-dropdown';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../ui/tooltip';
import { Info } from 'lucide-react';

interface BooleanConfigPanelProps {
  config: BooleanVariableConfig;
  onChange: (newConfig: Partial<BooleanVariableConfig>) => void;
}

const PATTERN_OPTIONS = [
  { value: 'CONSTANT_BOOLEAN', label: 'Constant State (Fixed ON/OFF)' },
  { value: 'PROBABILITY', label: 'Probability Ratio P(true)' },
  { value: 'FLIP_INTERVAL', label: 'Flip Interval (Periodic Inversion)' },
  { value: 'BURST_MODE', label: 'Burst Mode (Active Burst Cycles)' },
  { value: 'MARKOV', label: 'Markov Chain (Digital Transitions)' },
  { value: 'DUTY_CYCLE', label: 'Duty Cycle (ON/OFF Durations)' },
  { value: 'ALTERNATING_BOOLEAN', label: 'Alternating Toggles' },
];

const PATTERN_DESCRIPTIONS: Record<BooleanGenerationPattern, string> = {
  CONSTANT_BOOLEAN: 'Holds a static ON (true) or OFF (false) state continuously throughout simulation.',
  PROBABILITY: 'Generates TRUE with a configurable probability ratio P(true) (0.0 to 1.0) on every tick.',
  FLIP_INTERVAL: 'Periodically inverts the boolean state every N cycles (e.g. N=3 -> TRUE, TRUE, TRUE, FALSE...).',
  BURST_MODE: 'Remains in the TRUE state for an active burst of N cycles, then reverts to FALSE for M idle cycles.',
  MARKOV: 'Models 2-state digital transitions using probabilities P(TRUE -> TRUE) and P(FALSE -> TRUE).',
  DUTY_CYCLE: 'Cycles between ON and OFF states with custom tick durations for each state.',
  ALTERNATING_BOOLEAN: 'Toggles between TRUE and FALSE every N ticks.',
};

export const BooleanConfigPanel: React.FC<BooleanConfigPanelProps> = ({ config, onChange }) => {
  const currentPattern: BooleanGenerationPattern = config.pattern ?? 'CONSTANT_BOOLEAN';
  const currentValue = config.currentValue ?? true;

  const handlePatternChange = (patternStr: string) => {
    const newPattern = patternStr as BooleanGenerationPattern;
    onChange({ pattern: newPattern });
  };

  return (
    <div className="space-y-5">
      {/* Pattern Selection */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="boolean-pattern-select" className="text-[11px] font-medium text-[var(--c-tx2)]">
            Generation Pattern
          </Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors"
                aria-label="Generation pattern info"
              >
                <Info size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[280px] space-y-1 text-[11px] leading-relaxed">
              <p className="font-semibold text-cyan-400">{currentPattern}</p>
              <p>{PATTERN_DESCRIPTIONS[currentPattern] || 'Custom boolean state pattern.'}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <CustomDropdown
          id="boolean-pattern-select"
          value={currentPattern}
          onChange={handlePatternChange}
          options={PATTERN_OPTIONS}
        />
      </div>

      {/* Starting / Initial Value */}
      <div className="flex items-center justify-between p-3 bg-[var(--c-bg2)]/50 border border-[var(--c-br1)] rounded-md">
        <div className="space-y-0.5">
          <Label htmlFor="boolean-value" className="text-xs font-medium text-[var(--c-tx1)]">
            Initial State
          </Label>
          <p className="text-[10px] text-[var(--c-tx4)]">
            Starting digital state ({currentValue ? 'ON / true' : 'OFF / false'})
          </p>
        </div>
        <Switch
          id="boolean-value"
          checked={currentValue}
          onCheckedChange={(checked) => onChange({ currentValue: checked })}
        />
      </div>

      {/* Pattern-Specific Configuration Parameters */}
      {currentPattern === 'PROBABILITY' && (
        <div className="p-3 bg-[var(--c-bg2)]/50 border border-[var(--c-br1)] rounded-md space-y-3">
          <div className="flex items-center gap-1.5 border-b border-[var(--c-br1)] pb-1.5">
            <h4 className="text-[12px] font-medium text-[var(--c-tx1)]">Probability Parameters</h4>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={11} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-[11px] leading-relaxed">
                Configure P(true) probability ratio between 0.0 (0% true) and 1.0 (100% true).
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-[var(--c-tx2)]">
              <Label htmlFor="boolean-true-probability" className="text-[11px]">Probability P(true)</Label>
              <span className="font-mono text-cyan-400">{(config.trueProbability ?? 0.5).toFixed(2)}</span>
            </div>
            <Input
              id="boolean-true-probability"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={config.trueProbability ?? 0.5}
              onChange={(e) => onChange({ trueProbability: parseFloat(e.target.value) || 0 })}
              className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
            />
          </div>
        </div>
      )}

      {currentPattern === 'FLIP_INTERVAL' && (
        <div className="p-3 bg-[var(--c-bg2)]/50 border border-[var(--c-br1)] rounded-md space-y-3">
          <div className="flex items-center gap-1.5 border-b border-[var(--c-br1)] pb-1.5">
            <h4 className="text-[12px] font-medium text-[var(--c-tx1)]">Flip Interval Parameters</h4>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={11} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-[11px] leading-relaxed">
                Number of cycles N before inverting the digital state.
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="space-y-1">
            <Label htmlFor="boolean-flip-interval" className="text-[11px]">Flip Interval N (cycles)</Label>
            <Input
              id="boolean-flip-interval"
              type="number"
              min={1}
              value={config.flipInterval ?? 1}
              onChange={(e) => onChange({ flipInterval: parseInt(e.target.value, 10) || 1 })}
              className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
            />
          </div>
        </div>
      )}

      {currentPattern === 'BURST_MODE' && (
        <div className="p-3 bg-[var(--c-bg2)]/50 border border-[var(--c-br1)] rounded-md space-y-3">
          <div className="flex items-center gap-1.5 border-b border-[var(--c-br1)] pb-1.5">
            <h4 className="text-[12px] font-medium text-[var(--c-tx1)]">Burst Mode Parameters</h4>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={11} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-[11px] leading-relaxed">
                Duration of active TRUE burst cycles vs idle FALSE cycles.
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="boolean-burst-duration" className="text-[11px]">Burst Active (ticks)</Label>
              <Input
                id="boolean-burst-duration"
                type="number"
                min={1}
                value={config.burstDurationTicks ?? 5}
                onChange={(e) => onChange({ burstDurationTicks: parseInt(e.target.value, 10) || 1 })}
                className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="boolean-burst-idle" className="text-[11px]">Burst Idle (ticks)</Label>
              <Input
                id="boolean-burst-idle"
                type="number"
                min={0}
                value={config.burstIdleTicks ?? 5}
                onChange={(e) => onChange({ burstIdleTicks: parseInt(e.target.value, 10) || 0 })}
                className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
              />
            </div>
          </div>
        </div>
      )}

      {currentPattern === 'MARKOV' && (
        <div className="p-3 bg-[var(--c-bg2)]/50 border border-[var(--c-br1)] rounded-md space-y-3">
          <div className="flex items-center gap-1.5 border-b border-[var(--c-br1)] pb-1.5">
            <h4 className="text-[12px] font-medium text-[var(--c-tx1)]">Markov Transition Probabilities</h4>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={11} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-[11px] leading-relaxed">
                State transition probabilities between TRUE and FALSE digital states.
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="boolean-p-true-true" className="text-[11px]">P(TRUE → TRUE)</Label>
              <Input
                id="boolean-p-true-true"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={config.pTrueToTrue ?? 0.8}
                onChange={(e) => onChange({ pTrueToTrue: parseFloat(e.target.value) || 0 })}
                className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="boolean-p-false-true" className="text-[11px]">P(FALSE → TRUE)</Label>
              <Input
                id="boolean-p-false-true"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={config.pFalseToTrue ?? 0.2}
                onChange={(e) => onChange({ pFalseToTrue: parseFloat(e.target.value) || 0 })}
                className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
              />
            </div>
          </div>
        </div>
      )}

      {currentPattern === 'DUTY_CYCLE' && (
        <div className="p-3 bg-[var(--c-bg2)]/50 border border-[var(--c-br1)] rounded-md space-y-3">
          <div className="flex items-center gap-1.5 border-b border-[var(--c-br1)] pb-1.5">
            <h4 className="text-[12px] font-medium text-[var(--c-tx1)]">Duty Cycle Durations</h4>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={11} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-[11px] leading-relaxed">
                Durations spent in ON state vs OFF state in ticks.
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="boolean-on-duration" className="text-[11px]">ON Duration (ticks)</Label>
              <Input
                id="boolean-on-duration"
                type="number"
                min={1}
                value={config.onDurationTicks ?? 1}
                onChange={(e) => onChange({ onDurationTicks: parseInt(e.target.value, 10) || 1 })}
                className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="boolean-off-duration" className="text-[11px]">OFF Duration (ticks)</Label>
              <Input
                id="boolean-off-duration"
                type="number"
                min={1}
                value={config.offDurationTicks ?? 1}
                onChange={(e) => onChange({ offDurationTicks: parseInt(e.target.value, 10) || 1 })}
                className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
              />
            </div>
          </div>
        </div>
      )}

      {currentPattern === 'ALTERNATING_BOOLEAN' && (
        <div className="p-3 bg-[var(--c-bg2)]/50 border border-[var(--c-br1)] rounded-md space-y-3">
          <div className="flex items-center gap-1.5 border-b border-[var(--c-br1)] pb-1.5">
            <h4 className="text-[12px] font-medium text-[var(--c-tx1)]">Alternation Parameters</h4>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={11} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-[11px] leading-relaxed">
                Number of ticks between state toggles.
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="space-y-1">
            <Label htmlFor="boolean-alternation-interval" className="text-[11px]">Alternation Interval (ticks)</Label>
            <Input
              id="boolean-alternation-interval"
              type="number"
              min={1}
              value={config.alternationInterval ?? 1}
              onChange={(e) => onChange({ alternationInterval: parseInt(e.target.value, 10) || 1 })}
              className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
            />
          </div>
        </div>
      )}
    </div>
  );
};
