import type { Selection, Group, Variable } from '../types';
import { EmptyWorkspace } from './workspace/EmptyWorkspace';
import { GroupWorkspace } from './workspace/GroupWorkspace';
import { FlowWorkspace } from './workspace/FlowWorkspace';
import { VariableEditorWorkspace } from './workspace/variables/VariableEditorWorkspace';

interface WorkspaceProps {
  selection: Selection;
  groups: Group[];
  variables: Variable[];
  onSelectVariable: (id: string) => void;
  formatTemplate: Record<string, string>;
  onFormatChange: (flowId: string, template: string) => void;
  onClearVariableSelection: () => void;
}

export function Workspace({
  selection,
  groups,
  variables,
  onSelectVariable,
  formatTemplate,
  onFormatChange,
  onClearVariableSelection,
}: WorkspaceProps) {
  const findGroup = (id?: string) => groups.find(g => g.id === id);
  const findFlow = (gId?: string, fId?: string) => groups.find(g => g.id === gId)?.flows.find(f => f.id === fId);
  const findVariable = (id?: string) => variables.find(v => v.id === id);

  if (selection.type === 'variable' && selection.variableId) {
    const variable = findVariable(selection.variableId);
    if (variable) {
      return (
        <div className="flex-1 flex flex-col overflow-hidden bg-[var(--c-bg3)]">
          <WorkspaceBreadcrumb label={`Variable Editor · ${variable.name}`} />
          <VariableEditorWorkspace variable={variable} onBack={onClearVariableSelection} />
        </div>
      );
    }
  }

  if (selection.type === 'group' && selection.groupId) {
    const group = findGroup(selection.groupId);
    if (group) {
      return (
        <div className="flex-1 flex flex-col overflow-hidden bg-[var(--c-bg3)]">
          <WorkspaceBreadcrumb label={`Group · ${group.name}`} />
          <GroupWorkspace group={group} />
        </div>
      );
    }
  }

  if (selection.type === 'flow' && selection.groupId && selection.flowId) {
    const group = findGroup(selection.groupId);
    const flow = findFlow(selection.groupId, selection.flowId);
    if (group && flow) {
      return (
        <div className="flex-1 flex flex-col overflow-hidden bg-[var(--c-bg3)]">
          <WorkspaceBreadcrumb label={`${group.name} › ${flow.name}`} />
          <FlowWorkspace
            flow={flow}
            group={group}
            template={formatTemplate[flow.id] ?? ''}
            onTemplateChange={(t) => onFormatChange(flow.id, t)}
          />
        </div>
      );
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--c-bg3)]">
      <EmptyWorkspace />
    </div>
  );
}

function WorkspaceBreadcrumb({ label }: { label: string }) {
  return (
    <div
      className="px-4 py-2 border-b border-[var(--c-br2)] bg-[var(--c-bg2)] shrink-0 flex items-center"
      style={{ height: 32 }}
    >
      <span
        className="text-[10px] text-[var(--c-tx4)] tracking-wider"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        WORKSPACE › {label.toUpperCase()}
      </span>
    </div>
  );
}
