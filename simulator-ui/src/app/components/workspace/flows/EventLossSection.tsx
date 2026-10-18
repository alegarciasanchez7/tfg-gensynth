import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Flow } from '../../../types';
import { FieldRow } from '../../common/FieldRow';
import { SectionLabel } from '../../common/SectionLabel';

/** Event loss fields of a flow that the section can change. */
export type EventLossPatch = Partial<Pick<Flow, 'lossPercent' | 'outageEveryTicks' | 'outageDurationTicks'>>;

interface EventLossSectionProps {
  /** Percentage (0-100) of generated messages lost at random. */
  lossPercent: number;
  /** Outage cycle length in ticks (0 = no outages). */
  outageEveryTicks: number;
  /** Ticks lost at the end of every outage cycle (0 = no outages). */
  outageDurationTicks: number;
  /** Called with the changed field once a valid value is committed. */
  onChange: (patch: EventLossPatch) => void;
}

const INPUT_CLASS =
  'bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full';

/** Parses a loss percentage: any finite number, clamped to [0, 100]; null if not a number. */
function parseLossPercent(raw: string): number | null {
  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (trimmed === '' || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
}

/** Parses a tick count: any finite number, rounded and clamped to >= 0; null if not a number. */
function parseTickCount(raw: string): number | null {
  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (trimmed === '' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

/**
 * Numeric input that keeps its own text draft and commits on blur or Enter, so intermediate
 * text never reaches the Core. Invalid text reverts to the current value; valid text is
 * normalized (clamped) and only reported when the value changes.
 */
function CommitNumberInput({
  value,
  parse,
  onCommit,
  ariaLabel,
  inputMode,
}: {
  value: number;
  parse: (raw: string) => number | null;
  onCommit: (next: number) => void;
  ariaLabel: string;
  inputMode: 'decimal' | 'numeric';
}) {
  const [draft, setDraft] = useState(String(value));
  const [shownValue, setShownValue] = useState(value);
  // A new value from the Core (another edit, discard, file load) replaces the draft
  if (shownValue !== value) {
    setShownValue(value);
    setDraft(String(value));
  }

  const commit = () => {
    const next = parse(draft);
    if (next === null) {
      setDraft(String(value));
      return;
    }
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="text"
      inputMode={inputMode}
      aria-label={ariaLabel}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className={INPUT_CLASS}
      style={{ fontFamily: 'JetBrains Mono, monospace' }}
    />
  );
}

/**
 * "Event loss" section of a flow: a random loss percentage plus periodic outages.
 * Lost messages are still generated (they consume {{n}} and local generators) but never sent.
 */
export function EventLossSection({ lossPercent, outageEveryTicks, outageDurationTicks, onChange }: EventLossSectionProps) {
  const losesEverything = outageEveryTicks > 0 && outageDurationTicks >= outageEveryTicks;

  return (
    <div className="flex flex-col gap-2" data-testid="event-loss-section">
      <SectionLabel>EVENT LOSS</SectionLabel>
      <span className="text-[9px] text-[var(--c-tx4)]">
        Lost messages are generated (they use {'{{n}}'}) but never sent · counted as dropped
      </span>
      <FieldRow label="Random loss (%)" description="Share of generated messages lost at random · 0 = off">
        <CommitNumberInput
          value={lossPercent}
          parse={parseLossPercent}
          onCommit={(next) => onChange({ lossPercent: next })}
          ariaLabel="Random loss (%)"
          inputMode="decimal"
        />
      </FieldRow>
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Outage every N ticks" description="Length of the outage cycle · 0 = off">
          <CommitNumberInput
            value={outageEveryTicks}
            parse={parseTickCount}
            onCommit={(next) => onChange({ outageEveryTicks: next })}
            ariaLabel="Outage every N ticks"
            inputMode="numeric"
          />
        </FieldRow>
        <FieldRow label="Outage length (ticks)" description="Last ticks of each cycle that lose every message">
          <CommitNumberInput
            value={outageDurationTicks}
            parse={parseTickCount}
            onCommit={(next) => onChange({ outageDurationTicks: next })}
            ariaLabel="Outage length (ticks)"
            inputMode="numeric"
          />
        </FieldRow>
      </div>
      {losesEverything && (
        <div
          role="status"
          className="flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-500"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          <AlertTriangle size={10} /> Outage length ≥ outage every N ticks: every message of the flow is lost
        </div>
      )}
    </div>
  );
}
