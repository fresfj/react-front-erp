/** Best-effort message from Firebase / unknown errors (PT-friendly). */
export function getFirebaseErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const err = error as { code?: string; message?: string };
  const code = err.code ? String(err.code) : '';
  const message = err.message ? String(err.message) : '';

  const authCode = code.startsWith('auth/')
    ? code
    : message.match(/auth\/[a-z0-9-]+/i)?.[0]?.toLowerCase() || '';

  switch (authCode) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'E-mail ou senha incorretos. Se o usuário já existia, a senha inicial do convite não altera a senha antiga — exclua o acesso em Colaboradores e cadastre de novo, ou use Esqueceu a senha.';
    case 'auth/user-not-found':
      return 'Conta não encontrada para este e-mail.';
    case 'auth/user-disabled':
      return 'Esta conta está desativada.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    case 'auth/email-already-in-use':
      return 'Este e-mail já está em uso.';
    case 'auth/weak-password':
      return 'Senha fraca. Use pelo menos 6 caracteres.';
    default:
      break;
  }

  if (code === 'permission-denied' || message.includes('permission-denied')) {
    return `${fallback} (permission-denied)`;
  }

  if (
    message &&
    message !== 'INTERNAL' &&
    message !== 'internal' &&
    !message.startsWith('Firebase:')
  ) {
    return `${fallback}: ${message}${code ? ` (${code})` : ''}`;
  }

  if (code) {
    return `${fallback} (${code})`;
  }

  return fallback;
}
