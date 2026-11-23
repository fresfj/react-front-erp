/**
 * NFC-e (modelo 65) XML 4.00 builder for SEFAZ-direct and SEFAZ-simulator.
 *
 * Follows NF-e 4.00 XSD element order:
 *   <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
 *     <infNFe Id="NFe{44}" versao="4.00">...</infNFe>
 *     <infNFeSupl><qrCode>...</qrCode><urlChave>...</urlChave></infNFeSupl>
 *     <!-- Signature is appended after </infNFeSupl> by a1-signer.js -->
 *   </NFe>
 */

const crypto = require('node:crypto');
const { UF_IBGE, UF_CAPITAL_IBGE, resolveNfceEndpoint } = require('./uf-endpoints');

const HOMOLOGATION_ITEM_DESC =
  'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function moneyStr(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function qtyStr(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '1.0000';
  return n.toFixed(4);
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function paymentCode(method) {
  if (method === 'cash') return '01';
  if (method === 'debit') return '04';
  if (method === 'credit') return '03';
  if (method === 'pix') return '17';
  if (method === 'voucher') return '10';
  return '99';
}

function resolveCrt(taxRegime) {
  if (taxRegime === 'mei') return '4';
  if (taxRegime === 'presumido' || taxRegime === 'real') return '3';
  return '1';
}

