import { it, expect, describe } from 'vitest';

import {
  TableOrderSchema,
  validateCheckoutForm,
  PublicOrdersLookupSchema,
} from '../public-store-validation';

describe('public-store-validation', () => {
  it('valida campos obrigatórios do pedido na mesa (primeiro nome + telefone)', () => {
    const fail = TableOrderSchema.safeParse({ firstName: '', phone: '1199' });
    expect(fail.success).toBe(false);

    const ok = TableOrderSchema.safeParse({
      firstName: 'Carlos',
      phone: '(91) 98888-7777',
      notes: 'Sem cebola',
    });
    expect(ok.success).toBe(true);
  });

  it('valida campos obrigatórios da consulta de Meus Pedidos', () => {
    const fail = PublicOrdersLookupSchema.safeParse({ phone: '', firstName: 'A' });
    expect(fail.success).toBe(false);

    const ok = PublicOrdersLookupSchema.safeParse({
      phone: '(91) 98888-7777',
      firstName: 'Francisco',
    });
    expect(ok.success).toBe(true);
  });

  it('valida todos os campos obrigatórios no checkout de entrega', () => {
    const res = validateCheckoutForm({
      isTableMode: false,
      deliveryType: 'delivery',
      customerPhone: '',
      customerName: '',
      cep: '123',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      state: '',
    });
    expect(res.valid).toBe(false);
    expect(res.firstErrorField).toBe('customerPhone');
    expect(res.errors.customerPhone).toBeTruthy();
    expect(res.errors.customerName).toBeTruthy();
    expect(res.errors.cep).toBeTruthy();
    expect(res.errors.street).toBeTruthy();
    expect(res.errors.number).toBeTruthy();
    expect(res.errors.neighborhood).toBeTruthy();
    expect(res.errors.city).toBeTruthy();
    expect(res.errors.state).toBeTruthy();
  });

  it('permite checkout em modo mesa exigindo apenas o nome do cliente', () => {
    const fail = validateCheckoutForm({
      isTableMode: true,
      deliveryType: 'pickup',
      customerPhone: '',
      customerName: '',
      cep: '',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      state: '',
    });
    expect(fail.valid).toBe(false);
    expect(fail.firstErrorField).toBe('customerName');

    const ok = validateCheckoutForm({
      isTableMode: true,
      deliveryType: 'pickup',
      customerPhone: '',
      customerName: 'Maria',
      cep: '',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      state: '',
    });
    expect(ok.valid).toBe(true);
  });
});
