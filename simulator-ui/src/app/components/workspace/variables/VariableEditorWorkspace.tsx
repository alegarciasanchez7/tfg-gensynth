import { ChevronLeft } from 'lucide-react';
import type { Variable } from '../../../types';
import { useVariableEditor } from './useVariableEditor';
import {
  VariableEditorActions,
  VariableEditorConfigCard,
  VariableEditorHeader,
  VariableEditorIdentityCard,
} from './VariableEditorSections';

interface VariableEditorWorkspaceProps {
  variable: Variable;
  onBack: () => void;
}

export function VariableEditorWorkspace({ variable, onBack }: VariableEditorWorkspaceProps) {
  const {
    draft,
    setDraft,
    isSaving,
    isDeleting,
    typeTheme,
    scopeBadgeClass,
    handleSave,
    handleDiscard,
    handleDelete,
    scopeOptions,
  } = useVariableEditor(variable);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto p-4">
      <div className="flex w-full flex-col gap-4">
        <button
          onClick={onBack}
          className="flex w-fit items-center gap-1.5 text-[10px] text-[var(--c-tx4)] transition-colors hover:text-[var(--c-tx2)]"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          <ChevronLeft size={10} /> back to selection
        </button>

        <VariableEditorHeader variable={variable} theme={typeTheme} scopeBadgeClass={scopeBadgeClass} />
        <VariableEditorIdentityCard draft={draft} setDraft={setDraft} scopeOptions={scopeOptions} />
        <VariableEditorConfigCard
          typeLabel={variable.type}
          theme={typeTheme}
          draft={draft}
          setDraft={setDraft}
        />
        <VariableEditorActions
          isSaving={isSaving}
          isDeleting={isDeleting}
          onSave={handleSave}
          onDiscard={handleDiscard}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
