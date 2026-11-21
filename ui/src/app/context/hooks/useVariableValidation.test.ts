import { describe, it, expect } from 'vitest';
import { useVariableValidation } from './useVariableValidation';
import { Variable } from '../../types';

describe('useVariableValidation', () => {
  const { validateConfig, detectCycle } = useVariableValidation();

  it('validates numeric config: min > max returns error', () => {
    const config = { min: 10, max: 5 };
    const errors = validateConfig('numeric', config);
    expect(errors.min).toBeDefined();
    expect(errors.max).toBeDefined();
  });

  it('validates numeric config: initialValue out of range', () => {
    const config = { min: 0, max: 10, initialValue: 15 };
    const errors = validateConfig('numeric', config);
    expect(errors.initialValue).toBeDefined();
  });

  it('validates string config: invalid regex', () => {
    const config = { regexPattern: '[' };
    const errors = validateConfig('string', config);
    expect(errors.regexPattern).toBeDefined();
  });

  it('detectCycle: detects self-reference cycle', () => {
    const variables: Variable[] = [];
    const cycle = detectCycle(variables, 'v1', 'A', '[A] + 1');
    expect(cycle).toEqual(['A', 'A']);
  });

  it('detectCycle: detects circular loop cycle', () => {
    const variables: Variable[] = [
      { id: 'v2', name: 'B', type: 'numeric', scope: 'global', config: { formula: '[A] + 2' } }
    ];
    const cycle = detectCycle(variables, 'v1', 'A', '[B] + 1');
    expect(cycle).toEqual(['A', 'B', 'A']);
  });

  it('detectCycle: returns null for linear chain', () => {
    const variables: Variable[] = [
      { id: 'v2', name: 'B', type: 'numeric', scope: 'global', config: { formula: '[C] + 2' } }
    ];
    const cycle = detectCycle(variables, 'v1', 'A', '[B] + 1');
    expect(cycle).toBeNull();
  });

  it('validates numeric config: negative step and step larger than the range', () => {
    expect(validateConfig('numeric', { step: -1 }).step).toBe('Step cannot be negative');
    expect(validateConfig('numeric', { min: 0, max: 5, step: 6 }).step).toBe('Step cannot exceed the range size');
    expect(validateConfig('numeric', { min: 0, max: 5, step: 2, initialValue: 3 })).toEqual({});
  });

  it('validates numeric config: custom distribution segments and weight', () => {
    const custom = { pattern: 'DISTRIBUTION', distributionType: 'CUSTOM' as const };
    expect(validateConfig('numeric', { ...custom }).customDistributionGraph)
      .toBe('Custom distribution requires at least one segment');
    expect(validateConfig('numeric', { ...custom, customDistributionGraph: [{ value: 1, weight: 0 }] }).customDistributionGraph)
      .toBe('Total distribution weight must be greater than zero');
    expect(validateConfig('numeric', { ...custom, customDistributionGraph: [{ value: 1, weight: 2 }] })).toEqual({});
  });

  it('validates numeric config: formula references to nonexistent variables, except pi and e', () => {
    const list: Variable[] = [{ id: 'v2', name: 'B', type: 'numeric', scope: 'global', config: {} }];
    expect(validateConfig('numeric', { pattern: 'FORMULA', formula: '[B] * [pi] + [E]' }, list)).toEqual({});
    expect(validateConfig('numeric', { pattern: 'FORMULA', formula: '[X] + [B] + [Y]' }, list).brokenReference)
      .toBe("Reference error: Variable 'Y' does not exist");
  });

  it('validates list, string and point configs', () => {
    expect(validateConfig('list', { items: [{ id: 'a', weight: -1 }] }).items).toBe('Weights cannot be negative');
    expect(validateConfig('list', { items: [{ id: 'a', weight: 1 }] })).toEqual({});
    expect(validateConfig('string', { fixedLength: 0 }).fixedLength).toBe('Fixed length must be greater than 0');
    expect(validateConfig('point', { maxStepDistance: -1 }).maxStepDistance)
      .toBe('Maximum step distance cannot be negative');
  });

  it('validates boolean config: probabilities and tick counts', () => {
    const errors = validateConfig('boolean', {
      trueProbability: 1.5,
      flipInterval: 0,
      burstDurationTicks: 0,
      burstIdleTicks: -1,
      pTrueToTrue: -0.1,
      pFalseToTrue: 2,
    });
    expect(Object.keys(errors).sort((a, b) => a.localeCompare(b))).toEqual([
      'burstDurationTicks', 'burstIdleTicks', 'flipInterval', 'pFalseToTrue', 'pTrueToTrue', 'trueProbability',
    ]);
    expect(validateConfig('boolean', { trueProbability: 0, pTrueToTrue: 1, flipInterval: 1, burstIdleTicks: 0 })).toEqual({});
  });

  it('validates the conditional rule targets of any type', () => {
    const list: Variable[] = [{ id: 'v2', name: 'B', type: 'numeric', scope: 'global', config: {} }];
    const rule = (targetVariable: string) => ({ targetVariable, operator: 'EQUALS' as const, value: 1, overrides: {} });
    expect(validateConfig('string', { conditionalRules: [rule(' B '), rule('  ')] }, list)).toEqual({});
    expect(validateConfig('temporal', { conditionalRules: [rule('ghost')] }, list).conditionalRuleTarget)
      .toBe("Reference error in rules: Variable 'ghost' does not exist");
  });
});
