import { describe, expect, it } from 'vitest';

import {
  digitsOnly,
  formatCep,
  formatCnpj,
  formatCpf,
  formatCpfCnpj,
  isCompleteCep,
  isCompleteCnpj,
} from './br-docs';

describe('br-docs', () => {
  it('digitsOnly strips non-digits', () => {
    expect(digitsOnly('89.010-025')).toBe('89010025');
    expect(digitsOnly(null)).toBe('');
  });

  it('formatCep masks 8 digits', () => {
    expect(formatCep('89010025')).toBe('89010-025');
    expect(formatCep('89010')).toBe('89010');
  });

  it('formatCnpj masks 14 digits', () => {
    expect(formatCnpj('19131243000197')).toBe('19.131.243/0001-97');
  });

  it('formatCpf masks 11 digits', () => {
    expect(formatCpf('12345678901')).toBe('123.456.789-01');
  });

  it('formatCpfCnpj switches at 12+ digits', () => {
    expect(formatCpfCnpj('12345678901')).toBe('123.456.789-01');
    expect(formatCpfCnpj('19131243000197')).toBe('19.131.243/0001-97');
  });

  it('complete checks', () => {
    expect(isCompleteCep('89010-025')).toBe(true);
    expect(isCompleteCnpj('19.131.243/0001-97')).toBe(true);
    expect(isCompleteCep('89010')).toBe(false);
  });
});
