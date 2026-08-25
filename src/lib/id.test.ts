import { describe, expect, it } from 'vitest';
import { makeId } from './id';

describe('makeId', () => {
  it('creates unique UUID-shaped identifiers', () => {
    const first = makeId();
    const second = makeId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });
});
