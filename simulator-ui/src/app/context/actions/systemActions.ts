import type React from 'react';
import type { AppAction } from '../reducer';
import { CoreCommands } from '../../core/bridge';

export const startSystem = (
  dispatch: React.Dispatch<AppAction>,
  connectionMode: string,
  reportCommandError: (source: string, action: string, error: unknown) => void,
  getVariablesList?: () => any[],
) => async () => {
  if (getVariablesList) {
    const variables = getVariablesList();
    // 1. Dependency validation checking
    const errors: string[] = [];
    const varNames = new Set(variables.map(v => v.name));

    // Helper to resolve dependencies
    const getDeps = (formula?: string): string[] => {
      if (!formula) return [];
      const deps: string[] = [];
      const regex = /(?:\[|{{)([a-zA-Z0-9_-]+)(?:\]|}})/g;
      let match;
      while ((match = regex.exec(formula)) !== null) {
        deps.push(match[1]);
      }
      return deps;
    };

    // Check broken references
    for (const v of variables) {
      const config = v.config || {};
      if (v.type === 'numeric' && config.pattern === 'FORMULA' && config.formula) {
        const formulaDeps = getDeps(config.formula);
        for (const dep of formulaDeps) {
          if (dep.toLowerCase() !== 'pi' && dep.toLowerCase() !== 'e' && !varNames.has(dep)) {
            errors.push(`Variable '${v.name}' references nonexistent '${dep}' in its formula.`);
          }
        }
      }
      if (config.conditionalRules && Array.isArray(config.conditionalRules)) {
        for (const rule of config.conditionalRules) {
          if (rule.targetVariable && rule.targetVariable.trim()) {
            const target = rule.targetVariable.trim();
            if (!varNames.has(target)) {
              errors.push(`Variable '${v.name}' references nonexistent '${target}' in conditional rules.`);
            }
          }
        }
      }
    }

    // Check circular dependencies
    const detectCycle = (
      varsList: any[],
      currentVarId: string,
      currentVarName: string,
      formula?: string
    ): string[] | null => {
      const adjList = new Map<string, string[]>();
      for (const v of varsList) {
        if (v.id === currentVarId) {
          adjList.set(v.name, getDeps(formula));
        } else {
          adjList.set(v.name, getDeps(v.config?.formula));
        }
      }
      const visited = new Set<string>();
      const recStack = new Set<string>();
      const path: string[] = [];
      const dfs = (node: string): boolean => {
        visited.add(node);
        recStack.add(node);
        path.push(node);
        const neighbors = adjList.get(node) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            if (dfs(neighbor)) return true;
          } else if (recStack.has(neighbor)) {
            path.push(neighbor);
            return true;
          }
        }
        recStack.delete(node);
        path.pop();
        return false;
      };
      if (dfs(currentVarName)) {
        const idx = path.indexOf(path[path.length - 1]);
        return path.slice(idx);
      }
      return null;
    };

    for (const v of variables) {
      if (v.type === 'numeric' && v.config?.formula) {
        const cycle = detectCycle(variables, v.id, v.name, v.config.formula);
        if (cycle) {
          errors.push(`Circular dependency detected: ${cycle.join(' → ')}`);
        }
      }
    }

    if (errors.length > 0) {
      const firstErr = errors[0];
      const errorObj = new Error(firstErr);
      reportCommandError('SYSTEM', 'startSystem', errorObj);
      throw errorObj;
    }
  }

  try {
    if (connectionMode !== 'mock') {
      await CoreCommands.startSystem();
    }
    dispatch({ type: 'SET_SYSTEM_STATUS', payload: 'running' });
  } catch (error) {
    reportCommandError('SYSTEM', 'startSystem', error);
  }
};

export const stopSystem = (
  dispatch: React.Dispatch<AppAction>,
  connectionMode: string,
  reportCommandError: (source: string, action: string, error: unknown) => void,
) => async () => {
  try {
    if (connectionMode !== 'mock') {
      await CoreCommands.stopSystem();
    }
    dispatch({ type: 'SET_SYSTEM_STATUS', payload: 'stopped' });
  } catch (error) {
    reportCommandError('SYSTEM', 'stopSystem', error);
  }
};

export const toggleSystem = (
  systemStatus: string,
  startFn: () => Promise<void>,
  stopFn: () => Promise<void>,
) => async () => {
  if (systemStatus === 'stopped') {
    await startFn();
  } else {
    await stopFn();
  }
};
