import { useMemo } from 'react';
import { Info } from 'lucide-react';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { INDEX_TOKEN, NAME_TOKEN, buildPatternNames } from '../../core/namingPattern';

/** Number of names shown in the live preview. */
const PREVIEW_COUNT = 3;

interface NamingPatternFieldsProps {
  count: string;
  onCountChange: (value: string) => void;
  pattern: string;
  onPatternChange: (value: string) => void;
  /** Value of `${name}` in the preview. */
  itemName: string;
  countLabel: string;
  /** Noun used in the "... and N more" line (e.g. "copies", "flows"). */
  itemsNoun: string;
  /** Called when Enter is pressed in the pattern input. */
  onSubmit?: () => void;
}

/**
 * Quantity + naming pattern inputs with `${name}` / `${index}` shortcuts and a live preview.
 * Shared by the Clone dialog and the Repeater (create N flows).
 */
export function NamingPatternFields({
  count,
  onCountChange,
  pattern,
  onPatternChange,
  itemName,
  countLabel,
  itemsNoun,
  onSubmit,
}: NamingPatternFieldsProps) {
  const total = parseInt(count, 10);
  const previews = useMemo(
    () => (Number.isNaN(total) || total <= 0 ? [] : buildPatternNames(pattern, itemName, Math.min(total, PREVIEW_COUNT))),
    [total, pattern, itemName],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="naming-pattern-count" className="text-xs text-[var(--c-tx3)] font-mono uppercase tracking-wider">
          {countLabel}
        </label>
        <Input
          id="naming-pattern-count"
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => onCountChange(e.target.value)}
          className="bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx1)] focus:ring-violet-500"
        />
        <p className="text-[10px] text-[var(--c-tx4)] flex items-center gap-1">
          <Info size={10} /> Max recommended: 50 to ensure system stability.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="naming-pattern-input" className="text-xs text-[var(--c-tx3)] font-mono uppercase tracking-wider">
          Naming Pattern
        </label>
        <Input
          id="naming-pattern-input"
          value={pattern}
          onChange={(e) => onPatternChange(e.target.value)}
          placeholder={`${NAME_TOKEN} ${INDEX_TOKEN}`}
          className="bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx1)] font-mono text-sm focus:ring-violet-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onSubmit) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <div className="flex gap-2 pt-1">
          {[NAME_TOKEN, INDEX_TOKEN].map((token) => (
            <Badge
              key={token}
              variant="outline"
              className="cursor-pointer hover:bg-violet-500/10 border-dashed border-violet-500/30 text-violet-600 dark:text-violet-400 text-[10px]"
              onClick={() => onPatternChange(pattern + token)}
            >
              + {token}
            </Badge>
          ))}
        </div>
      </div>

      {previews.length > 0 && (
        <div className="p-3 bg-[var(--c-bg1)] rounded-lg border border-[var(--c-br1)] space-y-1.5">
          <span className="text-[10px] text-[var(--c-tx4)] font-mono uppercase tracking-widest">Live Preview</span>
          <div className="space-y-1">
            {previews.map((name, i) => (
              <div key={i} className="text-xs text-[var(--c-tx2)] font-mono flex items-center gap-2">
                <span className="w-4 h-4 flex items-center justify-center bg-violet-500/10 text-violet-500 rounded text-[9px]">{i + 1}</span>
                {name}
              </div>
            ))}
            {total > PREVIEW_COUNT && (
              <div className="text-[10px] text-[var(--c-tx4)] italic pl-6">
                ... and {total - PREVIEW_COUNT} more {itemsNoun}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
