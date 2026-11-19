import { httpsCallable } from 'firebase/functions';

import { FUNCTIONS } from 'src/lib/firebase';

// ----------------------------------------------------------------------

const RETURN_SESSION_KEY = 'erp_user_switch_return';

export type SwitchableMember = {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  role: string;
  hasQuickPin: boolean;
};

export type ReturnSwitchSession = {
  returnSessionId: string;
  originalName: string;
  targetUid: string;
  targetName: string;
  targetRole: string;
};

async function call<TReq extends object, TRes>(action: string, data: TReq): Promise<TRes> {
  const fn = httpsCallable<TReq & { action: string }, TRes>(FUNCTIONS, 'erpActions');
  const res = await fn({ action, ...data });
  return res.data;
}

export function listSwitchableMembersCf(
  enterpriseId?: string
): Promise<{ members: SwitchableMember[]; canDirectSwitch: boolean }> {
  return call<{ enterpriseId?: string }, { members: SwitchableMember[]; canDirectSwitch: boolean }>(
    'listSwitchableMembers',
    enterpriseId ? { enterpriseId } : {}
  );
}

export function setMemberQuickPinCf(input: {
  pin: string;
  enterpriseId?: string;
  targetUid?: string;
}): Promise<{ saved: boolean; targetUid: string }> {
  return call<typeof input, { saved: boolean; targetUid: string }>('setMemberQuickPin', input);
}

export function switchUserSessionCf(input: {
  enterpriseId: string;
  targetUid: string;
  pin?: string;
}): Promise<{
  customToken: string;
  returnSessionId: string | null;
  targetUser: {
    uid: string;
    displayName: string;
    email: string;
    role: string;
  };
}> {
  return call<
    typeof input,
    {
      customToken: string;
      returnSessionId: string | null;
      targetUser: {
        uid: string;
        displayName: string;
        email: string;
        role: string;
      };
    }
  >('switchUserSession', input);
}

export function returnFromUserSwitchCf(
  returnSessionId: string
): Promise<{ customToken: string; originalUid: string }> {
  return call<{ returnSessionId: string }, { customToken: string; originalUid: string }>(
    'returnFromUserSwitch',
    { returnSessionId }
  );
}

export function getReturnSwitchSession(): ReturnSwitchSession | null {
  try {
    const raw = window.sessionStorage.getItem(RETURN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReturnSwitchSession;
    if (!parsed?.returnSessionId || !parsed?.targetUid) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveReturnSwitchSession(session: ReturnSwitchSession): void {
  try {
    window.sessionStorage.setItem(RETURN_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore storage errors
  }
}

export function clearReturnSwitchSession(): void {
  try {
    window.sessionStorage.removeItem(RETURN_SESSION_KEY);
  } catch {
    // ignore storage errors
  }
}
