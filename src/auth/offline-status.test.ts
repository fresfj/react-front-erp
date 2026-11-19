import { it, expect, describe } from 'vitest';

import { readNavigatorOnline } from './offline-status';

describe('readNavigatorOnline', () => {
  it('treats undefined as online (SSR / unknown)', () => {
    expect(readNavigatorOnline(undefined)).toBe(true);
  });

  it('mirrors boolean navigator.onLine', () => {
    expect(readNavigatorOnline(true)).toBe(true);
    expect(readNavigatorOnline(false)).toBe(false);
  });
});