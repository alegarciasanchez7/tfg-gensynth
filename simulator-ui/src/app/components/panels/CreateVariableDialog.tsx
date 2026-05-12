import type { FormEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import type { Group, VariableScope, VariableType } from '../../types';

interface CreateVariableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeScope: VariableScope;
  scopeLabel: string;
  groups: Group[];
  state: {
    name: string;
    type: VariableType;
    scope: VariableScope;
    description: string;
    configText: string;
    flowId?: string;
    groupId?: string;
  };
  onStateChange: (updates: Partial<CreateVariableDialogProps['state']>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

const varTypes: VariableType[] = ['numeric', 'list', 'string', 'temporal', 'point', 'boolean'];
const scopes: VariableScope[] = ['local', 'group', 'global'];

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

export function CreateVariableDialog({
  open,
  onOpenChange,
  scopeLabel,
  groups,
  state,
  onStateChange,
  onSubmit,
}: CreateVariableDialogProps) {
  // Flatten flows with group name for the selector
  const allFlows = groups.flatMap(g => 
    g.flows.map(f => ({
      id: f.id,
      name: f.name,
      groupName: g.name,
      groupId: g.id
    }))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[var(--c-bg2)] border-[var(--c-br1)] text-[var(--c-tx2)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--c-tx1)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            Create Variable
          </DialogTitle>
          <DialogDescription className="text-[var(--c-tx4)]">
            Add a new variable for the {scopeLabel} scope.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-3" onSubmit={onSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Name
              <Input
                value={state.name}
                onChange={(event) => onStateChange({ name: event.target.value })}
                placeholder="temperature"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Type
              <Select
                value={state.type}
                onValueChange={(value) => onStateChange({
                  type: value as VariableType,
                  configText: defaultConfigTextForType(value as VariableType),
                })}
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
                value={state.scope}
                onValueChange={(value) => onStateChange({ 
                  scope: value as VariableScope,
                  // Clear or reset IDs when scope changes
                  flowId: value === 'local' ? (state.flowId || allFlows[0]?.id) : undefined,
                  groupId: value === 'group' ? (state.groupId || groups[0]?.id) : undefined,
                })}
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
                value={state.description}
                onChange={(event) => onStateChange({ description: event.target.value })}
                placeholder="Optional note"
              />
            </label>
          </div>

          {/* Context selectors based on scope */}
          {state.scope === 'local' && (
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Target Flow
              <Select
                value={state.flowId}
                onValueChange={(value) => onStateChange({ flowId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select flow" />
                </SelectTrigger>
                <SelectContent>
                  {allFlows.map((flow) => (
                    <SelectItem key={flow.id} value={flow.id}>
                      {flow.groupName} - {flow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}

          {state.scope === 'group' && (
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Target Group
              <Select
                value={state.groupId}
                onValueChange={(value) => onStateChange({ groupId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}

          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            Config JSON
            <Textarea
              value={state.configText}
              onChange={(event) => onStateChange({ configText: event.target.value })}
              rows={6}
              className="font-mono text-[11px]"
            />
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