function computeMod11Dv(base43) {
  let weight = 2;
  let sum = 0;
  for (let i = base43.length - 1; i >= 0; i -= 1) {
    sum += Number(base43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const mod11 = sum % 11;
  return mod11 === 0 || mod11 === 1 ? 0 : 11 - mod11;
}

function buildInfNFeId({ cUF, aamm, cnpj, mod, serie, nNF, tpEmis, cNF }) {
  const base = `${cUF}${aamm}${cnpj}${mod}${serie}${nNF}${tpEmis}${cNF}`;
  const dv = computeMod11Dv(base);
  return `NFe${base}${dv}`;
}

function buildIcmsXml({ origin, cstOrCsosn, crt, vProd }) {
  const orig = escapeXml(String(origin ?? 0));
  const code = digitsOnly(cstOrCsosn);

  // Regime Normal (CRT 3) -> CST (2 digits)
  if (crt === '3' || code.length === 2) {
    const cst = code.padStart(2, '0').slice(0, 2);
    if (cst === '00') {
      return `<ICMS><ICMS00><orig>${orig}</orig><CST>00</CST><modBC>3</modBC><vBC>${vProd}</vBC><pICMS>0.00</pICMS><vICMS>0.00</vICMS></ICMS00></ICMS>`;
    }
    if (cst === '40' || cst === '41' || cst === '50') {
      return `<ICMS><ICMS40><orig>${orig}</orig><CST>${cst}</CST></ICMS40></ICMS>`;
    }
    if (cst === '60') {
      return `<ICMS><ICMS60><orig>${orig}</orig><CST>60</CST><vBCSTRet>0.00</vBCSTRet><pST>0.00</pST><vICMSSubstituto>0.00</vICMSSubstituto><vICMSSTRet>0.00</vICMSSTRet></ICMS60></ICMS>`;
    }
    return `<ICMS><ICMS90><orig>${orig}</orig><CST>${cst}</CST></ICMS90></ICMS>`;
  }

  // Simples Nacional / MEI (CRT 1 ou 4) -> CSOSN (3 digits)
  const csosn = code || '102';
  if (csosn === '101') {
    return `<ICMS><ICMSSN101><orig>${orig}</orig><CSOSN>101</CSOSN><pCredSN>0.00</pCredSN><vCredICMSSN>0.00</vCredICMSSN></ICMSSN101></ICMS>`;
  }
  if (csosn === '500') {
    return `<ICMS><ICMSSN500><orig>${orig}</orig><CSOSN>500</CSOSN><vBCSTRet>0.00</vBCSTRet><pST>0.00</pST><vICMSSubstituto>0.00</vICMSSubstituto><vICMSSTRet>0.00</vICMSSTRet></ICMSSN500></ICMS>`;
  }
  if (csosn === '102' || csosn === '103' || csosn === '300' || csosn === '400') {
    return `<ICMS><ICMSSN102><orig>${orig}</orig><CSOSN>${csosn}</CSOSN></ICMSSN102></ICMS>`;
  }
  return `<ICMS><ICMSSN900><orig>${orig}</orig><CSOSN>${csosn}</CSOSN></ICMSSN900></ICMS>`;
}

/**
 * Builds official NFC-e QR Code v2 URL (NT 2018.005 online emission).
 * Format: {qrCodeBaseUrl}?p={chNFe}|2|{tpAmb}|{cIdTokenSemZeros}|{SHA1(params+cscToken).toUpperCase()}
 */
function buildQrCodeV2Url({ qrCodeBaseUrl, chNFe, tpAmb, cscId, cscToken }) {
  const cleanId = String(Number(digitsOnly(cscId || '1')) || 1);
  const cleanToken = String(cscToken || '00000000-0000-0000-0000-000000000000').trim();
  const baseParams = `${chNFe}|2|${tpAmb}|${cleanId}`;
  const hash = crypto
    .createHash('sha1')
    .update(`${baseParams}${cleanToken}`, 'utf8')
    .digest('hex')
    .toUpperCase();
  const sep = qrCodeBaseUrl.includes('?') ? '&' : '?';
  return `${qrCodeBaseUrl}${sep}p=${baseParams}|${hash}`;
}

function buildNfceXml(input) {
  const env = input.environment === 'production' ? 'production' : 'homologation';
  const tpAmb = env === 'production' ? '1' : '2';
  const enterprise = input.enterprise || {};
  const sale = input.sale || {};
  const productsById = {};
  (input.products || []).forEach((p) => {
    productsById[p.id || p.productId] = p;
  });

  const cnpj = digitsOnly(enterprise.document || enterprise.cnpj).padStart(14, '0').slice(0, 14);
  const uf = String(enterprise.state || enterprise.uf || 'PR').trim().toUpperCase();
  const cUF = UF_IBGE[uf] || '41';
  const crt = resolveCrt(enterprise.taxRegime);

  let ufUrls;
  try {
    ufUrls = resolveNfceEndpoint(uf, env);
  } catch {
    ufUrls = resolveNfceEndpoint('PR', env);
  }

  const cityIbge = digitsOnly(enterprise.cityIbgeCode);
  const cMunFG = cityIbge.length === 7 ? cityIbge : UF_CAPITAL_IBGE[uf] || `${cUF}06902`;

  const serieNum = Math.max(1, Number(digitsOnly(enterprise.nfceSeries || '1')) || 1);
  const seriePadded = String(serieNum).padStart(3, '0');
  const nNFNum = Number(input.nNF) > 0 ? Number(input.nNF) : Math.floor(1 + Math.random() * 899999);
  const nNFPadded = String(nNFNum).padStart(9, '0');
  const cNF = String(Math.floor(10000000 + Math.random() * 89999999)).slice(0, 8);

  const dh = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const safeDh = Number.isNaN(dh.getTime()) ? new Date() : dh;
  const aamm = `${String(safeDh.getUTCFullYear()).slice(2)}${String(safeDh.getUTCMonth() + 1).padStart(2, '0')}`;
  const dhEmi = safeDh.toISOString().replace(/\.\d{3}Z$/, '-03:00');

  const infId = buildInfNFeId({
    cUF,
    aamm,
    cnpj,
    mod: '65',
    serie: seriePadded,
    nNF: nNFPadded,
    tpEmis: '1',
    cNF,
  });
  const chNFe = infId.replace(/^NFe/, '');
  const cDV = chNFe.slice(-1);

  const ide = {
    cUF,
    cNF,
    natOp: 'VENDA',
    mod: '65',
    serie: String(serieNum),
    nNF: String(nNFNum),
    dhEmi,
    tpNF: '1',
    idDest: '1',
    cMunFG,
    tpImp: '4',
    tpEmis: '1',
    cDV,
    tpAmb,
    finNFe: '1',
    indFinal: '1',
    indPres: '1',
    procEmi: '0',
    verProc: 'ERP-Minimals-4.0',
  };

  let sumProd = 0;
  const detXml = (sale.items || [])
    .map((line, index) => {
      const product = productsById[line.productId] || {};
      const qty = Number(line.qty) || 1;
      const unitPrice = Number(line.unitPrice) || 0;
      const lineTotal = Number((qty * unitPrice).toFixed(2));
      sumProd += lineTotal;

      const ncm = digitsOnly(product.ncm || '21069090').padStart(8, '0').slice(0, 8);
      const cfop = digitsOnly(product.cfopSaleDefault || '5102').padStart(4, '0').slice(0, 4);
      const origin = product.origin ?? 0;
      const cstOrCsosn = String(product.cstOrCsosn || (crt === '3' ? '00' : '102'));
      const unit = String(product.commercialUnit || product.unit || 'UN').slice(0, 6);
      const vProd = moneyStr(lineTotal);
      const xProd =
        tpAmb === '2' && index === 0
          ? HOMOLOGATION_ITEM_DESC
          : String(line.productName || product.name || 'Item').slice(0, 120);

      const icmsXml = buildIcmsXml({ origin, cstOrCsosn, crt, vProd });
      const pisXml =
        '<PIS><PISOutr><CST>49</CST><vBC>0.00</vBC><pPIS>0.00</pPIS><vPIS>0.00</vPIS></PISOutr></PIS>';
      const cofinsXml =
        '<COFINS><COFINSOutr><CST>49</CST><vBC>0.00</vBC><pCOFINS>0.00</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS>';

      return `<det nItem="${index + 1}"><prod><cProd>${escapeXml(product.sku || line.productId || index + 1)}</cProd><cEAN>SEM GTIN</cEAN><xProd>${escapeXml(xProd)}</xProd><NCM>${escapeXml(ncm)}</NCM><CFOP>${escapeXml(cfop)}</CFOP><uCom>${escapeXml(unit)}</uCom><qCom>${qtyStr(qty)}</qCom><vUnCom>${moneyStr(unitPrice)}</vUnCom><vProd>${vProd}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>${escapeXml(unit)}</uTrib><qTrib>${qtyStr(qty)}</qTrib><vUnTrib>${moneyStr(unitPrice)}</vUnTrib><indTot>1</indTot></prod><imposto>${icmsXml}${pisXml}${cofinsXml}</imposto></det>`;
    })
    .join('');

  const payments =
    Array.isArray(sale.payments) && sale.payments.length > 0
      ? sale.payments
      : [{ method: 'cash', amount: sale.total ?? sumProd }];
  const pagXml = payments
    .map(
      (p) =>
        `<detPag><indPag>0</indPag><tPag>${paymentCode(p.method)}</tPag><vPag>${moneyStr(p.amount)}</vPag></detPag>`
    )
    .join('');

  const vProdTotal = moneyStr(sumProd > 0 ? sumProd : sale.subtotal ?? sale.total);
  const vDesc = moneyStr(sale.discount || sale.discountAmount || 0);
  const vNF = moneyStr(sale.total ?? Math.max(0, Number(vProdTotal) - Number(vDesc)));

  const qrCodeUrl = buildQrCodeV2Url({
    qrCodeBaseUrl: ufUrls.qrCodeBaseUrl,
    chNFe,
    tpAmb,
    cscId: input.csc?.cscId,
    cscToken: input.csc?.cscToken,
  });

  const destDoc = digitsOnly(sale.customerDocument);
  let destXml = '';
  if (destDoc.length === 11) {
    destXml = `<dest><CPF>${destDoc}</CPF><indIEDest>9</indIEDest></dest>`;
  } else if (destDoc.length === 14) {
    destXml = `<dest><CNPJ>${destDoc}</CNPJ><indIEDest>9</indIEDest></dest>`;
  }

  const ie = digitsOnly(enterprise.stateRegistration) || 'ISENTO';
  const cep = digitsOnly(enterprise.zipCode).padStart(8, '0').slice(0, 8);

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">` +
    `<infNFe Id="${infId}" versao="4.00">` +
    `<ide><cUF>${ide.cUF}</cUF><cNF>${ide.cNF}</cNF><natOp>${ide.natOp}</natOp><mod>${ide.mod}</mod><serie>${ide.serie}</serie><nNF>${ide.nNF}</nNF><dhEmi>${ide.dhEmi}</dhEmi><tpNF>${ide.tpNF}</tpNF><idDest>${ide.idDest}</idDest><cMunFG>${ide.cMunFG}</cMunFG><tpImp>${ide.tpImp}</tpImp><tpEmis>${ide.tpEmis}</tpEmis><cDV>${ide.cDV}</cDV><tpAmb>${ide.tpAmb}</tpAmb><finNFe>${ide.finNFe}</finNFe><indFinal>${ide.indFinal}</indFinal><indPres>${ide.indPres}</indPres><procEmi>${ide.procEmi}</procEmi><verProc>${ide.verProc}</verProc></ide>` +
    `<emit><CNPJ>${cnpj}</CNPJ><xNome>${escapeXml(enterprise.name || 'EMPRESA')}</xNome><enderEmit><xLgr>${escapeXml(enterprise.address || 'RUA PRINCIPAL')}</xLgr><nro>${escapeXml(enterprise.addressNumber || 'S/N')}</nro><xBairro>${escapeXml(enterprise.neighborhood || 'CENTRO')}</xBairro><cMun>${ide.cMunFG}</cMun><xMun>${escapeXml(enterprise.city || 'MUNICIPIO')}</xMun><UF>${escapeXml(uf)}</UF><CEP>${cep}</CEP><cPais>1058</cPais><xPais>BRASIL</xPais></enderEmit><IE>${escapeXml(ie)}</IE><CRT>${crt}</CRT></emit>` +
    `${destXml}` +
    `${detXml}` +
    `<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${vProdTotal}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>${vDesc}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${vNF}</vNF></ICMSTot></total>` +
    `<transp><modFrete>9</modFrete></transp>` +
    `<pag>${pagXml}</pag>` +
    `</infNFe>` +
    `<infNFeSupl><qrCode><![CDATA[${qrCodeUrl}]]></qrCode><urlChave>${escapeXml(ufUrls.urlChave)}</urlChave></infNFeSupl>` +
    `</NFe>`;

  return { xml, chNFe, qrCodeUrl, qrCodePayload: qrCodeUrl, ide };
}

module.exports = {
  buildNfceXml,
  buildInfNFeId,
  buildQrCodeV2Url,
  computeMod11Dv,
  HOMOLOGATION_ITEM_DESC,
};
