import { describe, expect, it } from 'vitest';
import { commandErrorMessage } from './errorMessage';

describe('commandErrorMessage', () => {
  it('reads the message of an Error, a CRUD error object or a string', () => {
    expect(commandErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
    expect(commandErrorMessage({ code: 'UNKNOWN_ERROR', message: 'A flow named "S" already exists in this group' }, 'fallback'))
      .toBe('A flow named "S" already exists in this group');
    expect(commandErrorMessage('plain text', 'fallback')).toBe('plain text');
  });

  it('falls back when there is no message', () => {
    expect(commandErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(commandErrorMessage({ code: 'X' }, 'fallback')).toBe('fallback');
    expect(commandErrorMessage({ message: ' ' }, 'fallback')).toBe('fallback');
  });
});
