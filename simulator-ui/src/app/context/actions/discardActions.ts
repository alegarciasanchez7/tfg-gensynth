import type React from 'react';
import { toast } from 'sonner';
import bridge, { CoreCommands } from '../../core/bridge';
import type { UICommandPayloadMap } from '../../core/types';
import type { Flow, Group, ProjectSettings, Variable } from '../../types';
import type { AppAction, SavedStateSnapshot } from '../reducer';
import { getFlowComparable, getGroupComparable, getVariableComparable } from '../helpers/dirtyStateHelper';
import { tickSettingsEqual } from '../../core/tickSettings';

export type DiscardItemType = 'group' | 'flow' | 'variable';

type DiscardCommandType =
  | 'CREATE_GROUP'
  | 'UPDATE_GROUP_CONFIG'
  | 'DELETE_GROUP'
  | 'CREATE_FLOW'
  | 'UPDATE_FLOW_CONFIG'
  | 'DELETE_FLOW'
  | 'CREATE_VARIABLE'
  | 'UPDATE_VARIABLE'
  | 'DELETE_VARIABLE'
  | 'UPDATE_SETTINGS';

/** A Core command needed to bring the Core back to the saved state of an item. */
export type DiscardCommand = {
  [K in DiscardCommandType]: { type: K; payload: UICommandPayloadMap[K] };
}[DiscardCommandType];

function isSame<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function updateFlowCommand(groupId: string, flow: Flow): DiscardCommand {
  return {
    type: 'UPDATE_FLOW_CONFIG',
    payload: {
      groupId,
      flowId: flow.id,
      name: flow.name,
      technology: flow.technology,
      host: flow.host,
      port: flow.port,
      topic: flow.topic,
      interval: flow.interval,
      burst: flow.burst,
      everyTicks: flow.everyTicks,
      template: flow.template,
      format: flow.format,
      connectorConfig: flow.connectorConfig,
      enabled: flow.enabled,
    },
  };
}

function restoreFlowCommands(groupId: string, flow: Flow): DiscardCommand[] {
  const commands: DiscardCommand[] = [
    {
      type: 'CREATE_FLOW',
      payload: {
        groupId,
        flowId: flow.id,
        name: flow.name,
        technology: flow.technology,
        host: flow.host,
        port: flow.port,
        topic: flow.topic,
        interval: flow.interval,
        burst: flow.burst,
        everyTicks: flow.everyTicks,
        template: flow.template,
        format: flow.format,
        connectorConfig: flow.connectorConfig,
      },
    },
  ];
  // CREATE_FLOW does not accept the enabled flag
  if (flow.enabled === false) {
    commands.push({ type: 'UPDATE_FLOW_CONFIG', payload: { groupId, flowId: flow.id, enabled: false } });
  }
  return commands;
}

function groupCommands(savedGroup: Group | undefined, currentGroup: Group): DiscardCommand[] {
  if (!savedGroup) {
    // Created after the last save: discarding removes it
    return [{ type: 'DELETE_GROUP', payload: { groupId: currentGroup.id } }];
  }

  const commands: DiscardCommand[] = [];
  const groupProps = (group: Group) => ({ ...getGroupComparable(group), flows: undefined });
  if (!isSame(groupProps(savedGroup), groupProps(currentGroup))) {
    commands.push({
      type: 'UPDATE_GROUP_CONFIG',
      payload: {
        groupId: savedGroup.id,
        name: savedGroup.name,
        description: savedGroup.description,
        threads: savedGroup.threads,
        outputMode: savedGroup.outputMode,
        enabled: savedGroup.enabled,
      },
    });
  }

  const currentFlows = new Map(currentGroup.flows.map((flow) => [flow.id, flow]));
  const savedFlowIds = new Set(savedGroup.flows.map((flow) => flow.id));

  for (const savedFlow of savedGroup.flows) {
    const currentFlow = currentFlows.get(savedFlow.id);
    if (!currentFlow) {
      commands.push(...restoreFlowCommands(savedGroup.id, savedFlow));
    } else if (!isSame(getFlowComparable(savedFlow), getFlowComparable(currentFlow))) {
      commands.push(updateFlowCommand(savedGroup.id, savedFlow));
    }
  }
  for (const currentFlow of currentGroup.flows) {
    if (!savedFlowIds.has(currentFlow.id)) {
      commands.push({ type: 'DELETE_FLOW', payload: { groupId: currentGroup.id, flowId: currentFlow.id } });
    }
  }
  return commands;
}

