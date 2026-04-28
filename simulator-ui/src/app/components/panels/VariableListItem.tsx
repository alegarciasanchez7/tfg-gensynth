import { Trash2 } from 'lucide-react';
import type { Variable } from '../../types';

const typeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  numeric: { icon: '♯', color: 'text-cyan-500' },
  list: { icon: '∿', color: 'text-violet-500' },
  string: { icon: 'α', color: 'text-emerald-500' },
  temporal: { icon: '⏱', color: 'text-sky-500' },
  point: { icon: '◎', color: 'text-teal-500' },
  boolean: { icon: '⊙', color: 'text-pink-500' },
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
  const tc = typeConfig[variable.type];
  const sc = scopeColors[variable.scope];
  const description = variable.description ?? (typeof variable.config.description === 'string' ? variable.config.description : '');

  return (
    <div
      className={`flex items-center border border-l-4 rounded transition-all ${
        isSelected ? 'bg-[var(--c-bg5)] border-cyan-500/40 border-l-cyan-500' : 'border-[var(--c-br1)]'
      }`}
    >
      <button
        onClick={onSelect}
        className="flex-1 flex flex-col gap-0.5 px-2.5 py-1.5 text-left"
      >
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-semibold ${tc.color}`}>{tc.icon}</span>
          <span
            className={`text-[9px] rounded border px-2 py-0.5 tracking-wider uppercase ${sc}`}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {variable.scope}
          </span>
          <span className="text-[10px] font-medium text-[var(--c-tx1)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {variable.name}
          </span>
        </div>
        {description && (
          <span className="text-[10px] text-[var(--c-tx4)] truncate pl-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {description}
          </span>
        )}
      </button>

      <div className="flex items-center gap-0.5 pr-1.5">
        {isFlowSelected && (
          <button
            onClick={(e) => { e.stopPropagation(); onInsert(); }}
            title="Insert variable"
            className="p-1 rounded text-[var(--c-tx4)] hover:text-emerald-500 hover:bg-emerald-500/10 transition-all"
          >
            ↗
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete variable"
          className="p-1 rounded text-[var(--c-tx4)] hover:text-red-500 hover:bg-red-500/10 transition-all"
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );
}
