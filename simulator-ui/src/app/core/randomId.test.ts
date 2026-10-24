import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from './randomId';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUUID', () => {
  const original = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');

  afterEach(() => {
    if (original) Object.defineProperty(crypto, 'randomUUID', original);
  });

  it('returns version 4 UUIDs', () => {
    for (let i = 0; i < 100; i++) expect(randomUUID()).toMatch(UUID_V4);
  });

  it('does not repeat ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => randomUUID()));
    expect(ids.size).toBe(1000);
  });

  it('works where crypto.randomUUID is missing, as in the desktop app (insecure context)', () => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });

    expect(randomUUID()).toMatch(UUID_V4);
  });
});
