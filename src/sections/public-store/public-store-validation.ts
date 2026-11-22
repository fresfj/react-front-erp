import { z as zod } from 'zod';

import { digitsOnly, isCompletePhoneBr } from 'src/utils/br-docs';

// ----------------------------------------------------------------------

export const TableOrderSchema = zod.object({
  firstName: zod
    .string()
    .trim()
    .min(2, 'Informe seu primeiro nome (mínimo 2 letras).'),
  phone: zod
    .string()
    .trim()
    .refine((val) => isCompletePhoneBr(val), 'Informe um telefone/WhatsApp válido com DDD.'),
  notes: zod.string().max(300, 'Máximo de 300 caracteres.').optional().or(zod.literal('')),
});

export type TableOrderFormValues = zod.infer<typeof TableOrderSchema>;

// ----------------------------------------------------------------------

export const PublicOrdersLookupSchema = zod.object({
  phone: zod
    .string()
    .trim()
    .refine((val) => isCompletePhoneBr(val), 'Informe um WhatsApp válido com DDD.'),
  firstName: zod
    .string()
    .trim()
    .min(2, 'Informe seu primeiro nome (mínimo 2 letras).'),
});

export type PublicOrdersLookupValues = zod.infer<typeof PublicOrdersLookupSchema>;

// ----------------------------------------------------------------------

export type CheckoutFieldName =
  | 'customerPhone'
  | 'customerName'
  | 'cep'
  | 'street'
  | 'number'
  | 'neighborhood'
  | 'city'
  | 'state';

export type CheckoutFormErrors = Partial<Record<CheckoutFieldName, string>>;

export type CheckoutValidationInput = {
  isTableMode: boolean;
  deliveryType: 'pickup' | 'delivery';
  customerPhone: string;
  customerName: string;
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
};

const CheckoutBaseSchema = zod
  .object({
    isTableMode: zod.boolean(),
    deliveryType: zod.enum(['pickup', 'delivery']),
    customerPhone: zod.string(),
    customerName: zod.string(),
    cep: zod.string(),
    street: zod.string(),
    number: zod.string(),
    neighborhood: zod.string(),
    city: zod.string(),
    state: zod.string(),
  })
  .superRefine((data, ctx) => {
    if (!data.isTableMode) {
      if (!data.customerPhone.trim()) {
        ctx.addIssue({
          code: zod.ZodIssueCode.custom,
          path: ['customerPhone'],
          message: 'Informe seu WhatsApp com DDD.',
        });
      } else if (!isCompletePhoneBr(data.customerPhone)) {
        ctx.addIssue({
          code: zod.ZodIssueCode.custom,
          path: ['customerPhone'],
          message: 'Informe um número válido com DDD (10 ou 11 dígitos).',
        });
      }
    }

    if (data.customerName.trim().length < 2) {
      ctx.addIssue({
        code: zod.ZodIssueCode.custom,
        path: ['customerName'],
        message: data.isTableMode
          ? 'Informe seu nome para identificar o pedido na mesa.'
          : 'Informe seu nome completo.',
      });
    }

    if (!data.isTableMode && data.deliveryType === 'delivery') {
      const cepDigits = digitsOnly(data.cep);
      if (cepDigits.length > 0 && cepDigits.length !== 8) {
        ctx.addIssue({
          code: zod.ZodIssueCode.custom,
          path: ['cep'],
          message: 'Informe um CEP válido com 8 dígitos.',
        });
      }

      if (data.street.trim().length < 3) {
        ctx.addIssue({
          code: zod.ZodIssueCode.custom,
          path: ['street'],
          message: 'Informe o nome da rua / logradouro.',
        });
      }

      if (!data.number.trim()) {
        ctx.addIssue({
          code: zod.ZodIssueCode.custom,
          path: ['number'],
          message: 'Informe o número (ou S/N).',
        });
      }

      if (data.neighborhood.trim().length < 2) {
        ctx.addIssue({
          code: zod.ZodIssueCode.custom,
          path: ['neighborhood'],
          message: 'Informe o bairro.',
        });
      }

      if (data.city.trim().length < 2) {
        ctx.addIssue({
          code: zod.ZodIssueCode.custom,
          path: ['city'],
          message: 'Informe a cidade.',
        });
      }

      if (data.state.trim().length !== 2) {
        ctx.addIssue({
          code: zod.ZodIssueCode.custom,
          path: ['state'],
          message: 'Informe a UF (2 letras, ex.: PA).',
        });
      }
    }
  });

export function validateCheckoutForm(input: CheckoutValidationInput): {
  valid: boolean;
  errors: CheckoutFormErrors;
  firstErrorField?: CheckoutFieldName;
} {
  const parsed = CheckoutBaseSchema.safeParse(input);
  if (parsed.success) {
    return { valid: true, errors: {} };
  }

  const errors: CheckoutFormErrors = {};
  let firstErrorField: CheckoutFieldName | undefined;

  parsed.error.issues.forEach((issue) => {
    const field = issue.path[0] as CheckoutFieldName | undefined;
    if (field && !errors[field]) {
      errors[field] = issue.message;
      if (!firstErrorField) {
        firstErrorField = field;
      }
    }
  });

  return { valid: false, errors, firstErrorField };
}
