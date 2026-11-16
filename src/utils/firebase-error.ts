/** Best-effort message from Firebase / unknown errors (PT-friendly). */
export function getFirebaseErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const err = error as { code?: string; message?: string };
  const code = err.code ? String(err.code) : '';
  const message = err.message ? String(err.message) : '';

  if (code === 'permission-denied' || message.includes('permission-denied')) {
    return `${fallback} (permission-denied)`;
  }

  if (code) {
    return `${fallback} (${code})`;
  }

  return fallback;
}
