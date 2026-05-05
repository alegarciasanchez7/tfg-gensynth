/**
 * CRUD Actions for AppContext
 * 
 * Defines functions for create, update, and delete operations on:
 * - Groups
 * - Flows
 * - Variables
 * 
 * All actions include:
 * - Input validation
 * - Error handling
 * - Logging
 * - Reducer action dispatch
 */

import type React from 'react';
import bridge from '../core/bridge';
import type { Group, Flow, Variable } from '../types';
import type { OptimisticManager } from './optimisticManager';

// ─────────────────────────────────────────────────────────────
// Helper Types
// ─────────────────────────────────────────────────────────────

export interface CRUDError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface CRUDActionContext {
  dispatch: React.Dispatch<any>;
  reportError: (source: string, action: string, error: unknown) => void;
  connectionMode: 'websocket' | 'jcef' | 'mock';
  optimisticManager: OptimisticManager | null;
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function throwValidationError(field: string, reason: string): never {
  throw new Error(`Validation failed: ${field} ${reason}`);
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function extractCommandError(error: unknown): CRUDError {
  if (error instanceof Error) {
    const message = error.message;
    
    // Parse backend errors if they include a code
    if (message.includes('NOT_FOUND')) {
      return { code: 'NOT_FOUND', message: 'Resource not found' };
    }
    if (message.includes('INVALID_PAYLOAD')) {
      return { code: 'INVALID_PAYLOAD', message: 'Invalid data' };
    }
    if (message.includes('DUPLICATE')) {
      return { code: 'DUPLICATE', message: 'Resource already exists' };
    }
    if (message.includes('INVALID_CONNECTOR')) {
      return { code: 'INVALID_CONNECTOR', message: 'Invalid connector' };
    }
    
    return { code: 'UNKNOWN_ERROR', message };
  }
  return { code: 'UNKNOWN_ERROR', message: String(error) };
}

// ─────────────────────────────────────────────────────────────
// GROUPS: Create, Update, Delete
// ─────────────────────────────────────────────────────────────

/**
 * Create a new group
 */
export async function createGroup(
  ctx: CRUDActionContext,
  name: string,
  description?: string,
): Promise<Group> {
  // Validations
  if (!name?.trim()) {
    throwValidationError('name', 'is required and cannot be empty');
  }

  try {
    if (ctx.connectionMode !== 'mock') {
      const response = await bridge.send('CREATE_GROUP', {
        name: name.trim(),
        description: description?.trim() || '',
      });
      
      // Backend returns the created group or just confirms
      // We expect the groups-update event to fire
      if (response && typeof response === 'object' && 'id' in response) {
        return response as Group;
      }
    }

    // For mock mode, create locally
    const groupId = generateId();
    const newGroup: Group = {
      id: groupId,
      name: name.trim(),
      description: description?.trim() || '',
      status: 'stopped',
      throughput: '0 msg/s',
      threads: 1,
      outputMode: 'serial',
      expanded: true,
      flows: [],
    };

    ctx.dispatch({ type: 'SET_GROUPS', payload: [newGroup] });
    return newGroup;
  } catch (error) {
    const err = extractCommandError(error);
    ctx.reportError('GROUPS', `createGroup(${name})`, error);
    throw err;
  }
}

/**
 * Update group configuration
 */
export async function updateGroupConfig(
  ctx: CRUDActionContext,
  groupId: string,
  config: Partial<Omit<Group, 'id' | 'flows'>>,
): Promise<void> {
  if (!groupId?.trim()) {
    throwValidationError('groupId', 'is required');
  }

  try {
    if (ctx.connectionMode !== 'mock') {
      await bridge.send('UPDATE_GROUP_CONFIG', {
        groupId: groupId.trim(),
        ...config,
      });
    }

    ctx.dispatch({
      type: 'UPDATE_GROUP',
      payload: { id: groupId, ...config },
    });
  } catch (error) {
    ctx.reportError('GROUPS', `updateGroupConfig(${groupId})`, error);
    throw extractCommandError(error);
  }
}

/**
 * Delete a group
 */
export async function deleteGroup(
  ctx: CRUDActionContext,
  groupId: string,
): Promise<void> {
  if (!groupId?.trim()) {
    throwValidationError('groupId', 'is required');
  }

  try {
    if (ctx.connectionMode !== 'mock') {
      await bridge.send('DELETE_GROUP', {
        groupId: groupId.trim(),
      });
    }

    // Local state reconciliation is handled by AppContext.
  } catch (error) {
    ctx.reportError('GROUPS', `deleteGroup(${groupId})`, error);
    throw extractCommandError(error);
  }
}

// ─────────────────────────────────────────────────────────────
// FLOWS: Create, Update, Delete
// ─────────────────────────────────────────────────────────────

/**
 * Create a new flow within a group
 */
export async function createFlow(
  ctx: CRUDActionContext,
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
): Promise<Flow> {
  // Validations
  if (!groupId?.trim()) throwValidationError('groupId', 'is required');
  if (!name?.trim()) throwValidationError('name', 'is required');
  if (!technology?.trim()) throwValidationError('technology', 'is required');
  if (!host?.trim()) throwValidationError('host', 'is required');
  if (typeof port !== 'number' || port <= 0 || port > 65535) {
    throwValidationError('port', 'must be a number between 1 and 65535');
  }

  try {
    if (ctx.connectionMode !== 'mock') {
      const response = await bridge.send('CREATE_FLOW', {
        groupId: groupId.trim(),
        name: name.trim(),
        technology: technology.trim(),
        host: host.trim(),
        port,
        topic: topic?.trim() || '',
        interval: interval ?? 1000,
        burst: burst ?? 1,
        template: template || '{}',
        ...(connectorConfig && { connectorConfig }),
      });

      if (response && typeof response === 'object' && 'id' in response) {
        return response as Flow;
      }
    }

    // For mock mode
    const flowId = generateId();
    const newFlow: Flow = {
      id: flowId,
      name: name.trim(),
      technology: technology.trim(),
      connectionStatus: 'disconnected',
      throughput: '0 msg/s',
      hasError: false,
      errorMessage: undefined,
      interval: interval ?? 1000,
      burst: burst ?? 1,
      topic: topic?.trim() || '',
      host: host.trim(),
      port,
    };

    return newFlow;
  } catch (error) {
    ctx.reportError('FLOWS', `createFlow(${name})`, error);
    throw extractCommandError(error);
  }
}

/**
 * Update flow configuration
 */
export async function updateFlowConfig(
  ctx: CRUDActionContext,
  groupId: string,
  flowId: string,
  config: Partial<Omit<Flow, 'id' | 'connectionStatus' | 'throughput' | 'hasError' | 'errorMessage'>> & { template?: string },
): Promise<void> {
  if (!groupId?.trim()) throwValidationError('groupId', 'is required');
  if (!flowId?.trim()) throwValidationError('flowId', 'is required');

  try {
    if (ctx.connectionMode !== 'mock') {
      await bridge.send('UPDATE_FLOW_CONFIG', {
        groupId: groupId.trim(),
        flowId: flowId.trim(),
        ...config,
      });
    }

    // Wait for groups-update event to update
    ctx.dispatch({
      type: 'ADD_LOG',
      payload: {
        id: `flow_update_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        level: 'info',
        source: 'FLOWS',
        message: `Flow ${flowId} configuration updated`,
      },
    });
  } catch (error) {
    ctx.reportError('FLOWS', `updateFlowConfig(${flowId})`, error);
    throw extractCommandError(error);
  }
}

/**
 * Delete a flow
 */
export async function deleteFlow(
  ctx: CRUDActionContext,
  groupId: string,
  flowId: string,
): Promise<void> {
  if (!groupId?.trim()) throwValidationError('groupId', 'is required');
  if (!flowId?.trim()) throwValidationError('flowId', 'is required');

  try {
    if (ctx.connectionMode !== 'mock') {
      await bridge.send('DELETE_FLOW', {
        groupId: groupId.trim(),
        flowId: flowId.trim(),
      });
    }

    ctx.dispatch({
      type: 'ADD_LOG',
      payload: {
        id: `flow_delete_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        level: 'info',
        source: 'FLOWS',
        message: `Flow ${flowId} deleted`,
      },
    });
  } catch (error) {
    ctx.reportError('FLOWS', `deleteFlow(${flowId})`, error);
    throw extractCommandError(error);
  }
}

// ─────────────────────────────────────────────────────────────
// VARIABLES: Create, Update, Delete
// ─────────────────────────────────────────────────────────────

/**
 * Create a new system variable
 */
export async function createVariable(
  ctx: CRUDActionContext,
  name: string,
  type: 'numeric' | 'string' | 'boolean' | 'temporal' | 'point' | 'list',
  scope: 'global' | 'group' | 'local',
  config?: Record<string, unknown>,
  variableId?: string,
): Promise<Variable> {
  // Validations
  if (!name?.trim()) throwValidationError('name', 'is required');
  const validTypes = ['numeric', 'string', 'boolean', 'temporal', 'point', 'list'];
  if (!validTypes.includes(type)) {
    throwValidationError('type', `must be one of: ${validTypes.join(', ')}`);
  }
  const validScopes = ['global', 'group', 'local'];
  if (!validScopes.includes(scope)) {
    throwValidationError('scope', `must be one of: ${validScopes.join(', ')}`);
  }

  try {
    if (ctx.connectionMode !== 'mock') {
      const response = await bridge.send('CREATE_VARIABLE', {
        name: name.trim(),
        type,
        scope,
        config: config || {},
      });

      if (response && typeof response === 'object' && 'id' in response) {
        return response as Variable;
      }
    }

    const generatedId = variableId ?? generateId();
    const newVariable: Variable = {
      id: generatedId,
      name: name.trim(),
      type,
      scope,
      config: config || {},
    };

    return newVariable;
  } catch (error) {
    ctx.reportError('VARIABLES', `createVariable(${name})`, error);
    throw extractCommandError(error);
  }
}

/**
 * Update an existing variable
 */
export async function updateVariable(
  ctx: CRUDActionContext,
  variableId: string,
  updates: Partial<Omit<Variable, 'id'>>,
): Promise<void> {
  if (!variableId?.trim()) {
    throwValidationError('variableId', 'is required');
  }

  try {
    if (ctx.connectionMode !== 'mock') {
      await bridge.send('UPDATE_VARIABLE', {
        variableId: variableId.trim(),
        ...updates,
      });
    }

    // Wait for variables update event
    ctx.dispatch({
      type: 'ADD_LOG',
      payload: {
        id: `var_update_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        level: 'info',
        source: 'VARIABLES',
        message: `Variable ${variableId} updated`,
      },
    });
  } catch (error) {
    ctx.reportError('VARIABLES', `updateVariable(${variableId})`, error);
    throw extractCommandError(error);
  }
}

/**
 * Delete a variable
 */
export async function deleteVariable(
  ctx: CRUDActionContext,
  variableId: string,
): Promise<void> {
  if (!variableId?.trim()) {
    throwValidationError('variableId', 'is required');
  }

  try {
    if (ctx.connectionMode !== 'mock') {
      await bridge.send('DELETE_VARIABLE', {
        variableId: variableId.trim(),
      });
    }

    ctx.dispatch({
      type: 'ADD_LOG',
      payload: {
        id: `var_delete_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        level: 'info',
        source: 'VARIABLES',
        message: `Variable ${variableId} deleted`,
      },
    });
  } catch (error) {
    ctx.reportError('VARIABLES', `deleteVariable(${variableId})`, error);
    throw extractCommandError(error);
  }
}
