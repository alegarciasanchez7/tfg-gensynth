import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Binary, ListChecks, ALargeSmall, CalendarClock, MapPin, ToggleLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../../../context';
import type { Variable } from '../../../types';
import { useVariableValidation } from '../../../context/hooks/useVariableValidation';
import { findVariableNameConflict } from '../../../core/variableNames';

export type VariableDraft = {
  name: string;
  type: Variable['type'];
  scope: Variable['scope'];
  description: string;
  configText: string;
  flowId?: string;
  groupId?: string;
};

type VariableTypeTheme = {
  icon: typeof Binary;
  description: string;
  accent: string;
  border: string;
};

const VARIABLE_TYPES: Record<Variable['type'], VariableTypeTheme> = {
  string: {
    icon: ALargeSmall,
    description: 'Patterned or random string generation',
    accent: 'text-emerald-500',
    border: 'border-emerald-500/40',
  },
  numeric: {
    icon: Binary,
    description: 'Random or distributed numeric value',
    accent: 'text-cyan-500',
    border: 'border-cyan-500/40',
  },
  boolean: {
    icon: ToggleLeft,
    description: 'True/false with configurable probability',
    accent: 'text-pink-500',
    border: 'border-pink-500/40',
  },
  list: {
    icon: ListChecks,
    description: 'Value sampled from a defined list',
    accent: 'text-violet-500',
    border: 'border-violet-500/40',
  },
  temporal: {
    icon: CalendarClock,
    description: 'Timestamp or datetime within a configurable range',
    accent: 'text-purple-500',
    border: 'border-purple-500/40',
  },
  point: {
    icon: MapPin,
    description: 'Geographic or cartesian coordinate point',
    accent: 'text-teal-500',
    border: 'border-teal-500/40',
  },
};

const VARIABLE_SCOPES: Array<{ value: Variable['scope']; label: string }> = [
  { value: 'local', label: 'Local' },
  { value: 'group', label: 'Group' },
  { value: 'global', label: 'Global' },
];

function toPrettyConfig(config: Variable['config']) {
  return JSON.stringify(config ?? {}, null, 2);
}

function createDraft(variable: Variable): VariableDraft {
  return {
    name: variable.name,
    type: variable.type,
    scope: variable.scope,
    description: variable.description ?? '',
    configText: toPrettyConfig(variable.config),
    flowId: variable.flowId,
    groupId: variable.groupId,
  };
}

type VariableUpdate = Pick<Variable, 'name' | 'type' | 'scope' | 'description' | 'config' | 'flowId' | 'groupId'>;

/** Name and place of a variable: what has to stay unique. */
type VariableIdentity = Pick<Variable, 'name' | 'scope' | 'flowId' | 'groupId'>;

function identityOf(source: VariableIdentity): VariableIdentity {
  return { name: source.name.trim(), scope: source.scope, flowId: source.flowId, groupId: source.groupId };
}

function sameIdentity(a: VariableIdentity, b: VariableIdentity): boolean {
  return a.name === b.name && a.scope === b.scope && a.flowId === b.flowId && a.groupId === b.groupId;
}

/**
 * Why the draft's name/scope cannot be applied (empty name, or another variable already uses
 * that name in the same place), or null when it can.
 */
function identityProblem(variables: Variable[], variableId: string, draft: VariableIdentity): string | null {
  if (!draft.name.trim()) return 'Name is required';
  return findVariableNameConflict(variables, { ...draft, id: variableId });
}

/** Order-independent JSON, so a server echo matches the update it answers. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function updateKey(update: VariableUpdate): string {
  return stableStringify({
    name: update.name,
    type: update.type,
    scope: update.scope,
    description: update.description ?? '',
    config: update.config ?? {},
    flowId: update.flowId,
    groupId: update.groupId,
  });
}

/** Most updates kept to recognise their echoes. */
const MAX_PENDING_ECHOES = 100;

function parseConfig(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }

  return JSON.parse(trimmed) as Variable['config'];
}

