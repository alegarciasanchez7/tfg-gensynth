import { useState } from 'react';
import { Plus, ChevronUp } from 'lucide-react';
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

const scopeLabels: Record<VariableScope, string> = {
  local: 'LOCAL',
  group: 'GROUP',
  global: 'GLOBAL',
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
  const { actions } = useApp();
  const [activeScope, setActiveScope] = useState<VariableScope>('local');
  const [showAdd, setShowAdd] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createState, setCreateState] = useState({
    name: '',
    type: 'numeric' as const,
    scope: activeScope,
    description: '',
    configText: '{\n  "min": 0,\n  "max": 100,\n  "step": 1\n}',
  });
  const [deleteVariable, setDeleteVariable] = useState<Variable | null>(null);

  const isFlowSelected = selection.type === 'flow';
  const filteredVars = variables.filter(v => v.scope === activeScope);
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
      );
      
      toast.success('Variable created');
      setCreateDialogOpen(false);
      setCreateState({
        name: '',
        type: 'numeric',
        scope: activeScope,
        description: '',
        configText: '{\n  "min": 0,\n  "max": 100,\n  "step": 1\n}',
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
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--c-br2)] shrink-0">
        <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          Variables
        </span>
        {isFlowSelected && (
          <span className="text-[9px] text-cyan-500 bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.5 rounded" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            click → to insert
          </span>
        )}
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

      {/* Add variable button */}
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
          <span className="flex items-center gap-1.5">
            <Plus size={11} /> add variable
          </span>
          <ChevronUp size={10} className={`transition-transform ${showAdd ? 'rotate-180' : ''}`} />
        </button>

        {showAdd && (
          <div className="absolute right-0 bottom-full mb-1 z-50 bg-[var(--c-bg8)] border border-[var(--c-br1)] rounded shadow-xl shadow-black/20 min-w-40 py-1">
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
                  });
                  setCreateDialogOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--c-bg5)] transition-colors text-[11px] text-[var(--c-tx3)]"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              >
                {type}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateVariableDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        activeScope={activeScope}
        scopeLabel={createScopeLabel}
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
