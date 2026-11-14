import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { resyncNumber, resyncOptionalNumber, resyncText, useFieldDraft } from './useFieldDraft';

describe('resync rules', () => {
  it('resyncNumber keeps a draft that already parses to the value', () => {
    expect(resyncNumber(10, '10.')).toBeNull();
    expect(resyncNumber(10, '9')).toBe('10');
    expect(resyncNumber(undefined, '9')).toBeNull();
  });

  it('resyncOptionalNumber clears the draft when the value is removed', () => {
    expect(resyncOptionalNumber(undefined, '5')).toBe('');
    expect(resyncOptionalNumber(null, '5')).toBe('');
    expect(resyncOptionalNumber(5, '5.0')).toBeNull();
    expect(resyncOptionalNumber(7, '5')).toBe('7');
  });

  it('resyncText replaces a different draft and ignores a missing value', () => {
    expect(resyncText('kg', 'k')).toBe('kg');
    expect(resyncText('kg', 'kg')).toBeNull();
    expect(resyncText(undefined, 'k')).toBeNull();
  });
});

describe('useFieldDraft', () => {
  it('keeps the typed draft until the value changes from outside', () => {
    const { result, rerender } = renderHook(({ value }) => useFieldDraft(value, String(value), resyncNumber), {
      initialProps: { value: 10 as number | undefined },
    });
    expect(result.current[0]).toBe('10');

    act(() => result.current[1]('10.'));
    rerender({ value: 10 });
    expect(result.current[0]).toBe('10.');

    rerender({ value: 25 });
    expect(result.current[0]).toBe('25');
  });

  it('does not touch the draft when the value is unchanged', () => {
    const { result, rerender } = renderHook(({ value }) => useFieldDraft(value, '', resyncText), {
      initialProps: { value: 'a' as string | undefined },
    });
    act(() => result.current[1]('typed'));
    rerender({ value: 'a' });
    expect(result.current[0]).toBe('typed');
  });
});
