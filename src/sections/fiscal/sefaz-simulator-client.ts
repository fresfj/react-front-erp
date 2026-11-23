import type { Sale } from 'src/api/firestore/sales';
import type { Product } from 'src/api/firestore/products';
import type { Enterprise } from 'src/api/firestore/platform';

import { doc, updateDoc } from 'firebase/firestore';

import { getProduct } from 'src/api/firestore/products';
import { enterpriseCollection } from 'src/api/firestore/paths';

// ----------------------------------------------------------------------

const UF_IBGE: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
  MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29',
  MG: '31', ES: '32', RJ: '33', SP: '35',
  PR: '41', SC: '42', RS: '43',
  MS: '50', MT: '51', GO: '52', DF: '53',
};

const UF_QR_BASE: Record<string, { qr: string; consulta: string }> = {
  PR: {
    qr: 'http://www.fazenda.pr.gov.br/nfce/qrcode',
    consulta: 'http://www.fazenda.pr.gov.br/nfce/consulta',
  },
  PA: {
    qr: 'https://appnfc.sefa.pa.gov.br/portal-homologacao/view/consultas/nfce/nfceForm.seam',
    consulta: 'https://appnfc.sefa.pa.gov.br/portal-homologacao/view/consultas/nfce/consultanfce.seam',
  },
  SP: {
    qr: 'https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode',
    consulta: 'https://www.homologacao.nfce.fazenda.sp.gov.br/consulta',
  },
  SC: {
    qr: 'https://hom.sat.sef.sc.gov.br/nfce/consulta',
    consulta: 'https://hom.sat.sef.sc.gov.br/nfce/consulta',
  },
  RJ: {
    qr: 'https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode',
    consulta: 'https://consultadfe.fazenda.rj.gov.br/consultaDFe',
  },
};

function digitsOnly(value: string | null | undefined): string {
  return String(value || '').replace(/\D/g, '');
}