function flowCommands(savedState: SavedStateSnapshot, groups: Group[], flowId: string): DiscardCommand[] {
  const currentGroup = groups.find((group) => group.flows.some((flow) => flow.id === flowId));
  if (!currentGroup) return [];

  const savedFlow = savedState.groups.flatMap((group) => group.flows).find((flow) => flow.id === flowId);
  if (!savedFlow) {
    return [{ type: 'DELETE_FLOW', payload: { groupId: currentGroup.id, flowId } }];
  }
  return [updateFlowCommand(currentGroup.id, savedFlow)];
}

function variableCommands(savedState: SavedStateSnapshot, variables: Variable[], variableId: string): DiscardCommand[] {
  if (!variables.some((variable) => variable.id === variableId)) return [];

  const savedVariable = savedState.variables.find((variable) => variable.id === variableId);
  if (!savedVariable) {
    return [{ type: 'DELETE_VARIABLE', payload: { variableId } }];
  }
  return [
    {
      type: 'UPDATE_VARIABLE',
      payload: {
        variableId,
        name: savedVariable.name,
        type: savedVariable.type,
        scope: savedVariable.scope,
        flowId: savedVariable.flowId ?? null,
        groupId: savedVariable.groupId ?? null,
        config: savedVariable.config,
      },
    },
  ];
}

/** Recreates a group deleted after the last save, with its id and its flows. */
function restoreGroupCommands(savedGroup: Group): DiscardCommand[] {
  const commands: DiscardCommand[] = [
    {
      type: 'CREATE_GROUP',
      payload: {
        groupId: savedGroup.id,
        name: savedGroup.name,
        description: savedGroup.description,
        outputMode: savedGroup.outputMode,
      },
    },
  ];
  for (const flow of savedGroup.flows) {
    commands.push(...restoreFlowCommands(savedGroup.id, flow));
  }
  // CREATE_GROUP does not accept the enabled flag
  if (savedGroup.enabled === false) {
    commands.push({ type: 'UPDATE_GROUP_CONFIG', payload: { groupId: savedGroup.id, enabled: false } });
  }
  return commands;
}

/** Recreates a variable deleted after the last save, with its id. */
function restoreVariableCommand(savedVariable: Variable): DiscardCommand {
  return {
    type: 'CREATE_VARIABLE',
    payload: {
      variableId: savedVariable.id,
      name: savedVariable.name,
      type: savedVariable.type,
      scope: savedVariable.scope,
      flowId: savedVariable.flowId,
      groupId: savedVariable.groupId,
      config: savedVariable.config as Record<string, unknown>,
    },
  };
}

/**
 * Computes the Core commands that bring the whole project back to its last saved state:
 * groups (with their flows), variables and project settings, including items created or
 * deleted since the save. Running groups keep running.
 */
