import { formatCep, digitsOnly } from 'src/utils/br-docs';

import { normalizeBrPhoneDigits } from './public-customer-phone-auth';

// ----------------------------------------------------------------------

export type SavedCustomerAddress = {
  id: string;
  label: string;
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  isDefault?: boolean;
};

export type PublicCustomerProfile = {
  fullName: string;
  addresses: SavedCustomerAddress[];
  updatedAt: string;
};

const PROFILE_STORAGE_KEY = (slug: string, phoneDigits: string) =>
  `onlineStore:customerProfile:${slug}:${phoneDigits}`;

export function formatSavedAddressLine(addr: SavedCustomerAddress): string {
  const parts = [
    `${addr.street.trim()}, nº ${addr.number.trim()}${
      addr.complement?.trim() ? ` (${addr.complement.trim()})` : ''
    }`,
    addr.neighborhood.trim(),
    [addr.city.trim(), addr.state.trim().toUpperCase()].filter(Boolean).join(' - '),
    addr.cep ? `CEP: ${formatCep(addr.cep)}` : '',
  ].filter(Boolean);
  return parts.join(' - ');
}

function addressFingerprint(addr: Pick<SavedCustomerAddress, 'cep' | 'street' | 'number'>): string {
  return `${digitsOnly(addr.cep)}|${addr.street.trim().toLowerCase()}|${addr.number.trim().toLowerCase()}`;
}

export function loadPublicCustomerProfile(
  slug: string,
  phone: string
): PublicCustomerProfile | null {
  const phoneDigits = normalizeBrPhoneDigits(phone);
  if (!slug || !phoneDigits) return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY(slug, phoneDigits));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PublicCustomerProfile>;
    return {
      fullName: String(parsed.fullName || ''),
      addresses: Array.isArray(parsed.addresses) ? parsed.addresses : [],
      updatedAt: String(parsed.updatedAt || ''),
    };
  } catch {
    return null;
  }
}

export function savePublicCustomerProfile(
  slug: string,
  phone: string,
  profile: Omit<PublicCustomerProfile, 'updatedAt'>
): PublicCustomerProfile {
  const phoneDigits = normalizeBrPhoneDigits(phone);
  const normalizedAddresses = profile.addresses.map((a, idx) => ({
    ...a,
    id: a.id || `addr-${Date.now()}-${idx}`,
    label: a.label?.trim() || 'Endereço',
    cep: digitsOnly(a.cep),
    state: a.state.trim().toUpperCase(),
  }));

  if (
    normalizedAddresses.length > 0 &&
    !normalizedAddresses.some((a) => a.isDefault)
  ) {
    normalizedAddresses[0].isDefault = true;
  }

  const next: PublicCustomerProfile = {
    fullName: profile.fullName.trim(),
    addresses: normalizedAddresses,
    updatedAt: new Date().toISOString(),
  };

  if (slug && phoneDigits) {
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY(slug, phoneDigits), JSON.stringify(next));
      const def = next.addresses.find((a) => a.isDefault) || next.addresses[0];
      if (def) {
        window.localStorage.setItem(
          `onlineStore:customerAddress:${slug}`,
          formatSavedAddressLine(def)
        );
      }
    } catch {
      // ignore storage errors
    }
  }

  return next;
}

export function upsertPublicCustomerAddress(
  slug: string,
  phone: string,
  input: {
    fullName?: string;
    address: Omit<SavedCustomerAddress, 'id'> & { id?: string };
    setAsDefault?: boolean;
  }
): PublicCustomerProfile {
  const existing = loadPublicCustomerProfile(slug, phone) || {
    fullName: '',
    addresses: [],
    updatedAt: '',
  };

  const fp = addressFingerprint(input.address);
  const foundIdx = existing.addresses.findIndex(
    (a) => (input.address.id && a.id === input.address.id) || addressFingerprint(a) === fp
  );

  const makeDefault = input.setAsDefault !== false;
  const nextAddresses = existing.addresses.map((a) => ({
    ...a,
    isDefault: makeDefault ? false : a.isDefault,
  }));

  if (foundIdx >= 0) {
    nextAddresses[foundIdx] = {
      ...nextAddresses[foundIdx],
      ...input.address,
      id: nextAddresses[foundIdx].id,
      isDefault: makeDefault ? true : nextAddresses[foundIdx].isDefault,
    };
  } else {
    nextAddresses.unshift({
      ...input.address,
      id: input.address.id || `addr-${Date.now()}`,
      label: input.address.label?.trim() || (nextAddresses.length === 0 ? 'Casa' : 'Outro'),
      isDefault: makeDefault || nextAddresses.length === 0,
    });
  }

  return savePublicCustomerProfile(slug, phone, {
    fullName: input.fullName?.trim() || existing.fullName,
    addresses: nextAddresses.slice(0, 6),
  });
}

export function getDefaultPublicCustomerAddress(
  slug: string,
  phone: string
): SavedCustomerAddress | null {
  const profile = loadPublicCustomerProfile(slug, phone);
  if (!profile || profile.addresses.length === 0) return null;
  return profile.addresses.find((a) => a.isDefault) || profile.addresses[0];
}
