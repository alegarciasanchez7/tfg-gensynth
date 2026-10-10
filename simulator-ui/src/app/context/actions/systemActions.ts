import type React from 'react';
import type { AppAction } from '../reducer';
import { CoreCommands } from '../../core/bridge';

export const startSystem = (
  dispatch: React.Dispatch<AppAction>,
  connectionMode: string,
  reportCommandError: (source: string, action: string, error: unknown) => void,
  getVariablesList?: () => any[],
  getGroupsList?: () => any[],
  getFormatTemplates?: () => Record<string, string>,
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

    // Check flow template item references for non-FIXED_SUBSET list strategies
    if (getGroupsList) {
      const groups = getGroupsList();
      const formatTemplates = getFormatTemplates ? getFormatTemplates() : {};
      for (const group of groups || []) {
        for (const flow of group.flows || []) {
          const template = formatTemplates[flow.id] ?? flow.template ?? '';
          if (!template) continue;

          const regex = /\{\{([^}]+)\}\}/g;
          let match;
          while ((match = regex.exec(template)) !== null) {
            const fullSpec = match[1].trim();
            if (['uuid', 'ts', 'n'].includes(fullSpec)) continue;

            let scope: string | null = null;
            let name = fullSpec;
            let isItemAccess = false;

            if (fullSpec.includes('.')) {
              const parts = fullSpec.split('.');
              if (parts.length >= 3 && parts[parts.length - 1].toLowerCase().startsWith('item')) {
                scope = parts[0].toLowerCase();
                name = parts[1];
                isItemAccess = true;
              } else if (parts.length === 2 && parts[1].toLowerCase().startsWith('item')) {
                scope = null;
                name = parts[0];
                isItemAccess = true;
              }
            }

            if (isItemAccess) {
              const targetVar = variables.find((v: any) => {
                if (v.name !== name) return false;
                if (scope && v.scope !== scope) return false;
                if (v.scope === 'global') return true;
                if (v.scope === 'group') return v.groupId === group.id;
                if (v.scope === 'local') return v.flowId === flow.id;
                return false;
              });

              if (targetVar && targetVar.type === 'list') {
                const strategy = targetVar.config?.selectionStrategy;
                if (strategy && strategy !== 'FIXED_SUBSET') {
                  errors.push(
                    `Invalid item reference in flow '${flow.name}': Variable '${targetVar.name}' uses strategy '${strategy}' (not 'FIXED_SUBSET') and cannot be referenced with sub-item index (.itemX).`
                  );
                }
              }
            }
          }
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