export function buildDiscardAllCommands(
  savedState: SavedStateSnapshot,
  groups: Group[],
  variables: Variable[],
  settings: ProjectSettings,
): DiscardCommand[] {
  const commands: DiscardCommand[] = [];

  // Groups first: deleting new ones frees their names before deleted ones are recreated
  for (const group of groups) {
    commands.push(...groupCommands(savedState.groups.find((saved) => saved.id === group.id), group));
  }
  const currentGroupIds = new Set(groups.map((group) => group.id));
  for (const savedGroup of savedState.groups) {
    if (!currentGroupIds.has(savedGroup.id)) {
      commands.push(...restoreGroupCommands(savedGroup));
    }
  }

  // Variables after the flows they may belong to exist again
  const savedVariables = new Map(savedState.variables.map((variable) => [variable.id, variable]));
  for (const variable of variables) {
    const savedVariable = savedVariables.get(variable.id);
    if (!savedVariable || !isSame(getVariableComparable(savedVariable), getVariableComparable(variable))) {
      commands.push(...variableCommands(savedState, variables, variable.id));
    }
  }
  const currentVariableIds = new Set(variables.map((variable) => variable.id));
  for (const savedVariable of savedState.variables) {
    if (!currentVariableIds.has(savedVariable.id)) {
      commands.push(restoreVariableCommand(savedVariable));
    }
  }

  if (!tickSettingsEqual(savedState.settings.tick, settings.tick)) {
    commands.push({ type: 'UPDATE_SETTINGS', payload: savedState.settings });
  }
  return commands;
}

/**
 * Computes the Core commands that revert one item to its last saved state.
 * Mirrors the local revert done by the DISCARD_ITEM_CHANGES reducer branch.
 */
export function buildDiscardCommands(
  savedState: SavedStateSnapshot,
  groups: Group[],
  variables: Variable[],
  itemType: DiscardItemType,
  itemId: string,
): DiscardCommand[] {
  switch (itemType) {
    case 'group': {
      const currentGroup = groups.find((group) => group.id === itemId);
      if (!currentGroup) return [];
      return groupCommands(savedState.groups.find((group) => group.id === itemId), currentGroup);
    }
    case 'flow':
      return flowCommands(savedState, groups, itemId);
    case 'variable':
      return variableCommands(savedState, variables, itemId);
  }
}

export interface DiscardContext {
  dispatch: React.Dispatch<AppAction>;
  isConnected: boolean;
  savedState: SavedStateSnapshot | null;
  groups: Group[];
  variables: Variable[];
  settings: ProjectSettings;
}

/**
 * Sends the revert commands to the Core in order. On failure, reports the error and resyncs
 * with the Core so the UI shows what it actually holds (leftovers stay marked as unsaved).
 */
async function sendDiscardCommands(ctx: DiscardContext, commands: DiscardCommand[]): Promise<void> {
  try {
    for (const command of commands) {
      await bridge.send(command.type, command.payload);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.dispatch({
      type: 'ADD_LOG',
      payload: {
        id: `discard_error_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        level: 'error',
        source: 'SYSTEM',
        message: `Error discarding changes in Core: ${message}`,
      },
    });
    toast.error(`Could not discard changes in Core: ${message}`);
    await CoreCommands.getInitialState().catch(() => undefined);
  }
}

/**
 * Reverts the whole project to its last saved state in the UI and in the Core.
 */
export async function discardAllChanges(ctx: DiscardContext): Promise<void> {
  if (!ctx.savedState) return;

  // Compute the commands from the state before reverting it locally
  const commands = buildDiscardAllCommands(ctx.savedState, ctx.groups, ctx.variables, ctx.settings);
  ctx.dispatch({ type: 'DISCARD_ALL_CHANGES' });

  if (!ctx.isConnected) return;
  await sendDiscardCommands(ctx, commands);
}

/**
 * Reverts an item to its last saved state in the UI and in the Core.
 * Edits are applied to the Core as they happen, so reverting only the UI would leave the
 * Core running (and later echoing back) the discarded values.
 */
export async function discardItemChanges(ctx: DiscardContext, itemType: DiscardItemType, itemId: string): Promise<void> {
  if (!ctx.savedState) return;

  // Compute the commands from the state before reverting it locally
  const commands = buildDiscardCommands(ctx.savedState, ctx.groups, ctx.variables, itemType, itemId);
  ctx.dispatch({ type: 'DISCARD_ITEM_CHANGES', payload: { type: itemType, id: itemId } });

  if (!ctx.isConnected) return;
  await sendDiscardCommands(ctx, commands);
}
