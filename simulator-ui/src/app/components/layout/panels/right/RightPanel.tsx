import { useState, useEffect, useRef } from 'react';
import { Plus, ChevronDown, Binary, ListChecks, ALargeSmall, CalendarClock, MapPin, ToggleLeft, PanelRightClose, PanelRightOpen } from 'lucide-react';
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

const scopeTabColors: Record<VariableScope, string> = {
  local: 'text-sky-400 border-sky-400 bg-sky-500/10',
  group: 'text-violet-400 border-violet-400 bg-violet-500/10',
  global: 'text-amber-400 border-amber-400 bg-amber-500/10',
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
  const [width, setWidth] = useState(264);
  const [collapsed, setCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [activeScope, setActiveScope] = useState<VariableScope>('global');
  const [showAdd, setShowAdd] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const startX = useRef(0);
  const startW = useRef(0);

  const handleMouseDownResizer = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    startW.current = width;
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startX.current - e.clientX;
      const newWidth = Math.max(180, Math.min(500, startW.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

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

  const selectedVariable = selection.variableId
    ? variables.find(v => v.id === selection.variableId)
    : undefined;

  // Determine active flowId & groupId context from selection or selected variable
  const activeFlowId = isFlowSelected
    ? selection.flowId
    : selectedVariable?.scope === 'local'
    ? selectedVariable.flowId
    : undefined;

  const activeGroupId = isGroupSelected
    ? selection.groupId
    : isFlowSelected
    ? selection.groupId || (activeFlowId ? state.groups.find(g => g.flows.some(f => f.id === activeFlowId))?.id : undefined)
    : selectedVariable?.scope === 'group'
    ? selectedVariable.groupId
    : selectedVariable?.scope === 'local' && selectedVariable.flowId
    ? state.groups.find(g => g.flows.some(f => f.id === selectedVariable.flowId))?.id
    : selection.groupId;

  // Auto-switch scope based on selection
  useEffect(() => {
    if (isFlowSelected) {
      setActiveScope('local');
    } else if (isGroupSelected) {
      setActiveScope('group');
    } else if (selection.type === 'variable' && selectedVariable) {
      setActiveScope(selectedVariable.scope);
    }
  }, [selection.type, selection.variableId, isFlowSelected, isGroupSelected, selectedVariable?.scope]);

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
      if (activeFlowId) return v.flowId === activeFlowId;
      if (activeGroupId) {
        const groupFlowIds = state.groups.find(g => g.id === activeGroupId)?.flows.map(f => f.id) || [];
        return v.flowId && groupFlowIds.includes(v.flowId);
      }
    }
    
    if (activeScope === 'group' && activeGroupId) {
      return v.groupId === activeGroupId;
    }
    
    return true;
  });

  const getContextName = (v: Variable): string | undefined => {
    // When inside a flow or group in the workspace, all variables listed are already scoped to that flow/group.
    // Hiding redundant flow/group text gives full width to variable names.
    if (selection.type !== 'none' && (activeFlowId || activeGroupId)) {
      return undefined;
    }

    if (v.scope === 'local' && v.flowId) {
      for (const g of state.groups) {
        const flow = g.flows.find(f => f.id === v.flowId);
        if (flow) return flow.name;
      }
    } else if (v.scope === 'group' && v.groupId) {
      const g = state.groups.find(group => group.id === v.groupId);
      if (g) return g.name;
    }
    return undefined;
  };

  if (collapsed) {
    return (
      <div className="flex flex-col border-l border-[var(--c-br2)] bg-[var(--c-bg8)] shrink-0 z-20">
        <button
          onClick={() => setCollapsed(false)}
          title="Expand Variables"
          className="flex items-center gap-2 px-2 py-3 text-[10px] font-bold text-[var(--c-tx3)] hover:text-cyan-400 hover:bg-[var(--c-bg5)] transition-all tracking-widest uppercase border-b border-[var(--c-br2)]"
          style={{ writingMode: 'vertical-rl', fontFamily: 'JetBrains Mono, monospace' }}
        >
          <PanelRightOpen size={13} className="rotate-90" />
          <span>VARIABLES</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full bg-[var(--c-bg8)] border-l border-[var(--c-br2)] shadow-2xl z-20 shrink-0 relative"
      style={{ width }}
    >
      {/* Header */}
        <div className="p-3 border-b border-[var(--c-br2)] bg-[var(--c-bg2)]/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--c-tx3)] truncate" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                VARIABLES
              </h2>
              <button
                onClick={() => setCollapsed(true)}
                title="Collapse Variables"
                className="p-1 rounded text-[var(--c-tx4)] hover:text-[var(--c-tx1)] hover:bg-[var(--c-bg5)] transition-all shrink-0"
              >
                <PanelRightClose size={13} />
              </button>
            </div>
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
                ? scopeTabColors[scope]
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
              contextName={getContextName(v)}
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
        variablesList={variables}
      />

      <DeleteVariableDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        variable={deleteVariable}
        onDelete={handleDeleteVariable}
      />
      {/* Ultrafine Resizer Handle on Left Edge */}
      <div
        onMouseDown={handleMouseDownResizer}
        className="absolute top-0 bottom-0 -left-1 w-2 cursor-col-resize z-40 group flex justify-center"
        title="Drag to resize width"
      >
        <div
          className={`w-[2px] h-full transition-colors ${
            isResizing ? 'bg-cyan-500' : 'bg-transparent group-hover:bg-cyan-500/60'
          }`}
        />
      </div>

      {isResizing && (
        <div className="fixed inset-0 z-[9999] cursor-col-resize select-none" />
      )}
    </div>
  );
}
