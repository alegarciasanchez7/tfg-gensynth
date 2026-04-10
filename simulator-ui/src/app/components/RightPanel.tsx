import { useState } from 'react';
import {
  Plus,
  Hash,
  List,
  Type,
  ToggleLeft,
  Clock,
  MapPin,
  Pencil,
  CornerDownRight,
  ChevronUp,
} from 'lucide-react';
import type { Variable, VariableScope, VariableType, Selection } from '../types';

interface RightPanelProps {
  variables: Variable[];
  selection: Selection;
  onSelectVariable: (id: string) => void;
  onInsertVariable: (name: string, scope: VariableScope) => void;
}

const scopeLabels: Record<VariableScope, string> = {
  local: 'LOCAL',
  group: 'GROUP',
  global: 'GLOBAL',
};

const scopeColors: Record<VariableScope, { tab: string; badge: string; border: string }> = {
  local: {
    tab: 'text-sky-500 border-sky-500',
    badge: 'bg-sky-500/10 border-sky-500/30 text-sky-500',
    border: 'border-l-sky-500',
  },
  group: {
    tab: 'text-violet-500 border-violet-500',
    badge: 'bg-violet-500/10 border-violet-500/30 text-violet-500',
    border: 'border-l-violet-500',
  },
  global: {
    tab: 'text-amber-500 border-amber-500',
    badge: 'bg-amber-500/10 border-amber-500/30 text-amber-500',
    border: 'border-l-amber-500',
  },
};

const typeConfig: Record<VariableType, { icon: React.ReactNode; color: string; label: string }> = {
  numeric:  { icon: <Hash size={10} />,      color: 'text-cyan-500',    label: 'NUM' },
  list:     { icon: <List size={10} />,      color: 'text-violet-500',  label: 'LIST' },
  string:   { icon: <Type size={10} />,      color: 'text-emerald-500', label: 'STR' },
  temporal: { icon: <Clock size={10} />,     color: 'text-sky-500',     label: 'TIME' },
  point:    { icon: <MapPin size={10} />,    color: 'text-teal-500',    label: 'POINT' },
  boolean:  { icon: <ToggleLeft size={10} />, color: 'text-pink-500',   label: 'BOOL' },
};

const varTypes: VariableType[] = ['numeric', 'list', 'string', 'temporal', 'point', 'boolean'];

