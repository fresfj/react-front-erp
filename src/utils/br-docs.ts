/** Brazilian document / address helpers — digits for storage, masks for display. */

export function digitsOnly(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function formatCep(value: string | null | undefined): string {
  const d = digitsOnly(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function formatCnpj(value: string | null | undefined): string {
  const d = digitsOnly(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatCpf(value: string | null | undefined): string {
  const d = digitsOnly(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** CPF while ≤11 digits typed; CNPJ once length exceeds 11 or already 14. */
export function formatCpfCnpj(value: string | null | undefined): string {
  const d = digitsOnly(value);
  if (d.length <= 11) return formatCpf(d);
  return formatCnpj(d);
}

export function isCompleteCep(value: string | null | undefined): boolean {
  return digitsOnly(value).length === 8;
}

export function isCompleteCnpj(value: string | null | undefined): boolean {
  return digitsOnly(value).length === 14;
}

export function isCompleteCpf(value: string | null | undefined): boolean {
  return digitsOnly(value).length === 11;
}
