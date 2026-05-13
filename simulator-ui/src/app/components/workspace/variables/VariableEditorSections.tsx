import type { Dispatch, SetStateAction } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import type { Variable } from '../../../types';
import type { VariableDraft } from './useVariableEditor';

export type VariableEditorTheme = {
  icon: LucideIcon;
  description: string;
  accent: string;
  border: string;
};

export type VariableEditorScopeOption = {
  value: Variable['scope'];
  label: string;
};

interface VariableEditorHeaderProps {
  variable: Variable;
  theme: VariableEditorTheme;
  scopeBadgeClass: string;
}

export function VariableEditorHeader({ variable, theme, scopeBadgeClass }: VariableEditorHeaderProps) {
  const Icon = theme.icon;

  return (
    <div className="flex items-start gap-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded border ${theme.border} bg-[var(--c-bg4)]`}>
        <span className={theme.accent}>
          <Icon size={13} />
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm text-[var(--c-tx1)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {variable.name}
          </h2>
          <span
            className={`text-[9px] rounded border px-2 py-0.5 tracking-wider uppercase ${scopeBadgeClass}`}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {variable.scope}
          </span>
          <span
            className={`text-[9px] rounded border border-current/30 bg-current/10 px-2 py-0.5 tracking-wider uppercase ${theme.accent}`}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {variable.type}
          </span>
        </div>
        <p className="text-xs text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {theme.description}
        </p>
      </div>
    </div>
  );
}

interface VariableEditorIdentityCardProps {
  draft: VariableDraft;
  setDraft: Dispatch<SetStateAction<VariableDraft>>;
  scopeOptions: VariableEditorScopeOption[];
  groups: Variable['scope'] extends any ? any[] : any[]; // Simplified for props, but we'll use Group[]
}

export function VariableEditorIdentityCard({ draft, setDraft, scopeOptions, groups }: VariableEditorIdentityCardProps) {
  // Flatten flows with group name for the selector
  const allFlows = (groups || []).flatMap(g => 
    (g.flows || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      groupName: g.name,
      groupId: g.id
    }))
  );

  return (
    <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] p-3">
      <div className="mb-3">
        <span className="text-[10px] uppercase tracking-widest text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          Identity
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="variable-name" className="text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            Name
          </label>
          <Input
            id="variable-name"
            value={draft.name}
            onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="variable-scope" className="text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            Scope
          </label>
          <Select
            value={draft.scope}
            onValueChange={value => {
              const newScope = value as Variable['scope'];
              setDraft(current => ({ 
                ...current, 
                scope: newScope,
                // Automatically pick first valid target if moving TO a scoped level
                flowId: newScope === 'local' ? (allFlows[0]?.id) : undefined,
                groupId: newScope === 'group' ? (groups[0]?.id) : undefined,
              }));
            }}
          >
            <SelectTrigger id="variable-scope">
              <SelectValue placeholder="Select scope" />
            </SelectTrigger>
            <SelectContent>
              {scopeOptions.map(option => {
                const isDisabled = (option.value === 'local' && allFlows.length === 0) || 
                                 (option.value === 'group' && groups.length === 0);
                return (
                  <SelectItem 
                    key={option.value} 
                    value={option.value}
                    disabled={isDisabled}
                  >
                    {option.label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Context selectors based on scope */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {draft.scope === 'local' && (
          <div className="flex flex-col gap-1">
            <label htmlFor="variable-flow" className="text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Target Flow
            </label>
            <Select
              value={draft.flowId}
              onValueChange={value => setDraft(current => ({ ...current, flowId: value }))}
            >
              <SelectTrigger id="variable-flow">
                <SelectValue placeholder="Select flow" />
              </SelectTrigger>
              <SelectContent>
                {allFlows.map(flow => (
                  <SelectItem key={flow.id} value={flow.id}>
                    {flow.groupName} - {flow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {draft.scope === 'group' && (
          <div className="flex flex-col gap-1">
            <label htmlFor="variable-group" className="text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Target Group
            </label>
            <Select
              value={draft.groupId}
              onValueChange={value => setDraft(current => ({ ...current, groupId: value }))}
            >
              <SelectTrigger id="variable-group">
                <SelectValue placeholder="Select group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map(group => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className={`flex flex-col gap-1 ${draft.scope === 'global' ? 'col-span-2' : ''}`}>
          <label htmlFor="variable-description" className="text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            Description
          </label>
          <Input
            id="variable-description"
            value={draft.description}
            onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}
            placeholder="Optional note"
          />
        </div>
      </div>
    </div>
  );
}

interface VariableEditorConfigCardProps {
  typeLabel: string;
  theme: VariableEditorTheme;
  draft: VariableDraft;
  setDraft: Dispatch<SetStateAction<VariableDraft>>;
}

export function VariableEditorConfigCard({ typeLabel, theme, draft, setDraft }: VariableEditorConfigCardProps) {
  const Icon = theme.icon;

  return (
    <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] p-3">
      <div className="mb-3 flex items-center gap-1.5">
        <span className={`text-[10px] uppercase tracking-widest ${theme.accent}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          <Icon size={13} /> {typeLabel} configuration
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="variable-config" className="text-[10px] uppercase tracking-wider text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          Config JSON
        </label>
        <Textarea
          id="variable-config"
          value={draft.configText}
          onChange={event => setDraft(current => ({ ...current, configText: event.target.value }))}
          rows={12}
          className="font-mono text-[11px]"
        />
        <p className="text-[10px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          Keep the JSON valid. Empty content resets the configuration to an empty object.
        </p>
      </div>
    </div>
  );
}

interface VariableEditorActionsProps {
  isSaving: boolean;
  isDeleting: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onDelete: () => void;
}

export function VariableEditorActions({ isSaving, isDeleting, onSave, onDiscard, onDelete }: VariableEditorActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={onSave}
        disabled={isSaving}
        className="rounded border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-500 transition-all hover:bg-cyan-500/20"
        variant="ghost"
      >
        Save changes
      </Button>
      <Button
        variant="ghost"
        onClick={onDiscard}
        disabled={isSaving}
        className="rounded border border-[var(--c-br1)] px-3 py-1.5 text-xs text-[var(--c-tx3)] transition-all hover:bg-[var(--c-bg6)]"
      >
        Discard
      </Button>
      <div className="flex-1" />
      <Button
        variant="destructive"
        onClick={onDelete}
        disabled={isSaving || isDeleting}
        aria-label="Delete variable"
        className="flex items-center gap-1.5 rounded border border-red-500/30 px-3 py-1.5 text-xs text-red-500 transition-all hover:bg-red-500/10"
      >
        Delete
      </Button>
    </div>
  );
}
