import type { FirebaseApp } from 'firebase/app';
import type { Auth, ConfirmationResult } from 'firebase/auth';

import { getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'firebase/auth';

import { digitsOnly, formatPhoneBr } from 'src/utils/br-docs';

import { CONFIG } from 'src/config-global';

// ----------------------------------------------------------------------

const PUBLIC_APP_NAME = 'public-customer-phone-auth';
const VERIFIED_STORAGE_KEY = (slug: string) => `onlineStore:verifiedPhoneAuth:${slug}`;

export type VerifiedPublicCustomer = {
  uid: string;
  phoneDigits: string;
  phoneFormatted: string;
  phoneE164: string;
  firstName?: string;
  fullName?: string;
  verifiedAt: string;
};

let activeRecaptchaVerifier: RecaptchaVerifier | null = null;

function getPublicFirebaseApp(): FirebaseApp | null {
  if (!CONFIG.firebase.apiKey || !CONFIG.firebase.projectId) return null;
  const existing = getApps().find((app) => app.name === PUBLIC_APP_NAME);
  if (existing) return existing;

  return initializeApp(
    {
      apiKey: CONFIG.firebase.apiKey,
      authDomain: CONFIG.firebase.authDomain,
      databaseURL: CONFIG.firebase.databaseURL,
      projectId: CONFIG.firebase.projectId,
      storageBucket: CONFIG.firebase.storageBucket,
      messagingSenderId: CONFIG.firebase.messagingSenderId,
      appId: CONFIG.firebase.appId,
      measurementId: CONFIG.firebase.measurementId,
    },
    PUBLIC_APP_NAME
  );
}

/**
 * Isolated Firebase Auth instance for public catalog customers.
 * Never overwrites the ERP backoffice admin session.
 */
export function getPublicCustomerAuth(): Auth | null {
  const app = getPublicFirebaseApp();
  if (!app) return null;
  const auth = getAuth(app);
  auth.languageCode = 'pt-BR';
  return auth;
}

export function normalizeBrPhoneDigits(phone: string): string {
  const raw = digitsOnly(phone);
  if (raw.startsWith('55') && (raw.length === 12 || raw.length === 13)) {
    return raw.slice(2);
  }
  return raw;
}

export function toBrazilE164(phone: string): string {
  const localDigits = normalizeBrPhoneDigits(phone);
  return `+55${localDigits}`;
}

export function clearRecaptchaVerifier() {
  if (activeRecaptchaVerifier) {
    try {
      activeRecaptchaVerifier.clear();
    } catch {
      // ignore cleanup error
    }
    activeRecaptchaVerifier = null;
  }
}

export async function sendPublicPhoneOtp(
  phone: string,
  recaptchaContainerId: string
): Promise<ConfirmationResult> {
  const auth = getPublicCustomerAuth();
  if (!auth) {
    throw new Error('Firebase Authentication não está configurado.');
  }

  clearRecaptchaVerifier();
  const container = document.getElementById(recaptchaContainerId);
  if (container) {
    container.innerHTML = '';
  }

  const verifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
    size: 'invisible',
  });
  activeRecaptchaVerifier = verifier;

  const phoneE164 = toBrazilE164(phone);
  try {
    return await signInWithPhoneNumber(auth, phoneE164, verifier);
  } catch (error) {
    clearRecaptchaVerifier();
    throw error;
  }
}

export async function confirmPublicPhoneOtp(
  confirmation: ConfirmationResult,
  code: string,
  meta: { slug: string; phone: string; firstName?: string; fullName?: string }
): Promise<VerifiedPublicCustomer> {
  const cleanCode = digitsOnly(code);
  const credential = await confirmation.confirm(cleanCode);
  const phoneDigits = normalizeBrPhoneDigits(credential.user.phoneNumber || meta.phone);
  const verified: VerifiedPublicCustomer = {
    uid: credential.user.uid,
    phoneDigits,
    phoneFormatted: formatPhoneBr(phoneDigits),
    phoneE164: credential.user.phoneNumber || toBrazilE164(phoneDigits),
    firstName: meta.firstName?.trim() || undefined,
    fullName: meta.fullName?.trim() || undefined,
    verifiedAt: new Date().toISOString(),
  };

  saveVerifiedPublicCustomer(meta.slug, verified);
  clearRecaptchaVerifier();
  return verified;
}

export function saveVerifiedPublicCustomer(slug: string, customer: VerifiedPublicCustomer) {
  try {
    window.localStorage.setItem(VERIFIED_STORAGE_KEY(slug), JSON.stringify(customer));
  } catch {
    // ignore storage errors
  }
}

export function getVerifiedPublicCustomer(slug: string): VerifiedPublicCustomer | null {
  try {
    const raw = window.localStorage.getItem(VERIFIED_STORAGE_KEY(slug));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<VerifiedPublicCustomer>;
      if (parsed?.uid && parsed?.phoneDigits) {
        return {
          uid: String(parsed.uid),
          phoneDigits: String(parsed.phoneDigits),
          phoneFormatted: formatPhoneBr(String(parsed.phoneDigits)),
          phoneE164: String(parsed.phoneE164 || toBrazilE164(String(parsed.phoneDigits))),
          firstName: parsed.firstName ? String(parsed.firstName) : undefined,
          fullName: parsed.fullName ? String(parsed.fullName) : undefined,
          verifiedAt: String(parsed.verifiedAt || ''),
        };
      }
    }
  } catch {
    // ignore storage errors
  }

  const currentUser = getPublicCustomerAuth()?.currentUser;
  if (currentUser?.phoneNumber) {
    const phoneDigits = normalizeBrPhoneDigits(currentUser.phoneNumber);
    return {
      uid: currentUser.uid,
      phoneDigits,
      phoneFormatted: formatPhoneBr(phoneDigits),
      phoneE164: currentUser.phoneNumber,
      verifiedAt: new Date().toISOString(),
    };
  }
  return null;
}

export function isPhoneVerifiedForSlug(slug: string, phone: string): boolean {
  const verified = getVerifiedPublicCustomer(slug);
  if (!verified) return false;
  const targetDigits = normalizeBrPhoneDigits(phone);
  return Boolean(targetDigits && verified.phoneDigits === targetDigits);
}

export async function signOutPublicCustomer(slug: string): Promise<void> {
  try {
    window.localStorage.removeItem(VERIFIED_STORAGE_KEY(slug));
  } catch {
    // ignore storage errors
  }
  const auth = getPublicCustomerAuth();
  if (auth?.currentUser) {
    try {
      await signOut(auth);
    } catch {
      // ignore signOut errors
    }
  }
}

export function getPhoneAuthErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  if (code === 'auth/invalid-verification-code') {
    return 'Código inválido. Confira os 6 dígitos enviados por SMS.';
  }
  if (code === 'auth/code-expired') {
    return 'O código expirou. Clique em "Reenviar código" para receber um novo SMS.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Muitas tentativas em sequência. Aguarde alguns instantes e tente novamente.';
  }
  if (code === 'auth/invalid-phone-number') {
    return 'Número de celular inválido. Informe DDD + 9 dígitos.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Autenticação por Telefone (SMS) não está habilitada no Firebase Console desta conta.';
  }
  if (code === 'auth/captcha-check-failed' || code === 'auth/missing-client-identifier') {
    return 'Não foi possível validar o reCAPTCHA do SMS. Recarregue a página e tente novamente.';
  }
  return (error as Error)?.message || 'Não foi possível validar o código SMS.';
}
