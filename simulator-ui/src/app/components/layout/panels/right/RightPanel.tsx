import { useState } from 'react';
import { Plus, ChevronDown, Hash, List, ToggleLeft, Clock3, LocateFixed, Type } from 'lucide-react';
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
};

const scopeLabels: Record<VariableScope, string> = {
  local: 'LOCAL',
  group: 'GROUP',
  global: 'GLOBAL',
};

const typeIcons: Record<VariableType, React.ReactNode> = {
  numeric: <Hash size={11} />,
  list: <List size={11} />,
  boolean: <ToggleLeft size={11} />,
  temporal: <Clock3 size={11} />,
  point: <LocateFixed size={11} />,
  string: <Type size={11} />,
};

const typeStyles: Record<VariableType, { badge: string; icon: string; hover: string }> = {
  numeric: { badge: 'border-sky-500/20 bg-sky-500/10 text-sky-500', icon: 'text-sky-500', hover: 'hover:bg-sky-500/5' },
  list: { badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500', icon: 'text-emerald-500', hover: 'hover:bg-emerald-500/5' },
  boolean: { badge: 'border-amber-500/20 bg-amber-500/10 text-amber-500', icon: 'text-amber-500', hover: 'hover:bg-amber-500/5' },
  temporal: { badge: 'border-violet-500/20 bg-violet-500/10 text-violet-500', icon: 'text-violet-500', hover: 'hover:bg-violet-500/5' },
  point: { badge: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-500', icon: 'text-cyan-500', hover: 'hover:bg-cyan-500/5' },
  string: { badge: 'border-pink-500/20 bg-pink-500/10 text-pink-500', icon: 'text-pink-500', hover: 'hover:bg-pink-500/5' },
};

function defaultConfigTextForType(type: VariableType): string {
  switch (type) {
    case 'numeric':
      return JSON.stringify({ min: 0, max: 100, step: 1 }, null, 2);
    case 'list':
      return JSON.stringify({ values: [] }, null, 2);
    case 'boolean':
      return JSON.stringify({ value: false }, null, 2);
    case 'temporal':
      return JSON.stringify({ pattern: 'SYSTEM_NOW' }, null, 2);
    case 'point':
      return JSON.stringify({ x: 0, y: 0, z: 0 }, null, 2);
    case 'string':
    default:
      return JSON.stringify({ value: '' }, null, 2);
  }
}

export function RightPanel({ variables, selection, onSelectVariable, onInsertVariable }: RightPanelProps) {
  const { state, actions } = useApp();
  const [activeScope, setActiveScope] = useState<VariableScope>('local');
  const [showAdd, setShowAdd] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createState, setCreateState] = useState<CreateState & { flowId?: string; groupId?: string }>({
    name: '',
    type: 'numeric',
    scope: activeScope,
    description: '',
    configText: '{\n  "min": 0,\n  "max": 100,\n  "step": 1\n}',
    flowId: selection.flowId,
    groupId: selection.groupId,
  });
  const [deleteVariable, setDeleteVariable] = useState<Variable | null>(null);

  const isFlowSelected = selection.type === 'flow';

  // Context-aware filtering
  const filteredVars = variables.filter(v => {
    if (v.scope !== activeScope) return false;
    
    if (activeScope === 'local') {
      // If we have a selected flow, only show variables for THAT flow
      return isFlowSelected ? v.flowId === selection.flowId : true;
    }
    
    if (activeScope === 'group') {
      // If we have a selected group (or flow within a group), only show variables for THAT group
      const targetGroupId = selection.groupId;
      return targetGroupId ? v.groupId === targetGroupId : true;
    }
    
    // Global scope always shows everything
    return true;
  });

  const scopes: VariableScope[] = ['local', 'group', 'global'];
  const createScopeLabel = scopeLabels[createState.scope];

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
        configText: createState.configText,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete variable';
      toast.error(message);
    }
  };

  return (
    <div className="flex flex-col border-l border-[var(--c-br1)] bg-[var(--c-bg2)] shrink-0 overflow-hidden" style={{ width: 260 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--c-br2)] shrink-0 relative gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className="inline-flex items-center rounded border border-[var(--c-br1)] bg-[var(--c-bg1)] px-2 py-1 text-[10px] text-[var(--c-tx4)] tracking-widest uppercase shrink-0"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            Variables
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative shrink-0">
            <button
              onClick={() => setShowAdd(!showAdd)}
              className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 text-[11px] transition-all whitespace-nowrap ${
                showAdd
                  ? 'border-cyan-500/50 text-cyan-500 bg-cyan-500/10'
                  : 'border-[var(--c-br1)] text-[var(--c-tx4)] hover:text-[var(--c-tx2)] hover:border-[var(--c-br3)] hover:bg-[var(--c-bg5)]'
              }`}
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
              aria-label="Add variable"
            >
              <Plus size={11} />
              <span>add</span>
              <ChevronDown size={10} className={`transition-transform ${showAdd ? 'rotate-180' : ''}`} />
            </button>

            {showAdd && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--c-bg8)] border border-[var(--c-br1)] rounded shadow-xl shadow-black/20 min-w-40 py-1">
                {(['numeric', 'list', 'string', 'temporal', 'point', 'boolean'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      setShowAdd(false);
                      setCreateState({
                        name: '',
                        type,
                        scope: activeScope,
                        description: '',
                        configText: defaultConfigTextForType(type),
                        flowId: selection.flowId,
                        groupId: selection.groupId,
                      });
                      setCreateDialogOpen(true);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors text-[11px] text-[var(--c-tx3)] ${typeStyles[type].hover}`}
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${typeStyles[type].badge}`}>
                      <span className={typeStyles[type].icon}>{typeIcons[type]}</span>
                    </span>
                    <span className="capitalize">{type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scope tabs */}
      <div className="flex border-b border-[var(--c-br2)] shrink-0">
        {scopes.map(scope => (
          <button
            key={scope}
            onClick={() => setActiveScope(scope)}
            className={`flex-1 py-1.5 text-[10px] tracking-wider border-b-2 transition-all ${
              scope === activeScope
                ? 'text-cyan-500 border-cyan-500 bg-[var(--c-bg4)]'
                : 'text-[var(--c-tx4)] border-transparent hover:text-[var(--c-tx2)]'
            }`}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {scopeLabels[scope]}
          </button>
        ))}
      </div>

      {/* Variables list */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredVars.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-[var(--c-tx4)]">
            <span className="text-[10px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              no variables in {activeScope} scope
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
        scopeLabel={createScopeLabel}
        groups={state.groups}
        state={createState}
        onStateChange={(updates) => setCreateState((current) => ({ ...current, ...updates }))}
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