function computeMod11Dv(base43: string): number {
  let weight = 2;
  let sum = 0;
  for (let i = base43.length - 1; i >= 0; i -= 1) {
    sum += Number(base43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const mod11 = sum % 11;
  return mod11 === 0 || mod11 === 1 ? 0 : 11 - mod11;
}

async function sha1HexUpper(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(input);
    const hashBuf = await crypto.subtle.digest('SHA-1', encoded);
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }
  return '0000000000000000000000000000000000000000';
}

function randomDigits(len: number): string {
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += String(Math.floor(Math.random() * 10));
  }
  return out;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export type SimulatedNfceResult = {
  nfceNumber: string;
  nfceKey: string;
  nfceProtocol: string;
  nfceIssuedAt: string;
  nfceQrCodeUrl: string;
  nfceSimulated: true;
  xmlPreview: string;
};

const CUF_TO_UF: Record<string, string> = {
  '41': 'PR',
  '15': 'PA',
  '35': 'SP',
  '42': 'SC',
  '33': 'RJ',
};

/**
 * Resolves the official QR Code URL and portal consultation URL for a DANFE NFC-e.
 * Always returns a QR payload whenever the sale has an authorized NFC-e / access key.
 */
export function resolveNfceQrCodeDisplay(
  sale: Pick<Sale, 'nfceQrCodeUrl' | 'nfceKey'>,
  enterprise?: Pick<Enterprise, 'state'> | null
): { qrValue: string; consultaUrl: string } | null {
  const key = digitsOnly(sale.nfceKey);
  if (!sale.nfceQrCodeUrl && !key) return null;

  const ufFromKey = key.length >= 2 ? CUF_TO_UF[key.slice(0, 2)] : undefined;
  const uf = String(ufFromKey || enterprise?.state || 'PR')
    .trim()
    .toUpperCase();
  const ufUrls = UF_QR_BASE[uf] || UF_QR_BASE.PR;

  const qrValue =
    sale.nfceQrCodeUrl?.trim() || `${ufUrls.consulta}?chNFe=${key}`;

  return {
    qrValue,
    consultaUrl: ufUrls.consulta,
  };
}

/**
 * Simulates a full SEFAZ NFC-e 4.00 emission client-side when no A1 certificate is uploaded yet
 * or when the enterprise is configured in `sefaz-simulator` mode.
 */
export async function simulateSefazNfceForSale(
  enterpriseId: string,
  sale: Sale,
  enterprise: Enterprise
): Promise<SimulatedNfceResult> {
  const uniqueIds = Array.from(
    new Set((sale.items || []).map((item) => item.productId).filter(Boolean))
  );
  const loadedProducts = await Promise.all(uniqueIds.map((id) => getProduct(enterpriseId, id)));
  const productsById = new Map<string, Product>();
  loadedProducts.forEach((p) => {
    if (p) productsById.set(p.id, p);
  });

  const missingNames: string[] = [];
  (sale.items || []).forEach((item) => {
    const prod = productsById.get(item.productId);
    const ncm = digitsOnly(prod?.ncm);
    const hasOrigin =
      typeof prod?.origin === 'number' && prod.origin >= 0 && prod.origin <= 8;
    const hasCst = Boolean(prod?.cstOrCsosn && prod.cstOrCsosn.trim());
    if (ncm.length !== 8 || !hasOrigin || !hasCst) {
      missingNames.push(prod?.name || item.productName || item.productId);
    }
  });

  if (missingNames.length > 0) {
    throw new Error(
      `Produto(s) sem NCM (8 dígitos), Origem ou CST/CSOSN: ${Array.from(new Set(missingNames)).join(', ')}. Atualize o cadastro fiscal do produto primeiro.`
    );
  }

  const uf = String(enterprise.state || 'PR').trim().toUpperCase();
  const cUF = UF_IBGE[uf] || '41';
  const ufUrls = UF_QR_BASE[uf] || UF_QR_BASE.PR;
  const cnpj = digitsOnly(enterprise.document).padStart(14, '0').slice(0, 14);
  const serieNum = Math.max(1, Number(digitsOnly(enterprise.nfceSeries || '1')) || 1);
  const seriePadded = String(serieNum).padStart(3, '0');
  const now = new Date();
  const aamm = `${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const nNFNum = Math.floor(1 + (Date.now() % 899999));
  const nNFPadded = String(nNFNum).padStart(9, '0');
  const cNF = randomDigits(8);

  const base43 = `${cUF}${aamm}${cnpj}65${seriePadded}${nNFPadded}1${cNF}`;
  const cDV = computeMod11Dv(base43);
  const nfceKey = `${base43}${cDV}`;

  const cscId = String(Number(digitsOnly(enterprise.nfceCscId || '1')) || 1);
  const qrParams = `${nfceKey}|2|2|${cscId}`;
  const qrHash = await sha1HexUpper(`${qrParams}SIMULACAO-CSC-TOKEN`);
  const sep = ufUrls.qr.includes('?') ? '&' : '?';
  const nfceQrCodeUrl = `${ufUrls.qr}${sep}p=${qrParams}|${qrHash}`;

  const nfceProtocol = `1${cUF}${String(now.getUTCFullYear()).slice(2)}${randomDigits(10)}`;
  const nfceIssuedAt = now.toISOString();
  const nfceNumber = String(nNFNum);

  const detXml = (sale.items || [])
    .map((item, idx) => {
      const prod = productsById.get(item.productId);
      const ncm = digitsOnly(prod?.ncm).padStart(8, '0').slice(0, 8);
      const cfop = digitsOnly(prod?.cfopSaleDefault || '5102').padStart(4, '0').slice(0, 4);
      const origin = String(prod?.origin ?? 0);
      const csosn = escapeXml(String(prod?.cstOrCsosn || '102'));
      const xProd =
        idx === 0
          ? 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
          : escapeXml(item.productName);
      return `<det nItem="${idx + 1}"><prod><cProd>${escapeXml(item.productSku || item.productId)}</cProd><xProd>${xProd}</xProd><NCM>${ncm}</NCM><CFOP>${cfop}</CFOP><uCom>${escapeXml(prod?.commercialUnit || item.unit || 'UN')}</uCom><qCom>${item.qty.toFixed(4)}</qCom><vUnCom>${item.unitPrice.toFixed(2)}</vUnCom><vProd>${item.lineTotal.toFixed(2)}</vProd></prod><imposto><ICMS><ICMSSN102><orig>${origin}</orig><CSOSN>${csosn}</CSOSN></ICMSSN102></ICMS><PIS><PISOutr><CST>49</CST><vBC>0.00</vBC><pPIS>0.00</pPIS><vPIS>0.00</vPIS></PISOutr></PIS><COFINS><COFINSOutr><CST>49</CST><vBC>0.00</vBC><pCOFINS>0.00</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS></imposto></det>`;
    })
    .join('');

  const xmlPreview =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">` +
    `<infNFe Id="NFe${nfceKey}" versao="4.00">` +
    `<ide><cUF>${cUF}</cUF><mod>65</mod><serie>${serieNum}</serie><nNF>${nfceNumber}</nNF><cDV>${cDV}</cDV><tpAmb>2</tpAmb></ide>` +
    `<emit><CNPJ>${cnpj}</CNPJ><xNome>${escapeXml(enterprise.name)}</xNome><enderEmit><UF>${uf}</UF></enderEmit></emit>` +
    `${detXml}` +
    `<total><ICMSTot><vProd>${(sale.subtotal ?? sale.total).toFixed(2)}</vProd><vNF>${sale.total.toFixed(2)}</vNF></ICMSTot></total>` +
    `</infNFe>` +
    `<infNFeSupl><qrCode><![CDATA[${nfceQrCodeUrl}]]></qrCode><urlChave>${escapeXml(ufUrls.consulta)}</urlChave></infNFeSupl>` +
    `</NFe>`;

  const saleRef = doc(enterpriseCollection(enterpriseId, 'sales'), sale.id);
  await updateDoc(saleRef, {
    nfceStatus: 'authorized',
    nfceNumber,
    nfceKey,
    nfceProtocol,
    nfceIssuedAt,
    nfceQrCodeUrl,
    nfceSimulated: true,
    nfceLastError: null,
    updatedAt: nfceIssuedAt,
  });

  return {
    nfceNumber,
    nfceKey,
    nfceProtocol,
    nfceIssuedAt,
    nfceQrCodeUrl,
    nfceSimulated: true,
    xmlPreview,
  };
}
