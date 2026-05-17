import { useState, useEffect } from 'react';
import { Plus, ChevronDown, Binary, ListChecks, ALargeSmall, CalendarClock, MapPin, ToggleLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../../../../context';
import type { Variable, VariableScope, VariableType, Selection } from '../../../../types';
import { CreateVariableDialog } from '../../../panels/CreateVariableDialog';
import { DeleteVariableDialog } from '../../../panels/DeleteVariableDialog';
import { VariableListItem } from '../../../panels/VariableListItem';

interface RightPanelProps {
  variables: Variable[];
  selection: Selection;
  onSelectVariable: (id: string) => void;
  onInsertVariable: (name: string, scope: VariableScope) => void;
}

type CreateState = {
  name: string;
  type: VariableType;
  scope: VariableScope;
  description: string;
  configText: string;
  flowId?: string;
  groupId?: string;
};

const scopeLabels: Record<VariableScope, string> = {
  local: 'LOCAL',
  group: 'GROUP',
  global: 'GLOBAL',
};

const typeInfo: Record<VariableType, { icon: any; color: string }> = {
  numeric: { icon: Binary, color: 'text-cyan-500' },
  list: { icon: ListChecks, color: 'text-violet-500' },
  string: { icon: ALargeSmall, color: 'text-emerald-500' },
  temporal: { icon: CalendarClock, color: 'text-purple-500' },
  point: { icon: MapPin, color: 'text-teal-500' },
  boolean: { icon: ToggleLeft, color: 'text-pink-500' },
};

export function RightPanel({ variables, selection, onSelectVariable, onInsertVariable }: RightPanelProps) {
  const { state, actions } = useApp();
  const [activeScope, setActiveScope] = useState<VariableScope>('global');
  const [showAdd, setShowAdd] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createState, setCreateState] = useState<CreateState>({
    name: '',
    type: 'numeric',
    scope: activeScope,
    description: '',
    configText: JSON.stringify({ min: 0, max: 100 }, null, 2),
    flowId: selection.flowId,
    groupId: selection.groupId,
  });
  const [deleteVariable, setDeleteVariable] = useState<Variable | null>(null);

  const isFlowSelected = selection.type === 'flow';
  const isGroupSelected = selection.type === 'group';

  // Auto-switch scope based on selection
  useEffect(() => {
    if (isFlowSelected) {
      setActiveScope('local');
    } else if (isGroupSelected) {
      setActiveScope('group');
    }
  }, [selection.type, isFlowSelected, isGroupSelected]);

  // Update createState scope when activeScope changes
  useEffect(() => {
    setCreateState(prev => ({ 
      ...prev, 
      scope: activeScope,
      flowId: activeScope === 'local' ? selection.flowId : undefined,
      groupId: activeScope === 'group' ? selection.groupId : undefined
    }));
  }, [activeScope, selection.flowId, selection.groupId]);

  const handleCreateSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const configText = createState.configText.trim();
      const config = configText ? JSON.parse(configText) : {};
      
      await actions.createVariable(
        createState.name.trim(),
        createState.type,
        createState.scope,
        {
          ...config,
          ...(createState.description.trim() ? { description: createState.description.trim() } : {}),
        },
        createState.flowId,
        createState.groupId,
      );
      
      toast.success('Variable created');
      setCreateDialogOpen(false);
      setCreateState({
        name: '',
        type: createState.type,
        scope: activeScope,
        description: '',
        configText: JSON.stringify({ min: 0, max: 100 }, null, 2),
        flowId: selection.flowId,
        groupId: selection.groupId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create variable';
      toast.error(message);
    }
  };

  const handleDeleteVariable = async () => {
    if (!deleteVariable) return;

    try {
      await actions.deleteVariable(deleteVariable.id);
      if (selection.variableId === deleteVariable.id) {
        actions.clearVariableSelection();
      }
      toast.success('Variable deleted');
      setDeleteDialogOpen(false);
      setDeleteVariable(null);
    } catch {
      toast.error('Unable to delete variable');
    }
  };

  const scopes: VariableScope[] = ['local', 'group', 'global'];

  const filteredVars = variables.filter(v => {
    if (v.scope !== activeScope) return false;
    
    if (activeScope === 'local') {
      if (isFlowSelected) return v.flowId === selection.flowId;
      if (selection.groupId) {
        const groupFlowIds = state.groups.find(g => g.id === selection.groupId)?.flows.map(f => f.id) || [];
        return v.flowId && groupFlowIds.includes(v.flowId);
      }
    }
    
    if (activeScope === 'group' && selection.groupId) {
      return v.groupId === selection.groupId;
    }
    
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg8)] border-l border-[var(--c-br2)] w-64 shadow-2xl z-20">
      {/* Header */}
      <div className="p-3 border-b border-[var(--c-br2)] bg-[var(--c-bg2)]/50">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--c-tx3)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            Variable Engine
          </h2>
          <div className="relative">
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="flex items-center gap-1.5 px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[10px] font-bold transition-all shadow-lg shadow-cyan-500/10"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              <Plus size={12} /> ADD
              <ChevronDown size={10} className={`transition-transform duration-200 ${showAdd ? 'rotate-180' : ''}`} />
            </button>

            {showAdd && (
              <div className="absolute right-0 top-full mt-1.5 z-50 bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-2xl py-1 min-w-36 animate-in fade-in zoom-in-95 duration-150">
                {(Object.entries(typeInfo) as [VariableType, typeof typeInfo['numeric']][]).map(([type, info]) => {
                  const Icon = info.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        setCreateState(prev => ({ ...prev, type }));
                        setCreateDialogOpen(true);
                        setShowAdd(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[10px] text-[var(--c-tx2)] hover:bg-cyan-500/10 hover:text-cyan-400 transition-colors"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    >
                      <Icon size={12} className={info.color} />
                      <span className="capitalize">{type}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scope tabs */}
      <div className="flex border-b border-[var(--c-br2)] shrink-0 bg-[var(--c-bg2)]/30">
        {scopes.map(scope => (
          <button
            key={scope}
            onClick={() => setActiveScope(scope)}
            className={`flex-1 py-2 text-[10px] tracking-widest border-b-2 transition-all ${
              scope === activeScope
                ? 'text-cyan-500 border-cyan-500 bg-cyan-500/5'
                : 'text-[var(--c-tx4)] border-transparent hover:text-[var(--c-tx2)]'
            }`}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {scopeLabels[scope]}
          </button>
        ))}
      </div>

      {/* Variables list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredVars.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-[var(--c-tx4)] px-4 text-center">
            <span className="text-[9px] uppercase tracking-tighter opacity-50 mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Void Space
            </span>
            <span className="text-[10px] italic">
              No variables found in {activeScope} scope
            </span>
          </div>
        ) : (
          filteredVars.map(v => (
            <VariableListItem
              key={v.id}
              variable={v}
              isSelected={selection.variableId === v.id}
              isFlowSelected={isFlowSelected}
              onSelect={() => onSelectVariable(v.id)}
              onDelete={() => {
                setDeleteVariable(v);
                setDeleteDialogOpen(true);
              }}
              onInsert={() => onInsertVariable(v.name, v.scope)}
            />
          ))
        )}
      </div>

      {/* Dialogs */}
      <CreateVariableDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        activeScope={activeScope}
        groups={state.groups}
        state={createState}
        onStateChange={(updates) => setCreateState(prev => ({ ...prev, ...updates }))}
        onSubmit={handleCreateSubmit}
      />

      <DeleteVariableDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        variable={deleteVariable}
        onDelete={handleDeleteVariable}
      />
    </div>
  );
}
