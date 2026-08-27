import React from 'react';
import { TemporalVariableConfig, TimeAdvanceMode, ClockDriftType, BackfillStrategy, TemporalType } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../ui/select';
import { Switch } from '../../../ui/switch';

interface TemporalConfigPanelProps {
  config: TemporalVariableConfig;
  onChange: (newConfig: Partial<TemporalVariableConfig>) => void;
}

const PRESETS: Record<TemporalType, string[]> = {
  DATE: ['yyyy-MM-dd', 'dd/MM/yyyy', 'MM-dd-yyyy', 'yyyy.MM.dd'],
  TIMESTAMP: ["yyyy-MM-dd'T'HH:mm:ss.SSSZ", 'ISO_INSTANT', 'UNIX_TIMESTAMP', 'yyyy-MM-dd HH:mm:ss'],
  TIME: ['HH:mm:ss', 'HH:mm', 'HH:mm:ss.SSS', 'hh:mm a']
};

export const TemporalConfigPanel: React.FC<TemporalConfigPanelProps> = ({ config, onChange }) => {
  const tType: TemporalType = config.temporalType ?? 'TIMESTAMP';
  const advanceMode: TimeAdvanceMode = config.timeAdvanceMode ?? 'WALL_CLOCK';
  const presets = PRESETS[tType] || PRESETS.TIMESTAMP;

  const handleAdvanceModeChange = (mode: TimeAdvanceMode) => {
    const updates: Partial<TemporalVariableConfig> = { timeAdvanceMode: mode };
    if (mode === 'SIMULATED_STEP' && !config.startDate) {
      updates.startDate = new Date().toISOString();
      if (!config.incrementMs) updates.incrementMs = 1000;
    } else if (mode === 'BACKFILL_HISTORICAL' && !config.rangeStart) {
      const now = new Date();
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      updates.rangeStart = past.toISOString();
      updates.rangeEnd = now.toISOString();
      updates.backfillStrategy = config.backfillStrategy ?? 'SEQUENTIAL_STEP';
      if (!config.incrementMs) updates.incrementMs = 60000;
    } else if (mode === 'FIXED' && !config.fixedDate) {
      updates.fixedDate = new Date().toISOString();
    }
    onChange(updates);
  };

  return (
    <div className="space-y-6">
      {/* 1. Time Advance Mode Section */}
      <div className="p-3 bg-[var(--c-bg2)]/50 border border-[var(--c-br1)] rounded-md space-y-3">
        <h4 className="text-[12px] font-medium text-[var(--c-tx1)] border-b border-[var(--c-br1)] pb-1.5">
          Time Advance Mode
        </h4>
        <div className="space-y-2">
          <Label htmlFor="time-advance-mode">Advance Mode</Label>
          <Select
            value={advanceMode}
            onValueChange={(val: TimeAdvanceMode) => handleAdvanceModeChange(val)}
          >
            <SelectTrigger id="time-advance-mode" className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]">
              <SelectValue placeholder="Select advance mode" />
            </SelectTrigger>
            <SelectContent className="bg-[var(--c-bg2)] border-[var(--c-br1)]">
              <SelectItem value="WALL_CLOCK" className="text-[11px]">Wall Clock (Real System Time)</SelectItem>
              <SelectItem value="SIMULATED_STEP" className="text-[11px]">Simulated Step (Incremental Tick)</SelectItem>
              <SelectItem value="BACKFILL_HISTORICAL" className="text-[11px]">Backfill Historical (Mass Range)</SelectItem>
              <SelectItem value="FIXED" className="text-[11px]">Fixed (Constant Timestamp)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Mode Specific Controls */}
        {advanceMode === 'SIMULATED_STEP' && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="start-date" className="text-[10px]">Start Date (ISO)</Label>
              <Input
                id="start-date"
                type="text"
                placeholder="e.g. 2026-01-01T00:00:00Z"
                value={config.startDate ?? ''}
                onChange={(e) => onChange({ startDate: e.target.value })}
                className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px] font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="increment-ms" className="text-[10px]">Step Duration (ms)</Label>
              <Input
                id="increment-ms"
                type="number"
                min={0}
                placeholder="1000"
                value={config.incrementMs ?? 1000}
                onChange={(e) => onChange({ incrementMs: Number(e.target.value) })}
                className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
              />
            </div>
          </div>
        )}

        {advanceMode === 'BACKFILL_HISTORICAL' && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="range-start" className="text-[10px]">Range Start (ISO)</Label>
                <Input
                  id="range-start"
                  type="text"
                  placeholder="e.g. 2026-01-01T00:00:00Z"
                  value={config.rangeStart ?? ''}
                  onChange={(e) => onChange({ rangeStart: e.target.value })}
                  className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px] font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="range-end" className="text-[10px]">Range End (ISO)</Label>
                <Input
                  id="range-end"
                  type="text"
                  placeholder="e.g. 2026-01-07T00:00:00Z"
                  value={config.rangeEnd ?? ''}
                  onChange={(e) => onChange({ rangeEnd: e.target.value })}
                  className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px] font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="backfill-strategy" className="text-[10px]">Sampling Strategy</Label>
                <Select
                  value={config.backfillStrategy ?? 'SEQUENTIAL_STEP'}
                  onValueChange={(val: BackfillStrategy) => onChange({ backfillStrategy: val })}
                >
                  <SelectTrigger id="backfill-strategy" className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]">
                    <SelectValue placeholder="Select strategy" />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--c-bg2)] border-[var(--c-br1)]">
                    <SelectItem value="SEQUENTIAL_STEP" className="text-[11px]">Sequential Step</SelectItem>
                    <SelectItem value="RANDOM_IN_RANGE" className="text-[11px]">Random Uniform in Span</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {config.backfillStrategy !== 'RANDOM_IN_RANGE' && (
                <div className="space-y-1.5">
                  <Label htmlFor="backfill-step-ms" className="text-[10px]">Step Duration (ms)</Label>
                  <Input
                    id="backfill-step-ms"
                    type="number"
                    min={1}
                    placeholder="60000"
                    value={config.incrementMs ?? 60000}
                    onChange={(e) => onChange({ incrementMs: Number(e.target.value) })}
                    className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {advanceMode === 'FIXED' && (
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="fixed-date" className="text-[10px]">Fixed Date/Time (ISO)</Label>
            <Input
              id="fixed-date"
              type="text"
              placeholder="e.g. 2026-06-15T12:00:00Z"
              value={config.fixedDate ?? ''}
              onChange={(e) => onChange({ fixedDate: e.target.value })}
              className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px] font-mono"
            />
          </div>
        )}
      </div>

      {/* 2. Clock Drift & Skew (NTP Jitter) Simulation Section */}
      <div className="p-3 bg-[var(--c-bg2)]/50 border border-[var(--c-br1)] rounded-md space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--c-br1)] pb-1.5">
          <h4 className="text-[12px] font-medium text-[var(--c-tx1)]">
            Clock Drift / Skew (NTP Jitter)
          </h4>
          <div className="flex items-center gap-2">
            <Label htmlFor="clock-drift-toggle" className="text-[10px] text-[var(--c-tx3)]">
              {config.clockDriftEnabled ? 'Enabled' : 'Disabled'}
            </Label>
            <Switch
              id="clock-drift-toggle"
              aria-label="Clock Drift Toggle"
              checked={config.clockDriftEnabled ?? false}
              onCheckedChange={(checked) => onChange({ clockDriftEnabled: checked })}
            />
          </div>
        </div>

        {config.clockDriftEnabled && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="drift-type" className="text-[10px]">Drift Mode</Label>
                <Select
                  value={config.driftType ?? 'RANDOM_JITTER'}
                  onValueChange={(val: ClockDriftType) => onChange({ driftType: val })}
                >
                  <SelectTrigger id="drift-type" className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]">
                    <SelectValue placeholder="Select drift mode" />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--c-bg2)] border-[var(--c-br1)]">
                    <SelectItem value="RANDOM_JITTER" className="text-[11px]">Random Jitter (± Bounds)</SelectItem>
                    <SelectItem value="CONSTANT_OFFSET" className="text-[11px]">Constant Static Shift</SelectItem>
                    <SelectItem value="PROGRESSIVE_DRIFT" className="text-[11px]">Progressive Drift / Tick</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="max-drift-ms" className="text-[10px]">
                  {config.driftType === 'CONSTANT_OFFSET' ? 'Static Shift (ms)' : 'Max Jitter Bound (ms)'}
                </Label>
                <Input
                  id="max-drift-ms"
                  type="number"
                  min={0}
                  placeholder="2000"
                  value={config.maxDriftMs ?? 0}
                  onChange={(e) => onChange({ maxDriftMs: Number(e.target.value) })}
                  className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
                />
              </div>
            </div>

            {config.driftType === 'PROGRESSIVE_DRIFT' && (
              <div className="space-y-1.5">
                <Label htmlFor="drift-rate-ms" className="text-[10px]">Drift Rate (ms / tick)</Label>
                <Input
                  id="drift-rate-ms"
                  type="number"
                  step="0.1"
                  placeholder="1.0"
                  value={config.driftRateMsPerTick ?? 1.0}
                  onChange={(e) => onChange({ driftRateMsPerTick: Number(e.target.value) })}
                  className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Output Formatting & Timezone Section */}
      <div className="p-3 bg-[var(--c-bg2)]/50 border border-[var(--c-br1)] rounded-md space-y-3">
        <h4 className="text-[12px] font-medium text-[var(--c-tx1)] border-b border-[var(--c-br1)] pb-1.5">
          Output Category & Formatting
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="temporal-type">Output Category</Label>
            <Select
              value={tType}
              onValueChange={(val: TemporalType) => {
                const defaultFormat = PRESETS[val][0];
                onChange({ temporalType: val, dateFormat: defaultFormat });
              }}
            >
              <SelectTrigger id="temporal-type" className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent className="bg-[var(--c-bg2)] border-[var(--c-br1)]">
                <SelectItem value="DATE" className="text-[11px]">Date Only</SelectItem>
                <SelectItem value="TIMESTAMP" className="text-[11px]">Full Timestamp</SelectItem>
                <SelectItem value="TIME" className="text-[11px]">Time Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date-format-preset">Format Preset</Label>
            <Select
              value={presets.includes(config.dateFormat ?? '') ? config.dateFormat : 'custom'}
              onValueChange={(val: string) => {
                if (val !== 'custom') {
                  onChange({ dateFormat: val });
                }
              }}
            >
              <SelectTrigger id="date-format-preset" className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]">
                <SelectValue placeholder="Select preset" />
              </SelectTrigger>
              <SelectContent className="bg-[var(--c-bg2)] border-[var(--c-br1)]">
                {presets.map(p => (
                  <SelectItem key={p} value={p} className="text-[11px] font-mono">{p}</SelectItem>
                ))}
                <SelectItem value="custom" className="text-[11px]">Custom...</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="date-format" className="flex justify-between">
            <span>Custom Format</span>
            <span className="text-[9px] text-[var(--c-tx4)] font-normal uppercase tracking-wider">Java DateTimeFormatter</span>
          </Label>
          <Input
            id="date-format"
            type="text"
            placeholder="e.g. yyyy-MM-dd'T'HH:mm:ss.SSSZ"
            value={config.dateFormat ?? ''}
            onChange={(e) => onChange({ dateFormat: e.target.value })}
            className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px] font-mono"
          />
          <p className="text-[9px] text-[var(--c-tx4)] opacity-70">
            Standard Java DateTimeFormatter pattern. Use 'UNIX_TIMESTAMP' for epoch milliseconds.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="date-timezone">Time Zone</Label>
          <Input
            id="date-timezone"
            type="text"
            placeholder="e.g. UTC, Europe/Madrid, Offset-05:00"
            value={config.timeZone ?? ''}
            onChange={(e) => onChange({ timeZone: e.target.value })}
            className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
          />
        </div>
      </div>
    </div>
  );
};
