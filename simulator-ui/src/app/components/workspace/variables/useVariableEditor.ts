import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Binary, ListChecks, ALargeSmall, CalendarClock, MapPin, ToggleLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../../../context';
import type { Variable } from '../../../types';

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

function parseConfig(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }

  return JSON.parse(trimmed) as Variable['config'];
}

export function useVariableEditor(variable: Variable) {
  const { actions } = useApp();
  const [draft, setDraft] = useState<VariableDraft>(() => createDraft(variable));
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setDraft(createDraft(variable));
  }, [variable]);

  const typeTheme = useMemo(() => VARIABLE_TYPES[draft.type], [draft.type]);

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

  const handleSave = async () => {
    let parsedConfig: Variable['config'];
    try {
      parsedConfig = parseConfig(draft.configText);
    } catch {
      toast.error('Config JSON is invalid');
      return;
    }

    setIsSaving(true);
    try {
      await actions.updateVariable(variable.id, {
        name: draft.name.trim(),
        type: draft.type,
        scope: draft.scope,
        description: draft.description.trim(),
        config: parsedConfig,
        flowId: draft.flowId,
        groupId: draft.groupId,
      });
      toast.success('Variable updated');
    } catch (error) {
      const errorCode = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: string }).code ?? '')
        : '';

      if (errorCode === 'NOT_FOUND') {
        try {
          await actions.createVariable(
            draft.name.trim(),
            draft.type,
            draft.scope,
            {
              ...parsedConfig,
              ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
            },
            variable.id,
          );
          toast.success('Variable restored and updated');
          return;
        } catch {
          // fall through to the generic error below
        }
      }

      toast.error('Unable to update variable');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setDraft(createDraft(variable));
    toast.message('Changes discarded');
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

  return {
    draft,
    setDraft: setDraft as Dispatch<SetStateAction<VariableDraft>>,
    isSaving,
    isDeleting,
    typeTheme,
    scopeBadgeClass,
    TypeIcon: typeTheme.icon,
    handleSave,
    handleDiscard,
    handleDelete,
    scopeOptions: VARIABLE_SCOPES,
  };
}
