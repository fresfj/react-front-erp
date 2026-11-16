// ----------------------------------------------------------------------

/** Strip keys whose value is `undefined` (Firestore rejects them). */
export function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};

  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined) {
      result[key] = value;
    }
  });

  return result as Partial<T>;
}
