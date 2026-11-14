import { describe, expect, it } from 'vitest';
import type { Variable, VariableConfig } from '../../../types';
import { hasFormulaCycleFrom, hasPreStartErrors } from './preStartCheck';
import { formulaDependencies } from '../../../context/actions/startValidation';

function numeric(name: string, config: VariableConfig = {}): Variable {
  return { id: `id-${name}`, name, type: 'numeric', scope: 'global', config };
}

function formula(name: string, expression: string): Variable {
  return numeric(name, { pattern: 'FORMULA', formula: expression });
}

describe('formulaDependencies', () => {
  it('returns the names in [name] and {{name}} references, in order', () => {
    expect(formulaDependencies('[a] + {{b-c}} * [a]')).toEqual(['a', 'b-c', 'a']);
  });

  it('returns nothing for an empty or missing formula', () => {
    expect(formulaDependencies()).toEqual([]);
    expect(formulaDependencies('')).toEqual([]);
    expect(formulaDependencies('1 + 2')).toEqual([]);
  });
});

describe('hasFormulaCycleFrom', () => {
  it('detects a cycle that goes back to the start variable', () => {
    const vars = [formula('a', '[b] + 1'), formula('b', '[a] * 2')];
    expect(hasFormulaCycleFrom(vars, vars[0])).toBe(true);
  });

  it('detects a self reference', () => {
    const vars = [formula('a', '[a] + 1')];
    expect(hasFormulaCycleFrom(vars, vars[0])).toBe(true);
  });

  it('accepts a chain without cycles', () => {
    const vars = [formula('a', '[b] + 1'), formula('b', '[c]'), numeric('c')];
    expect(hasFormulaCycleFrom(vars, vars[0])).toBe(false);
  });
});

describe('hasPreStartErrors', () => {
  it('is false without variables', () => {
    expect(hasPreStartErrors([])).toBe(false);
  });

  it('is false when every reference exists and there is no cycle', () => {
    expect(hasPreStartErrors([formula('a', '[b] * pi + [E]'), numeric('b')])).toBe(false);
  });

  it('flags a formula that references a missing variable', () => {
    expect(hasPreStartErrors([formula('a', '[missing] + 1')])).toBe(true);
  });

  it('ignores the formula text when the pattern is not FORMULA', () => {
    expect(hasPreStartErrors([numeric('a', { pattern: 'RANDOM', formula: '[missing]' })])).toBe(false);
  });

  it('flags a conditional rule whose target does not exist', () => {
    const rules: VariableConfig = {
      conditionalRules: [{ targetVariable: ' ghost ', operator: 'EQUALS', value: 1, overrides: {} }],
    };
    expect(hasPreStartErrors([numeric('a', rules)])).toBe(true);
  });

  it('accepts conditional rules with an existing or blank target', () => {
    const rules: VariableConfig = {
      conditionalRules: [
        { targetVariable: ' b ', operator: 'EQUALS', value: 1, overrides: {} },
        { targetVariable: '  ', operator: 'EQUALS', value: 1, overrides: {} },
      ],
    };
    expect(hasPreStartErrors([numeric('a', rules), numeric('b')])).toBe(false);
  });

  it('flags a circular formula dependency', () => {
    expect(hasPreStartErrors([formula('a', '[b]'), formula('b', '[a]')])).toBe(true);
  });
});