export function useVariableEditor(variable: Variable) {
  const { state, actions } = useApp();
  const [draft, setDraftState] = useState<VariableDraft>(() => createDraft(variable));
  const [isDeleting, setIsDeleting] = useState(false);
  const isDirty = state?.dirtyItems?.variableIds?.has(variable.id) ?? false;
  // Latest draft, so quick consecutive edits build on each other
  const draftRef = useRef(draft);
  // Updates sent from this editor that the app state has not echoed back yet
  const pendingEchoes = useRef<string[]>([]);
  // Name/scope last applied: kept in the updates while the draft's one is invalid or taken
  const appliedIdentity = useRef<VariableIdentity>(identityOf(variable));
  // Last update sent (null: none since the state was loaded), so an unchanged update is not sent again
  const lastSentKey = useRef<string | null>(null);

  // From the state of this render: the provider's ref (getVariables) is updated after its children's effects
  const currentVariables = (): Variable[] => state?.variables ?? actions.getVariables?.() ?? [];
  const variablesNow = currentVariables();

  const resetDraft = (next: VariableDraft) => {
    pendingEchoes.current = [];
    appliedIdentity.current = identityOf(next);
    lastSentKey.current = null;
    draftRef.current = next;
    setDraftState(next);
  };

  useEffect(() => {
    const echoIndex = pendingEchoes.current.lastIndexOf(updateKey(variable));
    if (echoIndex !== -1) {
      // Echo of our own edit: the draft is already newer or equal, so typing is never overwritten
      pendingEchoes.current = pendingEchoes.current.slice(echoIndex + 1);
      return;
    }
    // Changed elsewhere (another variable, discard, server correction)
    resetDraft(createDraft(variable));
  }, [variable]);

  /**
   * Applies a draft to the app state (live editing). While its name is empty or already used in
   * the same place, the last valid name/scope is sent instead, so a duplicate never reaches the
   * Core; the draft keeps what the user typed and the editor shows the warning.
   */
  const sendDraft = (next: VariableDraft, variables: Variable[]) => {
    let parsed: Variable['config'] = variable.config;
    try {
      parsed = parseConfig(next.configText);
    } catch {
      // Keep previous config if invalid json while typing
    }
    const identity = identityProblem(variables, variable.id, next) ? appliedIdentity.current : identityOf(next);
    const update: VariableUpdate = {
      ...identity,
      type: next.type,
      description: next.description.trim(),
      config: parsed,
    };
    const key = updateKey(update);
    // e.g. typing a name that is taken: nothing new to apply
    if (key === (lastSentKey.current ?? updateKey(variable))) return;
    appliedIdentity.current = identity;
    lastSentKey.current = key;
    pendingEchoes.current = [...pendingEchoes.current, key].slice(-MAX_PENDING_ECHOES);
    actions.updateVariable(variable.id, update);
  };

  const setDraft: Dispatch<SetStateAction<VariableDraft>> = (valueOrFn) => {
    const next = typeof valueOrFn === 'function' ? valueOrFn(draftRef.current) : valueOrFn;
    draftRef.current = next;
    setDraftState(next);
    // Auto-update context state
    sendDraft(next, currentVariables());
  };

  // A name kept back because it was taken is applied as soon as it is free (e.g. the other
  // variable was renamed or deleted), without waiting for another edit
  const identityIssue = identityProblem(variablesNow, variable.id, draft);
  useEffect(() => {
    if (identityIssue || sameIdentity(identityOf(draftRef.current), appliedIdentity.current)) return;
    sendDraft(draftRef.current, variablesNow);
  });

  const typeTheme = useMemo(() => VARIABLE_TYPES[draft.type] ?? VARIABLE_TYPES.string, [draft.type]);

  const scopeBadgeClass = useMemo(() => {
    switch (draft.scope) {
      case 'local':
        return 'bg-sky-500/10 border-sky-500/30 text-sky-500';
      case 'group':
        return 'bg-violet-500/10 border-violet-500/30 text-violet-500';
      case 'global':
      default:
        return 'bg-amber-500/10 border-amber-500/30 text-amber-500';
    }
  }, [draft.scope]);

  const handleDiscard = () => {
    actions.discardItemChanges('variable', variable.id);
    resetDraft(createDraft(variable));
    toast.info(`Changes discarded for variable "${variable.name}"`);
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete variable "${variable.name}"?`);
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      await actions.deleteVariable(variable.id);
      actions.clearVariableSelection();
      toast.success('Variable deleted');
    } catch {
      toast.error('Unable to delete variable');
    } finally {
      setIsDeleting(false);
    }
  };

  const { validateConfig, detectCycle } = useVariableValidation();

  const validationResult = useMemo(() => {
    try {
      const parsedConfig: Variable['config'] = parseConfig(draft.configText);
      const variablesList = variablesNow;
      const errors = validateConfig(draft.type, parsedConfig, variablesList);
      if (identityIssue) errors.name = identityIssue;
      
      let cycle: string[] | null = null;
      if (draft.type === 'numeric' && parsedConfig.formula) {
        cycle = detectCycle(variablesList, variable.id, draft.name, parsedConfig.formula);
      }
      return { errors, cycle, isJsonValid: true };
    } catch {
      return { errors: {}, cycle: null, isJsonValid: false };
    }
  }, [draft.configText, draft.type, draft.name, variable.id, variablesNow, identityIssue]);

  const hasValidationError = !validationResult.isJsonValid || Object.keys(validationResult.errors).length > 0 || validationResult.cycle !== null;

  return {
    draft,
    setDraft,
    isSaving: false,
    isDeleting,
    isDirty,
    typeTheme,
    scopeBadgeClass,
    TypeIcon: typeTheme.icon,
    handleSave: handleDiscard,
    handleDiscard,
    handleDelete,
    scopeOptions: VARIABLE_SCOPES,
    hasValidationError,
    validationResult,
  };
}
