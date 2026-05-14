import type { Selection, Group, Variable } from '../../types';
import { EmptyWorkspace } from './EmptyWorkspace';
import { GroupWorkspace } from './GroupWorkspace';
import { FlowWorkspace } from './FlowWorkspace';
import { VariableEditorWorkspace } from './variables/VariableEditorWorkspace';
import { WorkspaceBreadcrumb } from './WorkspaceBreadcrumb';

interface WorkspaceProps {
  selection: Selection;
  groups: Group[];
  variables: Variable[];
  onSelectGroup: (groupId: string) => void;
  onSelectFlow: (groupId: string, flowId: string) => void;
  onSelectVariable: (id: string) => void;
  formatTemplate: Record<string, string>;
  onFormatChange: (flowId: string, template: string) => void;
  onClearVariableSelection: () => void;
  onClearSelection: () => void;
}

export function Workspace({
  selection,
  groups,
  variables,
  formatTemplate,
  onSelectGroup,
  onSelectFlow,
  onFormatChange,
  onClearVariableSelection,
  onClearSelection,
}: WorkspaceProps) {
  const findGroup = (id?: string) => groups.find(g => g.id === id);
  const findFlow = (gId?: string, fId?: string) => groups.find(g => g.id === gId)?.flows.find(f => f.id === fId);
  const findVariable = (id?: string) => variables.find(v => v.id === (id || (selection.type === 'variable' ? selection.variableId : undefined)));

  const breadcrumb = (
    <WorkspaceBreadcrumb
      selection={selection}
      groups={groups}
      variables={variables}
      onSelectGroup={onSelectGroup}
      onSelectFlow={onSelectFlow}
      onClearSelection={onClearSelection}
    />
  );

  if (selection.type === 'variable' && selection.variableId) {
    const variable = findVariable();
    if (variable) {
      return (
        <div className="flex-1 flex flex-col overflow-hidden bg-[var(--c-bg3)]">
          {breadcrumb}
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
          {breadcrumb}
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
          {breadcrumb}
          <FlowWorkspace
            flow={flow}
            group={group}
            template={formatTemplate[flow.id]}
            onTemplateChange={(t) => onFormatChange(flow.id, t)}
          />
        </div>
      );
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--c-bg3)]">
      {breadcrumb}
      <EmptyWorkspace />
    </div>
  );
}