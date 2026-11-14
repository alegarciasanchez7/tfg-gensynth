import { ChevronRight, Home } from 'lucide-react';
import type { Selection, Group, Variable } from '../../types';

interface WorkspaceBreadcrumbProps {
  selection: Selection;
  groups: Group[];
  variables: Variable[];
  onSelectGroup: (groupId: string) => void;
  onSelectFlow: (groupId: string, flowId: string) => void;
  onClearSelection: () => void;
}

export function WorkspaceBreadcrumb({
  selection,
  groups,
  variables,
  onSelectGroup,
  onSelectFlow,
  onClearSelection,
}: WorkspaceBreadcrumbProps) {
  const findGroup = (id?: string) => groups.find(g => g.id === id);
  const findFlow = (gId?: string, fId?: string) => groups.find(g => g.id === gId)?.flows.find(f => f.id === fId);
  const findVariable = (id?: string) => variables.find(v => v.id === id);

  const renderSegment = (label: string, onClick?: () => void, isLast: boolean = false) => (
    <div className="flex items-center">
      <button
        onClick={onClick}
        disabled={!onClick || isLast}
        className={`text-[10px] tracking-wider transition-colors ${
          onClick && !isLast
            ? 'text-[var(--c-tx4)] hover:text-cyan-400 cursor-pointer'
            : 'text-[var(--c-tx2)] cursor-default'
        }`}
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        {label.toUpperCase()}
      </button>
      {!isLast && <ChevronRight size={10} className="mx-2 text-[var(--c-tx5)] opacity-50" />}
    </div>
  );

  return (
    <div
      className="px-4 py-2 border-b border-[var(--c-br2)] bg-[var(--c-bg2)] shrink-0 flex items-center overflow-x-auto no-scrollbar"
      style={{ height: 32 }}
    >
      <div className="flex items-center gap-1.5 mr-2 text-[var(--c-tx5)]">
        <Home size={10} />
      </div>

      {renderSegment('WORKSPACE', onClearSelection, selection.type === 'none')}

      {selection.groupId && (() => {
        const group = findGroup(selection.groupId);
        if (!group) return null;
        
        const isLast = selection.type === 'group';
        return renderSegment(
          `GROUP · ${group.name}`,
          () => onSelectGroup(group.id),
          isLast
        );
      })()}

      {selection.flowId && selection.groupId && (() => {
        const flow = findFlow(selection.groupId, selection.flowId);
        if (!flow) return null;
        
        const isLast = selection.type === 'flow';
        return renderSegment(
          `FLOW · ${flow.name}`,
          () => onSelectFlow(selection.groupId!, flow.id),
          isLast
        );
      })()}

      {selection.variableId && (() => {
        const variable = findVariable(selection.variableId);
        if (!variable) return null;
        
        return renderSegment(
          `VARIABLE · ${variable.name}`,
          undefined,
          true
        );
      })()}
    </div>
  );
}
