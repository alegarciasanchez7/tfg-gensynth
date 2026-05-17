import { Trash2, Binary, ListChecks, ALargeSmall, CalendarClock, MapPin, ToggleLeft, ArrowUpRight } from 'lucide-react';
import type { Variable } from '../../types';

const typeConfig: Record<string, { icon: any; color: string; bg: string }> = {
  numeric: { icon: Binary, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
  list: { icon: ListChecks, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  string: { icon: ALargeSmall, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  temporal: { icon: CalendarClock, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  point: { icon: MapPin, color: 'text-teal-500', bg: 'bg-teal-500/10' },
  boolean: { icon: ToggleLeft, color: 'text-pink-500', bg: 'bg-pink-500/10' },
};

const scopeColors: Record<string, string> = {
  local: 'bg-sky-500/10 border-sky-500/30 text-sky-500',
  group: 'bg-violet-500/10 border-violet-500/30 text-violet-500',
  global: 'bg-amber-500/10 border-amber-500/30 text-amber-500',
};

interface VariableListItemProps {
  variable: Variable;
  isSelected: boolean;
  isFlowSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onInsert: () => void;
}

export function VariableListItem({
  variable,
  isSelected,
  isFlowSelected,
  onSelect,
  onDelete,
  onInsert,
}: VariableListItemProps) {
  const tc = typeConfig[variable.type] || typeConfig.string;
  const sc = scopeColors[variable.scope];
  const Icon = tc.icon;
  const description = variable.description ?? '';

  return (
    <div
      className={`group flex items-center border-b border-[var(--c-br2)] transition-all hover:bg-[var(--c-bg4)] ${
        isSelected ? 'bg-[var(--c-bg5)] border-l-2 border-l-cyan-500' : 'border-l-2 border-l-transparent'
      }`}
    >
      <button
        onClick={onSelect}
        className="flex-1 flex flex-col gap-0.5 px-3 py-2 text-left min-w-0"
      >
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center h-5 w-5 rounded-sm ${tc.bg} ${tc.color}`}>
            <Icon size={11} />
          </div>
          <span className="text-[11px] font-semibold text-[var(--c-tx1)] truncate" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {variable.name}
          </span>
          <span
            className={`text-[8px] rounded px-1.5 py-0.5 tracking-tighter uppercase font-bold border ${sc}`}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {variable.scope}
          </span>
        </div>
        {description && (
          <span className="text-[10px] text-[var(--c-tx4)] truncate pl-7" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {description}
          </span>
        )}
      </button>

      <div className="flex items-center gap-1 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {isFlowSelected && (
          <button
            onClick={(e) => { e.stopPropagation(); onInsert(); }}
            title="Insert into template"
            className="p-1 rounded text-[var(--c-tx4)] hover:text-emerald-500 hover:bg-emerald-500/10 transition-all"
          >
            <ArrowUpRight size={12} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete variable"
          className="p-1 rounded text-[var(--c-tx4)] hover:text-red-500 hover:bg-red-500/10 transition-all"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
