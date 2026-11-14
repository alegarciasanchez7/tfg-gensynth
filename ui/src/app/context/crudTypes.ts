/**
 * Option objects of the CRUD actions, shared by the context, its hooks and the components
 * that call them (instead of long positional parameter lists).
 */

import type { Flow, Group, VariableScope, VariableType } from '../types';

/** Fields of a group that an update may change. */
export type GroupConfigUpdate = Partial<Omit<Group, 'id' | 'flows'>>;

/** Fields of a flow that an update may change (runtime metrics are owned by the Core). */
export type FlowConfigUpdate = Partial<Omit<Flow, 'id' | 'connectionStatus' | 'throughput' | 'hasError' | 'errorMessage'>> & { template?: string };

/** What a new flow is created with. Only `name` and `technology` are validated as required. */
export interface CreateFlowOptions {
  name: string;
  technology: string;
  /** Legacy: the destination is part of the connector configuration. */
  host: string;
  /** Legacy: the destination is part of the connector configuration. */
  port: number;
  /** Legacy: the destination is part of the connector configuration. */
  topic?: string;
  /** Legacy publish interval in ms (generation is paced by the global tick clock). Default 1000. */
  interval?: number;
  /** Legacy messages per send (one message every N ticks). Default 1. */
  burst?: number;
  /** Message template. Default `{}`. */
  template?: string;
  connectorConfig?: Record<string, unknown>;
  /** Global ticks between two messages of the flow. Default 1. */
  everyTicks?: number;
  /** Rename a name already used in the group instead of failing (Repeater). */
  autoRename?: boolean;
}

/** Creates a flow in a group and resolves with the created flow (with its final name and id). */
export type CreateFlowHandler = (groupId: string, options: CreateFlowOptions) => Promise<Flow>;

/** What a new variable is created with. */
export interface CreateVariableOptions {
  name: string;
  type: VariableType;
  scope: VariableScope;
  config?: Record<string, unknown>;
  flowId?: string;
  groupId?: string;
  /** Id chosen by the UI (optimistic id); the Core generates one when missing. */
  variableId?: string;
}
