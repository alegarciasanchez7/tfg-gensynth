import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Plus,
  Hash,
  List,
  Type,
  ToggleLeft,
  Clock,
  MapPin,
  CornerDownRight,
  Trash2,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useApp } from '../context';
import type { Variable, VariableScope, VariableType, Selection } from '../types';

interface RightPanelProps {
  variables: Variable[];
  selection: Selection;
  onSelectVariable: (id: string) => void;
  onInsertVariable: (name: string, scope: VariableScope) => void;
}

type VariableFormState = {
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

function parseConfig(configText: string): Record<string, unknown> {
  if (!configText.trim()) {
    return {};
  }

  const parsed = JSON.parse(configText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Config must be a JSON object');
  }

  return parsed as Record<string, unknown>;
}

function VariableItem({ variable, isSelected, isFlowSelected, onDelete, onSelect, onInsert }: {
  variable: Variable;
  isSelected: boolean;
  isFlowSelected: boolean;
  onDelete: () => void;
  onSelect: () => void;
  onInsert: () => void;
}) {
  const tc = typeConfig[variable.type];
  const sc = scopeColors[variable.scope];
  const description = variable.description ?? (typeof variable.config.description === 'string' ? variable.config.description : '');

  return (
    <div
      className={`flex items-center gap-0 border-l-2 transition-all cursor-pointer ${
        isSelected
          ? `${sc.border} bg-[var(--c-bg7)]`
          : 'border-l-transparent hover:bg-[var(--c-bg5)] hover:border-l-[var(--c-br3)]'
      }`}
    >
      <button
        onClick={onSelect}
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
        {description && (
          <span className="text-[10px] text-[var(--c-tx4)] truncate pl-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {description}
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

function AddVariableDropdown({ onSelectType }: { onSelectType: (type: VariableType) => void }) {
  return (
    // ↑ Opens ABOVE the button
    <div className="absolute right-0 bottom-full mb-1 z-50 bg-[var(--c-bg8)] border border-[var(--c-br1)] rounded shadow-xl shadow-black/20 min-w-40 py-1">
      {varTypes.map(type => {
        const tc = typeConfig[type];
        return (
          <button
            key={type}
            onClick={() => onSelectType(type)}
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
  const { actions } = useApp();
  const [activeScope, setActiveScope] = useState<VariableScope>('local');
  const [showAdd, setShowAdd] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createState, setCreateState] = useState<VariableFormState>({
    name: '',
    type: 'numeric',
    scope: activeScope,
    description: '',
    configText: defaultConfigTextForType('numeric'),
  });
  const [deleteVariable, setDeleteVariable] = useState<Variable | null>(null);

  const isFlowSelected = selection.type === 'flow';
  const filteredVars = variables.filter(v => v.scope === activeScope);
  const scopes: VariableScope[] = ['local', 'group', 'global'];

  const createScopeLabel = useMemo(() => scopeLabels[createState.scope], [createState.scope]);

  useEffect(() => {
    setCreateState((current) => ({
      ...current,
      scope: activeScope,
    }));
  }, [activeScope]);

  useEffect(() => {
    if (!createDialogOpen) {
      setCreateState({
        name: '',
        type: 'numeric',
        scope: activeScope,
        description: '',
        configText: defaultConfigTextForType('numeric'),
      });
    }
  }, [activeScope, createDialogOpen]);

  const openCreateDialog = (type: VariableType) => {
    setShowAdd(false);
    setCreateState({
      name: '',
      type,
      scope: activeScope,
      description: '',
      configText: defaultConfigTextForType(type),
    });
    setCreateDialogOpen(true);
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const config = parseConfig(createState.configText);
      await actions.createVariable(
        createState.name,
        createState.type,
        createState.scope,
        {
          ...config,
          ...(createState.description.trim() ? { description: createState.description.trim() } : {}),
        },
      );
      toast.success('Variable created');
      setCreateDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create variable';
      toast.error(message);
    }
  };

  const handleDeleteVariable = async () => {
    if (!deleteVariable) {
      return;
    }

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
        {showAdd && <AddVariableDropdown onSelectType={openCreateDialog} />}
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

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-[var(--c-bg2)] border-[var(--c-br1)] text-[var(--c-tx2)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--c-tx1)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Create Variable
            </DialogTitle>
            <DialogDescription className="text-[var(--c-tx4)]">
              Add a new variable for the {createScopeLabel} scope.
            </DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-3" onSubmit={handleCreateSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                Name
                <Input
                  value={createState.name}
                  onChange={(event) => setCreateState((current) => ({ ...current, name: event.target.value }))}
                  placeholder="temperature"
                />
              </label>
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                Type
                <Select
                  value={createState.type}
                  onValueChange={(value) => setCreateState((current) => ({ ...current, type: value as VariableType, configText: defaultConfigTextForType(value as VariableType) }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {varTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                Scope
                <Select
                  value={createState.scope}
                  onValueChange={(value) => setCreateState((current) => ({ ...current, scope: value as VariableScope }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    {scopes.map((scope) => (
                      <SelectItem key={scope} value={scope}>{scopeLabels[scope]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                Description
                <Input
                  value={createState.description}
                  onChange={(event) => setCreateState((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Optional note"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Config JSON
              <Textarea
                value={createState.configText}
                onChange={(event) => setCreateState((current) => ({ ...current, configText: event.target.value }))}
                rows={8}
                className="font-mono text-[11px]"
              />
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-[var(--c-bg2)] border-[var(--c-br1)] text-[var(--c-tx2)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[var(--c-tx1)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Delete variable
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--c-tx4)]">
              {deleteVariable ? `Delete "${deleteVariable.name}"? This action cannot be undone.` : 'Delete this variable? This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteVariable(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVariable}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
