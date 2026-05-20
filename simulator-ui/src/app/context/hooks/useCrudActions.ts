import { useCallback } from 'react';
import { toast } from 'sonner';
import { CoreCommands } from '../../core/bridge';
import type { GroupState, FlowState, VariableState } from '../../core/types';
import type { Group, Flow, Variable, VariableType, VariableScope } from '../../types';
import type { AppState, AppAction } from '../reducer';
import { mapFlowFromCore, mapGroupFromCore } from '../helpers/groupHelpers';
import * as CRUDActions from '../crudActions';
import type { CRUDActionContext } from '../crudActions';
import { normalizeVariableFromCore } from '../variableNormalization';
import type { OptimisticManager } from '../optimisticManager';
import { 
  executeOptimisticUpdate, 
  createGroupUpdatePayload,
  createFlowUpdatePayload,
  createVariableUpdatePayload,
} from '../optimisticUpdateHelper';
import {
  executeCreateOptimistic,
  generateOptimisticId,
  createOptimisticGroup,
  createOptimisticFlow,
  createOptimisticVariable,
} from '../createOptimisticHelper';
import { executeDeleteOptimistic } from '../deleteOptimisticHelper';

interface UseCrudActionsProps {
  state: AppState;
  stateRef: React.MutableRefObject<AppState>;
  dispatch: React.Dispatch<AppAction>;
  optimisticManager: OptimisticManager | null;
  reportCommandError: (source: string, action: string, error: unknown) => void;
}

