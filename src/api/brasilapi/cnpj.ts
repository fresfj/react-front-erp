import { digitsOnly } from 'src/utils/br-docs';

export type BrasilCnpjResponse = {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  cep?: string;
  uf?: string;
  bairro?: string;
  numero?: string;
  municipio?: string;
  logradouro?: string;
  complemento?: string;
  descricao_tipo_de_logradouro?: string;
  ddd_telefone_1?: string;
  email?: string | null;
};

export type CnpjCompanyFields = {
  document: string;
  name: string;
  tradeName: string;
  zipCode: string;
  address: string;
  addressNumber: string;
  neighborhood: string;
  city: string;
  state: string;
  complement: string;
  phone: string;
};

const BASE = 'https://brasilapi.com.br/api/cnpj/v1';

export function mapCnpjToCompany(data: BrasilCnpjResponse): CnpjCompanyFields {
  const streetType = data.descricao_tipo_de_logradouro
    ? `${data.descricao_tipo_de_logradouro} `
    : '';
  const logradouro = data.logradouro || '';
  return {
    document: digitsOnly(data.cnpj),
    name: data.razao_social || '',
    tradeName: data.nome_fantasia || '',
    zipCode: digitsOnly(data.cep),
    address: `${streetType}${logradouro}`.trim(),
    addressNumber: data.numero || '',
    neighborhood: data.bairro || '',
    city: data.municipio || '',
    state: data.uf || '',
    complement: data.complemento || '',
    phone: digitsOnly(data.ddd_telefone_1),
  };
}

export async function fetchCnpj(cnpj: string): Promise<BrasilCnpjResponse> {
  const digits = digitsOnly(cnpj);
  if (digits.length !== 14) {
    throw new Error('CNPJ must have 14 digits');
  }

  const res = await fetch(`${BASE}/${digits}`);
  if (res.status === 404) {
    throw new Error('CNPJ_NOT_FOUND');
  }
  if (!res.ok) {
    throw new Error(`CNPJ_LOOKUP_FAILED:${res.status}`);
  }
  return (await res.json()) as BrasilCnpjResponse;
}
