import type { Group, Selection, Variable } from '../../types';

/** Whether the selected group, flow or variable still exists (an empty selection always does). */
export function selectionExists(selection: Selection, groups: Group[], variables: Variable[]): boolean {
  switch (selection.type) {
    case 'group':
      return groups.some((group) => group.id === selection.groupId);
    case 'flow':
      return groups.some((group) => group.id === selection.groupId && group.flows.some((flow) => flow.id === selection.flowId));
    case 'variable':
      return variables.some((variable) => variable.id === selection.variableId);
    default:
      return true;
  }
}