export function useCrudActions({
  state,
  stateRef,
  dispatch,
  optimisticManager,
  reportCommandError,
}: UseCrudActionsProps) {
  
  const crudContext: CRUDActionContext = {
    dispatch,
    reportError: reportCommandError,
    connectionMode: state.connectionMode,
    optimisticManager,
  };

  const createGroup = useCallback(async (name: string, description?: string) => {
    const optimisticId = generateOptimisticId('group');
    const optimisticGroup = createOptimisticGroup(optimisticId, name, description);

    try {
      const applyOptimisticGroup = () => {
        const currentGroups = stateRef.current.groups;
        const nextGroups = currentGroups.some((g) => g.id === optimisticId)
          ? currentGroups
          : [...currentGroups, optimisticGroup];

        dispatch({
          type: 'SET_GROUPS',
          payload: nextGroups,
        });
      };

      const rollbackOptimisticGroup = () => {
        dispatch({
          type: 'SET_GROUPS',
          payload: stateRef.current.groups.filter((g) => g.id !== optimisticId),
        });
      };

      const createdGroup = await executeCreateOptimistic(
        {
          optimisticManager,
          commandType: 'CREATE_GROUP',
          optimisticId,
        },
        {
          applyOptimistic: applyOptimisticGroup,
          rollback: rollbackOptimisticGroup,
          send: (onResponse) => CRUDActions.createGroup(crudContext, name, description, onResponse),
          reconcileId: (serverGroup) => {
            const previousGroup = stateRef.current.groups.find(g => g.id === optimisticId);
            const mappedGroup = mapGroupFromCore(serverGroup as GroupState, previousGroup);
            
            dispatch({
              type: 'SET_GROUPS',
              payload: stateRef.current.groups.map((g) =>
                g.id === optimisticId ? mappedGroup : g
              ),
            });

            if (stateRef.current.selection.groupId === optimisticId) {
              dispatch({
                type: 'SET_SELECTION',
                payload: { ...stateRef.current.selection, groupId: mappedGroup.id }
              });
            }
          },
        }
      );

      return mapGroupFromCore(createdGroup as GroupState);
    } catch (error) {
      reportCommandError('GROUPS', `createGroup(${name})`, error);
      throw error;
    }
  }, [crudContext, reportCommandError, stateRef, dispatch, optimisticManager]);

  const deleteGroup = useCallback(async (groupId: string) => {
    const previousGroup = state.groups.find(g => g.id === groupId);
    if (!previousGroup) {
      throw new Error(`Group ${groupId} not found`);
    }

    try {
      await executeDeleteOptimistic(
        {
          optimisticManager,
          commandType: 'DELETE_GROUP',
          resourceId: groupId,
        },
        {
          applyOptimistic: () => {
            dispatch({
              type: 'SET_GROUPS',
              payload: state.groups.filter(g => g.id !== groupId),
            });
          },
          rollback: () => {
            dispatch({
              type: 'SET_GROUPS',
              payload: [...state.groups, previousGroup],
            });
          },
          send: () => CRUDActions.deleteGroup(crudContext, groupId),
        }
      );
    } catch (error) {
      reportCommandError('GROUPS', `deleteGroup(${groupId})`, error);
      throw error;
    }
  }, [crudContext, state.groups, reportCommandError, dispatch, optimisticManager]);

  const updateGroupConfig = useCallback(
    async (groupId: string, config: Partial<Omit<Group, 'id' | 'flows'>>, name?: string) => {
      const previousGroup = state.groups.find(g => g.id === groupId);
      if (!previousGroup) {
        throw new Error(`Group ${groupId} not found`);
      }

      const { optimistic: optimisticPayload, rollback: rollbackPayload } = 
        createGroupUpdatePayload(previousGroup, config);

      try {
        await executeOptimisticUpdate(
          {
            optimisticManager,
            commandType: 'UPDATE_GROUP_CONFIG',
            resourceId: groupId,
          },
          {
            applyOptimistic: () => {
              dispatch({
                type: 'UPDATE_GROUP',
                payload: optimisticPayload as any,
              });
            },
            rollback: () => {
              dispatch({
                type: 'UPDATE_GROUP',
                payload: rollbackPayload as any,
              });
            },
            send: () => CRUDActions.updateGroupConfig(crudContext, groupId, config, name),
          }
        );
      } catch (error) {
        reportCommandError('GROUPS', `updateGroupConfig(${groupId})`, error);
        throw error;
      }
    },
    [crudContext, state.groups, reportCommandError, dispatch, optimisticManager],
  );

  const createFlow = useCallback(async (
    groupId: string,
    name: string,
    technology: string,
    host: string,
    port: number,
    topic?: string,
    interval?: number,
    burst?: number,
    template?: string,
    connectorConfig?: Record<string, unknown>,
  ) => {
    const optimisticId = generateOptimisticId('flow');
    const optimisticFlow = createOptimisticFlow(
      optimisticId,
      name,
      technology,
      host,
      port,
      topic,
      interval,
      burst
    );

    try {
      const applyOptimisticFlow = () => {
        dispatch({
          type: 'SET_GROUPS',
          payload: stateRef.current.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  flows: g.flows.some((f) => f.id === optimisticId)
                    ? g.flows
                    : [...g.flows, optimisticFlow],
                }
              : g
          ),
        });
      };

      const rollbackOptimisticFlow = () => {
        dispatch({
          type: 'SET_GROUPS',
          payload: stateRef.current.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  flows: g.flows.filter((f) => f.id !== optimisticId),
                }
              : g
          ),
        });
      };

      const createdFlow = await executeCreateOptimistic(
        {
          optimisticManager,
          commandType: 'CREATE_FLOW',
          optimisticId,
        },
        {
          applyOptimistic: applyOptimisticFlow,
          rollback: rollbackOptimisticFlow,
          send: (onResponse) =>
            CRUDActions.createFlow(
              crudContext,
              groupId,
              name,
              technology,
              host,
              port,
              topic,
              interval,
              burst,
              template,
              connectorConfig,
              onResponse
            ),
          reconcileId: (serverFlow) => {
            const mappedFlow = mapFlowFromCore(serverFlow as FlowState);
            dispatch({
              type: 'SET_GROUPS',
              payload: stateRef.current.groups.map((g) =>
                g.id === groupId
                  ? {
                      ...g,
                      flows: g.flows.map((f) =>
                        f.id === optimisticId ? mappedFlow : f
                      ),
                    }
                  : g
              ),
            });

            if (stateRef.current.selection.flowId === optimisticId) {
              dispatch({
                type: 'SET_SELECTION',
                payload: { ...stateRef.current.selection, flowId: mappedFlow.id }
              });
            }
          },
        }
      );

      return mapFlowFromCore(createdFlow as FlowState);
    } catch (error) {
      reportCommandError('FLOWS', `createFlow(${name})`, error);
      throw error;
    }
  }, [crudContext, reportCommandError, stateRef, dispatch, optimisticManager]);

  const deleteFlow = useCallback(async (groupId: string, flowId: string) => {
    const group = state.groups.find(g => g.id === groupId);
    const flow = group?.flows.find(f => f.id === flowId);
    
    if (!flow) {
      throw new Error(`Flow ${flowId} not found in group ${groupId}`);
    }

    try {
      await executeDeleteOptimistic(
        {
          optimisticManager,
          commandType: 'DELETE_FLOW',
          resourceId: flowId,
        },
        {
          applyOptimistic: () => {
            dispatch({
              type: 'SET_GROUPS',
              payload: state.groups.map((g) =>
                g.id === groupId
                  ? {
                      ...g,
                      flows: g.flows.filter(f => f.id !== flowId),
                    }
                  : g
              ),
            });
          },
          rollback: () => {
            dispatch({
              type: 'SET_GROUPS',
              payload: state.groups.map((g) =>
                g.id === groupId
                  ? {
                      ...g,
                      flows: [...g.flows, flow],
                    }
                  : g
              ),
            });
          },
          send: () => CRUDActions.deleteFlow(crudContext, groupId, flowId, flow.name),
        }
      );
    } catch (error) {
      reportCommandError('FLOWS', `deleteFlow(${flowId})`, error);
      throw error;
    }
  }, [crudContext, state.groups, reportCommandError, dispatch, optimisticManager]);

  const updateFlowConfig = useCallback(async (
    groupId: string,
    flowId: string,
    config: Partial<Omit<Flow, 'id' | 'connectionStatus' | 'throughput' | 'hasError' | 'errorMessage'>> & { template?: string },
  ) => {
    const group = state.groups.find(g => g.id === groupId);
    const flow = group?.flows.find(f => f.id === flowId);
    
    if (!flow) {
      throw new Error(`Flow ${flowId} not found in group ${groupId}`);
    }

    const { optimistic: optimisticPayload, rollback: rollbackPayload } = 
      createFlowUpdatePayload(flow, config as any);

    try {
      await executeOptimisticUpdate(
        {
          optimisticManager,
          commandType: 'UPDATE_FLOW_CONFIG',
          resourceId: flowId,
        },
        {
          applyOptimistic: () => {
            dispatch({
              type: 'SET_GROUPS',
              payload: state.groups.map((g) =>
                g.id === groupId
                  ? {
                      ...g,
                      flows: g.flows.map((f) =>
                        f.id === flowId
                          ? { ...f, ...optimisticPayload }
                          : f,
                      ),
                    }
                  : g,
              ),
            });
          },
          rollback: () => {
            dispatch({
              type: 'SET_GROUPS',
              payload: state.groups.map((g) =>
                g.id === groupId
                  ? {
                      ...g,
                      flows: g.flows.map((f) =>
                        f.id === flowId
                          ? { ...f, ...rollbackPayload }
                          : f,
                      ),
                    }
                  : g,
              ),
            });
          },
          send: () => CRUDActions.updateFlowConfig(crudContext, groupId, flowId, config, flow.name),
        }
      );
    } catch (error) {
      reportCommandError('FLOWS', `updateFlowConfig(${flowId})`, error);
      throw error;
    }
  }, [crudContext, state.groups, reportCommandError, dispatch, optimisticManager]);

  const cloneGroup = useCallback(async (groupId: string, count: number, namingPattern?: string) => {
    try {
      await CoreCommands.cloneGroup(groupId, count, namingPattern);
      toast.success(`Iniciando clonación de grupo (${count} copias)`);
    } catch (error) {
      reportCommandError('GROUPS', `cloneGroup(${groupId})`, error);
    }
  }, [reportCommandError]);

  const cloneFlow = useCallback(async (groupId: string, flowId: string, count: number, namingPattern?: string) => {
    try {
      await CoreCommands.cloneFlow(groupId, flowId, count, namingPattern);
      toast.success(`Iniciando clonación de flow (${count} copias)`);
    } catch (error) {
      reportCommandError('FLOWS', `cloneFlow(${flowId})`, error);
    }
  }, [reportCommandError]);

  const createVariable = useCallback(async (
    name: string,
    type: VariableType,
    scope: VariableScope,
    config?: Record<string, unknown>,
    flowId?: string,
    groupId?: string,
    variableId?: string,
  ) => {
    const optimisticId = variableId || generateOptimisticId('var');
    const optimisticVariable = createOptimisticVariable(optimisticId, name, type, scope, flowId, groupId);

    try {
      const applyOptimisticVariable = () => {
        const currentVariables = stateRef.current.variables;
        const nextVariables = currentVariables.some((v) => v.id === optimisticId)
          ? currentVariables
          : [...currentVariables, optimisticVariable];

        dispatch({
          type: 'SET_VARIABLES',
          payload: nextVariables,
        });
      };

      const rollbackOptimisticVariable = () => {
        dispatch({
          type: 'SET_VARIABLES',
          payload: stateRef.current.variables.filter((v) => v.id !== optimisticId),
        });
      };

      const createdVariable = await executeCreateOptimistic(
        {
          optimisticManager,
          commandType: 'CREATE_VARIABLE',
          optimisticId,
        },
        {
          applyOptimistic: applyOptimisticVariable,
          rollback: rollbackOptimisticVariable,
          send: (onResponse) =>
            CRUDActions.createVariable(crudContext, name, type, scope, config, flowId, groupId, variableId, onResponse),
          reconcileId: (serverVariable) => {
            const normalizedServer = normalizeVariableFromCore(serverVariable as VariableState);
            dispatch({
              type: 'SET_VARIABLES',
              payload: stateRef.current.variables.map((v) =>
                v.id === optimisticId ? normalizedServer : v
              ),
            });

            if (stateRef.current.selection.variableId === optimisticId) {
              dispatch({
                type: 'SET_SELECTION',
                payload: { ...stateRef.current.selection, variableId: normalizedServer.id }
              });
            }
          },
        }
      );

      return normalizeVariableFromCore(createdVariable as VariableState);
    } catch (error) {
      reportCommandError('VARIABLES', `createVariable(${name})`, error);
      throw error;
    }
  }, [crudContext, reportCommandError, stateRef, dispatch, optimisticManager]);

  const deleteVariable = useCallback(async (variableId: string) => {
    const previousVariable = state.variables.find(v => v.id === variableId);
    if (!previousVariable) {
      throw new Error(`Variable ${variableId} not found`);
    }

    try {
      await executeDeleteOptimistic(
        {
          optimisticManager,
          commandType: 'DELETE_VARIABLE',
          resourceId: variableId,
        },
        {
          applyOptimistic: () => {
            dispatch({
              type: 'SET_VARIABLES',
              payload: state.variables.filter(v => v.id !== variableId),
            });
          },
          rollback: () => {
            dispatch({
              type: 'SET_VARIABLES',
              payload: [...state.variables, previousVariable],
            });
          },
          send: () => CRUDActions.deleteVariable(crudContext, variableId, previousVariable.name),
        }
      );
    } catch (error) {
      reportCommandError('VARIABLES', `deleteVariable(${variableId})`, error);
      throw error;
    }
  }, [crudContext, state.variables, reportCommandError, dispatch, optimisticManager]);

  const updateVariable = useCallback(async (
    variableId: string,
    updates: Partial<Omit<Variable, 'id'>>,
  ) => {
    const previousVariable = state.variables.find(v => v.id === variableId);
    if (!previousVariable) {
      throw new Error(`Variable ${variableId} not found`);
    }

    const { optimistic: optimisticPayload, rollback: rollbackPayload } = 
      createVariableUpdatePayload(previousVariable, updates);

    try {
      await executeOptimisticUpdate(
        {
          optimisticManager,
          commandType: 'UPDATE_VARIABLE',
          resourceId: variableId,
        },
        {
          applyOptimistic: () => {
            dispatch({
              type: 'SET_VARIABLES',
              payload: state.variables.map((v) =>
                v.id === variableId
                  ? normalizeVariableFromCore({ ...v, ...optimisticPayload })
                  : v
              ),
            });
          },
          rollback: () => {
            dispatch({
              type: 'SET_VARIABLES',
              payload: state.variables.map((v) =>
                v.id === variableId
                  ? normalizeVariableFromCore({ ...v, ...rollbackPayload })
                  : v
              ),
            });
          },
          send: () => CRUDActions.updateVariable(crudContext, variableId, updates, previousVariable.name),
        }
      );
    } catch (error) {
      reportCommandError('VARIABLES', `updateVariable(${variableId})`, error);
      throw error;
    }
  }, [crudContext, state.variables, reportCommandError, dispatch, optimisticManager]);

  return {
    createGroup,
    deleteGroup,
    updateGroupConfig,
    createFlow,
    deleteFlow,
    updateFlowConfig,
    cloneGroup,
    cloneFlow,
    createVariable,
    deleteVariable,
    updateVariable,
  };
}
