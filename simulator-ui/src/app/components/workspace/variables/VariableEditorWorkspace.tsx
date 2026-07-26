import { ChevronLeft } from 'lucide-react';
import { useApp } from '../../../context';
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
  const { state } = useApp();
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
    hasValidationError,
    saveButtonTitle,
    validationResult,
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
        <VariableEditorIdentityCard 
          draft={draft} 
          setDraft={setDraft} 
          scopeOptions={scopeOptions} 
          groups={state.groups}
        />
        <VariableEditorConfigCard
          typeLabel={variable.type}
          theme={typeTheme}
          draft={draft}
          setDraft={setDraft}
        />

        {/* Validation Warnings / Blocks display */}
        {hasValidationError && (
          <div className="p-2.5 rounded border border-amber-500/30 bg-amber-500/5 text-xs text-amber-400 flex items-start gap-2 animate-in fade-in duration-200">
            <span className="shrink-0 mt-0.5 text-amber-500">⚠</span>
            <div className="flex flex-col gap-0.5">
              {!validationResult.isJsonValid && <div>Config text must be a valid JSON structure.</div>}
              {validationResult.cycle && (
                <div>
                  Circular dependency detected: <span className="font-mono text-amber-300">{validationResult.cycle.join(' → ')}</span>
                </div>
              )}
              {Object.values(validationResult.errors).map((err, idx) => (
                <div key={idx}>{err}</div>
              ))}
            </div>
          </div>
        )}

        <VariableEditorActions
          isSaving={isSaving}
          isDeleting={isDeleting}
          onSave={handleSave}
          onDiscard={handleDiscard}
          onDelete={handleDelete}
          saveButtonTitle={saveButtonTitle}
        />
      </div>
    </div>
  );
}
