import { useEffect, useState } from 'react';
import { AlertTriangle, Gauge, Info, Loader2, Timer, Zap } from 'lucide-react';
import { useApp } from '../../../../context';
import type { TickMode, TickSettings, TickUnit } from '../../../../types';
import {
  TICK_MAX_VALUE_BY_UNIT,
  TICK_UNITS,
  TICK_UNIT_LABELS,
  describeTickSettings,
  formatTickRate,
  tickSettingsEqual,
  validateTickSettings,
} from '../../../../core/tickSettings';
import { RadioGroup, RadioGroupItem } from '../../../ui/radio-group';
import { Input } from '../../../ui/input';

const MODE_OPTIONS: { mode: TickMode; title: string; description: string; icon: typeof Timer }[] = [
  {
    mode: 'FIXED_RATE',
    title: 'Fixed period',
    description: 'One tick every N milliseconds, seconds or minutes.',
    icon: Timer,
  },
  {
    mode: 'AS_FAST_AS_POSSIBLE',
    title: 'As Fast As You Can',
    description: 'Next tick as soon as the previous one finishes, with no wait.',
    icon: Zap,
  },
];

/**
 * Simulation settings: the global tick clock that drives message generation.
 * Saved with the project and applied live, even while the simulation is running.
 */
export function TickSettingsSection() {
  const { state, actions } = useApp();
  const { tick } = state.settings;
  const [valueDraft, setValueDraft] = useState(String(tick.value));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setValueDraft(String(tick.value));
    setError(null);
  }, [tick.value]);

  const apply = async (next: TickSettings) => {
    const validationError = validateTickSettings(next);
    setError(validationError);
    if (validationError || tickSettingsEqual(next, tick)) return;

    setPending(true);
    try {
      await actions.updateTickSettings(next);
    } catch {
      // Already reported and rolled back by the action
    } finally {
      setPending(false);
    }
  };

  const draftValue = () => (valueDraft.trim() === '' ? Number.NaN : Number(valueDraft));
  const commitValue = () => apply({ ...tick, value: draftValue() });

  const isRunning = state.systemStatus === 'running';
  const measuredRate = state.metrics?.ticksPerSecond ?? 0;
  const isFixed = tick.mode === 'FIXED_RATE';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[10px] text-[var(--c-tx3)]">
        <Info size={12} className="text-cyan-400 shrink-0 mt-px" />
        <span>
          On every tick, each enabled flow of a running group publishes its <strong className="text-[var(--c-tx1)]">burst</strong>.
          Changes are applied live, without stopping the simulation.
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase">Tick mode</span>
        <RadioGroup
          aria-label="Tick mode"
          value={tick.mode}
          onValueChange={(mode) => apply({ ...tick, mode: mode as TickMode })}
          className="grid grid-cols-1 sm:grid-cols-2 gap-2"
        >
          {MODE_OPTIONS.map(({ mode, title, description, icon: Icon }) => {
            const selected = tick.mode === mode;
            return (
              <label
                key={mode}
                htmlFor={`tick-mode-${mode}`}
                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                  selected
                    ? 'border-cyan-500/60 bg-cyan-500/10'
                    : 'border-[var(--c-br2)] bg-[var(--c-bg1)] hover:bg-cyan-500/5'
                }`}
              >
                <RadioGroupItem
                  id={`tick-mode-${mode}`}
                  value={mode}
                  aria-label={title}
                  className="mt-0.5 border-[var(--c-br3)] data-[state=checked]:border-cyan-500"
                />
                <span className="flex flex-col gap-0.5">
                  <span className={`flex items-center gap-1.5 text-[11px] font-medium ${selected ? 'text-cyan-400' : 'text-[var(--c-tx1)]'}`}>
                    <Icon size={12} />
                    {title}
                  </span>
                  <span className="text-[10px] text-[var(--c-tx4)]">{description}</span>
                </span>
              </label>
            );
          })}
        </RadioGroup>
      </div>

      {isFixed ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="tick-period-value" className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase">
            Tick period
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="tick-period-value"
              type="number"
              aria-label="Tick period value"
              aria-invalid={error !== null}
              min={1}
              max={TICK_MAX_VALUE_BY_UNIT[tick.unit]}
              step={1}
              value={valueDraft}
              onChange={(e) => setValueDraft(e.target.value)}
              onBlur={commitValue}
              onKeyDown={(e) => { if (e.key === 'Enter') void commitValue(); }}
              className="h-8 w-32 px-2 text-[11px] md:text-[11px] text-right bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx1)]"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
            <select
              aria-label="Tick period unit"
              value={tick.unit}
              onChange={(e) => apply({ ...tick, value: draftValue(), unit: e.target.value as TickUnit })}
              className="h-8 rounded-md border border-[var(--c-br1)] bg-[var(--c-bg1)] px-2 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              {TICK_UNITS.map((unit) => (
                <option key={unit} value={unit}>{TICK_UNIT_LABELS[unit]}</option>
              ))}
            </select>
            {pending && <Loader2 size={13} className="animate-spin text-cyan-400" aria-label="Applying" />}
          </div>
          {error && <span role="alert" className="text-[10px] text-red-400">{error}</span>}
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-400">
          <AlertTriangle size={12} className="shrink-0 mt-px" />
          <span>No pause between ticks: while the simulation runs it may keep a CPU core busy. Use it to measure the maximum throughput.</span>
          {pending && <Loader2 size={13} className="animate-spin shrink-0" aria-label="Applying" />}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--c-br2)] bg-[var(--c-bg1)] px-3 py-2.5">
        <span className="flex items-center gap-2 text-[11px] text-[var(--c-tx2)]">
          <Gauge size={12} className="text-fuchsia-400" />
          <span data-testid="tick-summary">{describeTickSettings(tick)}</span>
        </span>
        <span className="text-[10px] text-[var(--c-tx4)]">
          {isRunning ? `Measured: ${formatTickRate(measuredRate)} ticks/s` : 'Measured rate shown while running'}
        </span>
      </div>
    </div>
  );
}
