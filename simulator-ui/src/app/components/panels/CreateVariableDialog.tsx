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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { CalendarClock, Binary, ListChecks, ALargeSmall, MapPin, ToggleLeft } from 'lucide-react';
import type { Group, VariableScope, VariableType } from '../../types';

interface CreateVariableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeScope: VariableScope;
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

const varTypes: Array<{ type: VariableType; label: string; icon: any }> = [
  { type: 'numeric', label: 'Numeric', icon: Binary },
  { type: 'string', label: 'String', icon: ALargeSmall },
  { type: 'list', label: 'List', icon: ListChecks },
  { type: 'temporal', label: 'Temporal', icon: CalendarClock },
  { type: 'point', label: 'Point', icon: MapPin },
  { type: 'boolean', label: 'Boolean', icon: ToggleLeft },
];

const scopes: VariableScope[] = ['local', 'group', 'global'];

const scopeLabels: Record<VariableScope, string> = {
  local: 'LOCAL',
  group: 'GROUP',
  global: 'GLOBAL',
};

function defaultConfigTextForType(type: VariableType): string {
  switch (type) {
    case 'numeric':
      return JSON.stringify({ min: 0, max: 100, precision: 'DOUBLE', distribution: 'UNIFORM' }, null, 2);
    case 'list':
      return JSON.stringify({ items: [] }, null, 2);
    case 'boolean':
      return JSON.stringify({ currentValue: false }, null, 2);
    case 'temporal':
      return JSON.stringify({ temporalType: 'TIMESTAMP', dateFormat: "yyyy-MM-dd'T'HH:mm:ss.SSSZ" }, null, 2);
    case 'point':
      return JSON.stringify({ maxStepDistance: 10.0 }, null, 2);
    case 'string':
    default:
      return JSON.stringify({ fixedLength: 8 }, null, 2);
  }
}

export function CreateVariableDialog({
  open,
  onOpenChange,
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
      <DialogContent className="sm:max-w-lg bg-[var(--c-bg2)] border-[var(--c-br1)] text-[var(--c-tx2)] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-1 bg-cyan-500 rounded-full" />
            <DialogTitle className="text-lg text-[var(--c-tx1)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              New Variable
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-[var(--c-tx4)] ml-3">
            Variables are the core of data generation. You can configure advanced rules after creation.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-5 mt-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="var-name" className="text-[10px] uppercase tracking-widest text-[var(--c-tx4)] font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                Identification Name
              </label>
              <Input
                id="var-name"
                value={state.name}
                onChange={(event) => onStateChange({ name: event.target.value })}
                placeholder="e.g. temperature_sensor"
                required
                className="bg-[var(--c-bg4)] border-[var(--c-br2)] focus:ring-1 focus:ring-cyan-500/50"
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label htmlFor="var-type" className="text-[10px] uppercase tracking-widest text-[var(--c-tx4)] font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                Base Type
              </label>
              <Select
                value={state.type}
                onValueChange={(value) => onStateChange({
                  type: value as VariableType,
                  configText: defaultConfigTextForType(value as VariableType),
                })}
              >
                <SelectTrigger id="var-type" className="bg-[var(--c-bg4)] border-[var(--c-br2)]">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--c-bg2)] border-[var(--c-br1)]">
                  {varTypes.map(({ type, label, icon: Icon }) => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        <Icon size={14} className="opacity-70" />
                        <span>{label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="var-scope" className="text-[10px] uppercase tracking-widest text-[var(--c-tx4)] font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                Accessibility Scope
              </label>
              <Select
                value={state.scope}
                onValueChange={(value) => onStateChange({ 
                  scope: value as VariableScope,
                  flowId: value === 'local' ? (state.flowId || allFlows[0]?.id) : undefined,
                  groupId: value === 'group' ? (state.groupId || groups[0]?.id) : undefined,
                })}
              >
                <SelectTrigger id="var-scope" className="bg-[var(--c-bg4)] border-[var(--c-br2)] uppercase font-mono text-[11px]">
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--c-bg2)] border-[var(--c-br1)]">
                  {scopes.map((scope) => {
                    const isDisabled = (scope === 'local' && allFlows.length === 0) || 
                                     (scope === 'group' && groups.length === 0);
                    return (
                      <SelectItem 
                        key={scope} 
                        value={scope} 
                        disabled={isDisabled}
                        className="font-mono text-[11px]"
                      >
                        {scopeLabels[scope]}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="var-desc" className="text-[10px] uppercase tracking-widest text-[var(--c-tx4)] font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                Description (Optional)
              </label>
              <Input
                id="var-desc"
                value={state.description}
                onChange={(event) => onStateChange({ description: event.target.value })}
                placeholder="Brief purpose of this variable"
                className="bg-[var(--c-bg4)] border-[var(--c-br2)]"
              />
            </div>
          </div>

          {/* Context selectors based on scope */}
          {(state.scope === 'local' || state.scope === 'group') && (
            <div className="p-3 rounded border border-cyan-500/20 bg-cyan-500/5 animate-in fade-in slide-in-from-top-2 duration-300">
              {state.scope === 'local' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] uppercase tracking-widest text-cyan-500/70 font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Target Flow Assignment
                  </label>
                  <Select
                    value={state.flowId}
                    onValueChange={(value) => onStateChange({ flowId: value })}
                  >
                    <SelectTrigger className="bg-[var(--c-bg4)] border-[var(--c-br2)] h-8 text-xs">
                      <SelectValue placeholder="Select flow" />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--c-bg2)] border-[var(--c-br1)]">
                      {allFlows.map((flow) => (
                        <SelectItem key={flow.id} value={flow.id} className="text-xs">
                          <span className="opacity-50 mr-1">[{flow.groupName}]</span> {flow.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {state.scope === 'group' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] uppercase tracking-widest text-cyan-500/70 font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Target Group Assignment
                  </label>
                  <Select
                    value={state.groupId}
                    onValueChange={(value) => onStateChange({ groupId: value })}
                  >
                    <SelectTrigger className="bg-[var(--c-bg4)] border-[var(--c-br2)] h-8 text-xs">
                      <SelectValue placeholder="Select group" />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--c-bg2)] border-[var(--c-br1)]">
                      {groups.map((group) => (
                        <SelectItem key={group.id} value={group.id} className="text-xs">
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-2 pt-4 border-t border-[var(--c-br1)]">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              className="text-[var(--c-tx4)] hover:text-[var(--c-tx2)]"
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              className="bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/20 px-8"
            >
              Create Variable
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
