import type {
  BooleanVariableConfig,
  ListVariableConfig,
  NumericVariableConfig,
  PointVariableConfig,
  StringVariableConfig,
  Variable,
  VariableConfig,
} from '../../types';
import { formulaDependencies } from '../actions/startValidation';

export interface ValidationErrors {
  [field: string]: string;
}

/** Variable names referenced by a formula, as `[name]` or `{{name}}`, in order. */
const getDependencies = formulaDependencies;

/** The value of an optional numeric field as a number, or undefined when it is not set. */
function optionalNumber(value: unknown): number | undefined {
  return value === undefined ? undefined : Number(value);
}

/** Whether a set probability is outside [0, 1]. */
function isInvalidProbability(value: number | undefined): boolean {
  return value !== undefined && (value < 0 || value > 1);
}

/**
 * Records a reference error for every formula dependency that is not a variable of the list
 * (pi and e are constants). The last missing dependency wins.
 */
function checkDependenciesExist(errors: ValidationErrors, variablesList: Variable[], text?: string): void {
  if (!text) return;
  for (const dep of getDependencies(text)) {
    // Simple constants like pi or e are exceptions
    if (dep.toLowerCase() === 'pi' || dep.toLowerCase() === 'e') continue;
    const exists = variablesList?.some(v => v.name === dep);
    if (!exists) {
      errors.brokenReference = `Reference error: Variable '${dep}' does not exist`;
    }
  }
}

/** Errors of the min, max, initial value and step of a numeric config. */
function validateNumericRange(config: NumericVariableConfig, errors: ValidationErrors): void {
  const min = optionalNumber(config.min);
  const max = optionalNumber(config.max);
  const initial = optionalNumber(config.initialValue);
  const step = optionalNumber(config.step);
  const hasRange = min !== undefined && max !== undefined;

  if (hasRange && min > max) {
    errors.min = 'min must be less than or equal to max';
    errors.max = 'max must be greater than or equal to min';
  }

  if (initial !== undefined && hasRange && (initial < min || initial > max)) {
    errors.initialValue = `Initial value must be in range [${min}, ${max}]`;
  }

  if (step !== undefined) {
    if (step < 0) {
      errors.step = 'Step cannot be negative';
    }
    if (hasRange && step > (max - min)) {
      errors.step = 'Step cannot exceed the range size';
    }
  }
}

/** Errors of the custom distribution graph of a numeric config. */
function validateCustomDistribution(config: NumericVariableConfig, errors: ValidationErrors): void {
  if (!config.customDistributionGraph || config.customDistributionGraph.length === 0) {
    errors.customDistributionGraph = 'Custom distribution requires at least one segment';
    return;
  }
  const totalWeight = config.customDistributionGraph.reduce((acc: number, val: { weight?: number }) => acc + (val.weight || 0), 0);
  if (totalWeight <= 0) {
    errors.customDistributionGraph = 'Total distribution weight must be greater than zero';
  }
}

function validateNumeric(config: NumericVariableConfig, errors: ValidationErrors, variablesList: Variable[]): void {
  validateNumericRange(config, errors);
  if (config.pattern === 'FORMULA') {
    checkDependenciesExist(errors, variablesList, config.formula);
  }
  if (config.pattern === 'DISTRIBUTION' && config.distributionType === 'CUSTOM') {
    validateCustomDistribution(config, errors);
  }
}

function validateList(config: ListVariableConfig, errors: ValidationErrors): void {
  if (!config.items || config.items.length === 0) return;
  const hasNegativeWeight = config.items.some(
    (item: any) => typeof item === 'object' && item !== null && item.weight < 0
  );
  if (hasNegativeWeight) {
    errors.items = 'Weights cannot be negative';
  }
}

function validateString(config: StringVariableConfig, errors: ValidationErrors): void {
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
}

function validatePoint(config: PointVariableConfig, errors: ValidationErrors): void {
  if (config.maxStepDistance !== undefined && config.maxStepDistance < 0) {
    errors.maxStepDistance = 'Maximum step distance cannot be negative';
  }
}

function validateBoolean(config: BooleanVariableConfig, errors: ValidationErrors): void {
  if (isInvalidProbability(config.trueProbability)) {
    errors.trueProbability = 'Probability must be between 0.0 and 1.0';
  }
  if (config.flipInterval !== undefined && config.flipInterval <= 0) {
    errors.flipInterval = 'Flip interval must be greater than zero';
  }
  if (config.burstDurationTicks !== undefined && config.burstDurationTicks <= 0) {
    errors.burstDurationTicks = 'Burst duration must be greater than zero';
  }
  if (config.burstIdleTicks !== undefined && config.burstIdleTicks < 0) {
    errors.burstIdleTicks = 'Burst idle duration cannot be negative';
  }
  if (isInvalidProbability(config.pTrueToTrue)) {
    errors.pTrueToTrue = 'Probability must be between 0.0 and 1.0';
  }
  if (isInvalidProbability(config.pFalseToTrue)) {
    errors.pFalseToTrue = 'Probability must be between 0.0 and 1.0';
  }
}

/** Records a reference error for every conditional rule whose target is not a variable (the last wins). */
function validateConditionalRuleTargets(config: VariableConfig, errors: ValidationErrors, variablesList: Variable[]): void {
  if (!config.conditionalRules || !Array.isArray(config.conditionalRules)) return;
  for (const rule of config.conditionalRules) {
    if (!rule.targetVariable?.trim()) continue;
    const exists = variablesList?.some(v => v.name === rule.targetVariable.trim());
    if (!exists) {
      errors.conditionalRuleTarget = `Reference error in rules: Variable '${rule.targetVariable}' does not exist`;
    }
  }
}

/** Validation errors of a variable config, by field (empty when the config is valid). */
function validateConfig(type: string, config: VariableConfig, variablesList: Variable[] = []): ValidationErrors {
  const errors: ValidationErrors = {};

  if (type === 'numeric') {
    validateNumeric(config as NumericVariableConfig, errors, variablesList);
  } else if (type === 'list') {
    validateList(config as ListVariableConfig, errors);
  } else if (type === 'string') {
    validateString(config as StringVariableConfig, errors);
  } else if (type === 'point') {
    validatePoint(config as PointVariableConfig, errors);
  } else if (type === 'boolean') {
    validateBoolean(config as BooleanVariableConfig, errors);
  }

  // Validate conditional rules targets exist
  validateConditionalRuleTargets(config, errors, variablesList);

  return errors;
}

/**
 * The formula dependency cycle that goes through the current variable (its name first and last),
 * or null. The current variable uses the given formula instead of the saved one.
 */
function detectCycle(
  variables: Variable[],
  currentVarId: string,
  currentVarName: string,
  formula?: string
): string[] | null {
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
}

export function useVariableValidation() {
  return {
    validateConfig,
    detectCycle,
    getDependencies
  };
}
