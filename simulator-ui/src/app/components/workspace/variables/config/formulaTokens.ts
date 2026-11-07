import { findTemplatePlaceholders } from '../../../../core/templatePlaceholders';

/** A token of a numeric formula: a `{{...}}` reference or a bare `pi` / `e` constant. */
export interface FormulaMatch {
  kind: 'reference' | 'constant';
  start: number;
  end: number;
  /** Matched text, braces included for references. */
  text: string;
}

/**
 * Splits a numeric formula into its `{{...}}` references and bare `pi` / `e` constants, with the
 * same results as the regex `/(\{\{[^}]+\}\})|\b(pi|e)\b/gi` but without its backtracking.
 */
export const findFormulaMatches = (formula: string): FormulaMatch[] => {
  const matches: FormulaMatch[] = [];
  const references = findTemplatePlaceholders(formula);
  const constantRegex = /\b(?:pi|e)\b/gi;
  let position = 0;
  // Index of the first reference not consumed yet. A constant never overlaps a reference ('{' is not
  // a word character), so the references are consumed in order.
  let next = 0;
  while (position < formula.length) {
    const reference = next < references.length ? references[next] : null;
    constantRegex.lastIndex = position;
    const constant = constantRegex.exec(formula);
    if (constant && (!reference || constant.index < reference.start)) {
      const end = constant.index + constant[0].length;
      matches.push({ kind: 'constant', start: constant.index, end, text: constant[0] });
      position = end;
    } else if (reference) {
      matches.push({ kind: 'reference', start: reference.start, end: reference.end, text: formula.slice(reference.start, reference.end) });
      position = reference.end;
      next++;
    } else {
      break;
    }
  }
  return matches;
};