function VariableItem({ variable, isSelected, isFlowSelected, onEdit, onInsert }: {
  variable: Variable;
  isSelected: boolean;
  isFlowSelected: boolean;
  onEdit: () => void;
  onInsert: () => void;
}) {
  const tc = typeConfig[variable.type];
  const sc = scopeColors[variable.scope];

  return (
    <div
      className={`flex items-center gap-0 border-l-2 transition-all cursor-pointer ${
        isSelected
          ? `${sc.border} bg-[var(--c-bg7)]`
          : 'border-l-transparent hover:bg-[var(--c-bg5)] hover:border-l-[var(--c-br3)]'
      }`}
    >
      <button
        onClick={onEdit}
        className="flex-1 flex flex-col gap-0.5 px-2.5 py-1.5 text-left"
      >
        <div className="flex items-center gap-1.5">
          <span
            className={`flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] border bg-[var(--c-bg1)] ${sc.badge}`}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            <span className={tc.color}>{tc.icon}</span>
            <span className="ml-0.5">{tc.label}</span>
          </span>
          <span
            className={`text-[11px] truncate ${isSelected ? 'text-[var(--c-tx1)]' : 'text-[var(--c-tx2)]'}`}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {variable.name}
          </span>
        </div>
        {variable.description && (
          <span className="text-[10px] text-[var(--c-tx4)] truncate pl-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {variable.description}
          </span>
        )}
      </button>

      <div className="flex items-center gap-0.5 px-1.5 shrink-0">
        {isFlowSelected && (
          <button
            onClick={(e) => { e.stopPropagation(); onInsert(); }}
            title="Insert into format"
            className="p-1 rounded text-[var(--c-tx4)] hover:text-cyan-500 hover:bg-cyan-500/10 transition-all"
          >
            <CornerDownRight size={10} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title="Edit variable"
          className="p-1 rounded text-[var(--c-tx4)] hover:text-violet-500 hover:bg-violet-500/10 transition-all"
        >
          <Pencil size={10} />
        </button>
      </div>
    </div>
  );
}

function AddVariableDropdown({ onClose }: { onClose: () => void }) {
  return (
    // ↑ Opens ABOVE the button
    <div className="absolute right-0 bottom-full mb-1 z-50 bg-[var(--c-bg8)] border border-[var(--c-br1)] rounded shadow-xl shadow-black/20 min-w-40 py-1">
      {varTypes.map(type => {
        const tc = typeConfig[type];
        return (
          <button
            key={type}
            onClick={onClose}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--c-bg5)] transition-colors"
          >
            <span className={tc.color}>{tc.icon}</span>
            <span className="text-[11px] text-[var(--c-tx3)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {type}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function RightPanel({ variables, selection, onSelectVariable, onInsertVariable }: RightPanelProps) {
  const [activeScope, setActiveScope] = useState<VariableScope>('local');
  const [showAdd, setShowAdd] = useState(false);

  const isFlowSelected = selection.type === 'flow';
  const filteredVars = variables.filter(v => v.scope === activeScope);
  const scopes: VariableScope[] = ['local', 'group', 'global'];

  return (
    <div
      className="flex flex-col border-l border-[var(--c-br1)] bg-[var(--c-bg2)] shrink-0 overflow-hidden"
      style={{ width: 260 }}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--c-br2)] shrink-0">
        <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          Variables
        </span>
        {isFlowSelected && (
          <span
            className="text-[9px] text-cyan-500 bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.5 rounded"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            click → to insert
          </span>
        )}
      </div>

      {/* Scope tabs */}
      <div className="flex border-b border-[var(--c-br2)] shrink-0">
        {scopes.map(scope => {
          const sc = scopeColors[scope];
          const isActive = scope === activeScope;
          return (
            <button
              key={scope}
              onClick={() => setActiveScope(scope)}
              className={`flex-1 py-1.5 text-[10px] tracking-wider border-b-2 transition-all ${
                isActive
                  ? `${sc.tab} bg-[var(--c-bg4)]`
                  : 'text-[var(--c-tx4)] border-transparent hover:text-[var(--c-tx2)]'
              }`}
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              {scopeLabels[scope]}
            </button>
          );
        })}
      </div>

      {/* Variables list */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredVars.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-[var(--c-tx4)]">
            <span className="text-[10px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              no variables in {activeScope} scope
            </span>
          </div>
        ) : (
          filteredVars.map(v => (
            <VariableItem
              key={v.id}
              variable={v}
              isSelected={selection.variableId === v.id}
              isFlowSelected={isFlowSelected}
              onEdit={() => onSelectVariable(v.id)}
              onInsert={() => onInsertVariable(v.name, v.scope)}
            />
          ))
        )}
      </div>

      {/* Add variable section — dropdown opens upward */}
      <div className="px-2 py-2 border-t border-[var(--c-br2)] shrink-0 relative">
        <button
          onClick={() => setShowAdd(!showAdd)}
          className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded border text-[11px] transition-all ${
            showAdd
              ? 'border-cyan-500/50 text-cyan-500 bg-cyan-500/10'
              : 'border-[var(--c-br1)] text-[var(--c-tx4)] hover:text-[var(--c-tx2)] hover:border-[var(--c-br3)] hover:bg-[var(--c-bg5)]'
          }`}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          <span className="flex items-center gap-1.5"><Plus size={11} /> add variable</span>
          <ChevronUp size={10} className={`transition-transform ${showAdd ? 'rotate-180' : ''}`} />
        </button>
        {showAdd && <AddVariableDropdown onClose={() => setShowAdd(false)} />}
      </div>

      {/* Legend */}
      <div className="px-3 py-2 border-t border-[var(--c-br2)] shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          {(['local', 'group', 'global'] as VariableScope[]).map(s => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${
                s === 'local' ? 'bg-sky-400' : s === 'group' ? 'bg-violet-400' : 'bg-amber-400'
              }`} />
              <span className="text-[9px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {s}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
