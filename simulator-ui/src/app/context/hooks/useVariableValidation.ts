import { Variable, VariableConfig } from '../../types';

export interface ValidationErrors {
  [field: string]: string;
}

export function useVariableValidation() {
  const validateConfig = (type: string, config: VariableConfig, variablesList: Variable[] = []): ValidationErrors => {
    const errors: ValidationErrors = {};

    // General validation for formulas and conditional rules dependencies/nonexistent variables
    const checkDependenciesExist = (text?: string) => {
      if (!text) return;
      const deps = getDependencies(text);
      for (const dep of deps) {
        // Simple constants like pi or e are exceptions
        if (dep.toLowerCase() === 'pi' || dep.toLowerCase() === 'e') continue;
        const exists = variablesList?.some(v => v.name === dep);
        if (!exists) {
          errors.brokenReference = `Reference error: Variable '${dep}' does not exist`;
        }
      }
    };

    if (type === 'numeric') {
      const min = config.min !== undefined ? Number(config.min) : undefined;
      const max = config.max !== undefined ? Number(config.max) : undefined;
      const initial = config.initialValue !== undefined ? Number(config.initialValue) : undefined;
      const step = config.step !== undefined ? Number(config.step) : undefined;

      if (min !== undefined && max !== undefined && min > max) {
        errors.min = 'min must be less than or equal to max';
        errors.max = 'max must be greater than or equal to min';
      }

      if (initial !== undefined && min !== undefined && max !== undefined) {
        if (initial < min || initial > max) {
          errors.initialValue = `Initial value must be in range [${min}, ${max}]`;
        }
      }

      if (step !== undefined) {
        if (step < 0) {
          errors.step = 'Step cannot be negative';
        }
        if (min !== undefined && max !== undefined && step > (max - min)) {
          errors.step = 'Step cannot exceed the range size';
        }
      }

      if (config.pattern === 'FORMULA') {
        checkDependenciesExist(config.formula);
      }

      if (config.pattern === 'DISTRIBUTION' && config.distributionType === 'CUSTOM') {
        if (!config.customDistributionGraph || config.customDistributionGraph.length === 0) {
          errors.customDistributionGraph = 'Custom distribution requires at least one segment';
        } else {
          const totalWeight = config.customDistributionGraph.reduce((acc: number, val: { weight?: number }) => acc + (val.weight || 0), 0);
          if (totalWeight <= 0) {
            errors.customDistributionGraph = 'Total distribution weight must be greater than zero';
          }
        }
      }
    } else if (type === 'list') {
      if (config.items && config.items.length > 0) {
        const hasNegativeWeight = config.items.some(
          (item: any) => typeof item === 'object' && item !== null && item.weight < 0
        );
        if (hasNegativeWeight) {
          errors.items = 'Weights cannot be negative';
        }
      }
    } else if (type === 'string') {
      if (config.fixedLength !== undefined && config.fixedLength <= 0) {
        errors.fixedLength = 'Fixed length must be greater than 0';
      }
      if (config.regexPattern) {
        try {
          new RegExp(config.regexPattern);
        } catch (e: any) {
          errors.regexPattern = `Invalid regular expression: ${e.message}`;
        }
      }
    } else if (type === 'point') {
      if (config.maxStepDistance !== undefined && config.maxStepDistance < 0) {
        errors.maxStepDistance = 'Maximum step distance cannot be negative';
      }
    }

    // Validate conditional rules targets exist
    if (config.conditionalRules && Array.isArray(config.conditionalRules)) {
      for (const rule of config.conditionalRules) {
        if (rule.targetVariable && rule.targetVariable.trim()) {
          const exists = variablesList?.some(v => v.name === rule.targetVariable.trim());
          if (!exists) {
            errors.conditionalRuleTarget = `Reference error in rules: Variable '${rule.targetVariable}' does not exist`;
          }
        }
      }
    }

    return errors;
  };

  const getDependencies = (formula?: string): string[] => {
    if (!formula) return [];
    const deps: string[] = [];
    const regex = /(?:\[|{{)([a-zA-Z0-9_-]+)(?:\]|}})/g;
    let match;
    while ((match = regex.exec(formula)) !== null) {
      deps.push(match[1]);
    }
    return deps;
  };

  const detectCycle = (
    variables: Variable[],
    currentVarId: string,
    currentVarName: string,
    formula?: string
  ): string[] | null => {
    const adjList: Map<string, string[]> = new Map();
    const idToName: Map<string, string> = new Map();

    // Map names to lists of dependencies
    for (const v of variables) {
      idToName.set(v.id, v.name);
      if (v.id === currentVarId) {
        adjList.set(v.name, getDependencies(formula));
      } else {
        adjList.set(v.name, getDependencies((v.config as any).formula));
      }
    }

    if (!idToName.has(currentVarId)) {
      idToName.set(currentVarId, currentVarName);
      adjList.set(currentVarName, getDependencies(formula));
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
      const cycleStartIdx = path.indexOf(path[path.length - 1]);
      return path.slice(cycleStartIdx);
    }

    return null;
  };

  return {
    validateConfig,
    detectCycle,
    getDependencies
  };
}
