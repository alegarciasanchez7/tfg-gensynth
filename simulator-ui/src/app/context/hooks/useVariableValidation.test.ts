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
});
