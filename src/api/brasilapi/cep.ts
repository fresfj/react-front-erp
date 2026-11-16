import { digitsOnly } from 'src/utils/br-docs';

export type BrasilCepResponse = {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  timezoneName?: string;
  location?: {
    type: string;
    coordinates?: { longitude: string; latitude: string };
  };
  ibge?: { city?: string; state?: string };
};

export type CepAddressFields = {
  zipCode: string;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
};

const BASE = 'https://brasilapi.com.br/api/cep/v2';

export function mapCepToAddress(data: BrasilCepResponse): CepAddressFields {
  return {
    zipCode: digitsOnly(data.cep),
    address: data.street || '',
    neighborhood: data.neighborhood || '',
    city: data.city || '',
    state: data.state || '',
  };
}

export async function fetchCep(cep: string): Promise<BrasilCepResponse> {
  const digits = digitsOnly(cep);
  if (digits.length !== 8) {
    throw new Error('CEP must have 8 digits');
  }

  const res = await fetch(`${BASE}/${digits}`);
  if (res.status === 404) {
    throw new Error('CEP_NOT_FOUND');
  }
  if (!res.ok) {
    throw new Error(`CEP_LOOKUP_FAILED:${res.status}`);
  }
  return (await res.json()) as BrasilCepResponse;
}
