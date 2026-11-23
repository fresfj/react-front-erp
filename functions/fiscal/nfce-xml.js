/**
 * Minimal NFC-e (modelo 65) XML builder for SEFAZ-direct.
 * Expands as needed for pilot UF schema / NT — not a full fiscal engine.
 */

const UF_IBGE = {
  PA: '15',
  SP: '35',
  RJ: '33',
  AM: '13',
};

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function moneyStr(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
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
  return '99';
}

function buildInfNFeId({ cUF, aamm, cnpj, mod, serie, nNF, tpEmis, cNF }) {
  const base = `${cUF}${aamm}${cnpj}${mod}${serie}${nNF}${tpEmis}${cNF}`;
  // Simplified check digit placeholder — replace with modulo-11 before prod if required by schema tooling
  let weight = 2;
  let sum = 0;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    sum += Number(base[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const mod11 = sum % 11;
  const dv = mod11 === 0 || mod11 === 1 ? 0 : 11 - mod11;
  return `NFe${base}${dv}`;
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
  const uf = String(enterprise.state || 'PA').toUpperCase();
  const cUF = UF_IBGE[uf] || '15';
  const serie = String(enterprise.nfceSeries || '1').padStart(3, '0');
  const nNF = String(Math.floor(100000 + Math.random() * 900000)).padStart(9, '0');
  const cNF = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const dh = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const aamm = `${String(dh.getUTCFullYear()).slice(2)}${String(dh.getUTCMonth() + 1).padStart(2, '0')}`;
  const dhEmi = dh.toISOString().replace(/\.\d{3}Z$/, '-03:00');

  const ide = {
    cUF,
    cNF,
    natOp: 'VENDA',
    mod: '65',
    serie: String(Number(serie)),
    nNF: String(Number(nNF)),
    dhEmi,
    tpNF: '1',
    idDest: '1',
    cMunFG: `${cUF}00000`,
    tpImp: '4',
    tpEmis: '1',
    tpAmb,
    finNFe: '1',
    indFinal: '1',
    indPres: '1',
    procEmi: '0',
    verProc: 'ERP-Minimals-1.0',
  };

  const infId = buildInfNFeId({
    cUF,
    aamm,
    cnpj,
    mod: '65',
    serie: serie.padStart(3, '0'),
    nNF,
    tpEmis: '1',
    cNF,
  });

  const detXml = (sale.items || [])
    .map((line, index) => {
      const product = productsById[line.productId] || {};
      const qty = Number(line.qty) || 1;
      const unitPrice = Number(line.unitPrice) || 0;
      const ncm = String(product.ncm || '00000000');
      const cfop = String(product.cfopSaleDefault || '5102');
      const origin = String(product.origin ?? 0);
      const cst = String(product.cstOrCsosn || '102');
      const unit = String(product.commercialUnit || product.unit || 'UN');
      const vProd = moneyStr(qty * unitPrice);
      return `<det nItem="${index + 1}"><prod><cProd>${escapeXml(product.sku || line.productId || index + 1)}</cProd><cEAN>SEM GTIN</cEAN><xProd>${escapeXml(line.productName || product.name || 'Item')}</xProd><NCM>${escapeXml(ncm)}</NCM><CFOP>${escapeXml(cfop)}</CFOP><uCom>${escapeXml(unit)}</uCom><qCom>${qty}</qCom><vUnCom>${moneyStr(unitPrice)}</vUnCom><vProd>${vProd}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>${escapeXml(unit)}</uTrib><qTrib>${qty}</qTrib><vUnTrib>${moneyStr(unitPrice)}</vUnTrib><indTot>1</indTot></prod><imposto><ICMS><ICMSSN102><orig>${escapeXml(origin)}</orig><CSOSN>${escapeXml(cst)}</CSOSN></ICMSSN102></ICMS></imposto></det>`;
    })
    .join('');

  const payments = sale.payments || [{ method: '01', amount: sale.total }];
  const pagXml = payments
    .map(
      (p) =>
        `<detPag><tPag>${paymentCode(p.method)}</tPag><vPag>${moneyStr(p.amount)}</vPag></detPag>`
    )
    .join('');

  const vProd = moneyStr(sale.subtotal ?? sale.total);
  const vDesc = moneyStr(sale.discount || sale.discountAmount || 0);
  const vNF = moneyStr(sale.total);

  const cscId = input.csc?.cscId || '';
  const qrCodePayload = `NFC-e|ch=${infId}|csc=${cscId}|amb=${tpAmb}`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="${infId}" versao="4.00"><ide><cUF>${ide.cUF}</cUF><cNF>${ide.cNF}</cNF><natOp>${ide.natOp}</natOp><mod>${ide.mod}</mod><serie>${ide.serie}</serie><nNF>${ide.nNF}</nNF><dhEmi>${ide.dhEmi}</dhEmi><tpNF>${ide.tpNF}</tpNF><idDest>${ide.idDest}</idDest><cMunFG>${ide.cMunFG}</cMunFG><tpImp>${ide.tpImp}</tpImp><tpEmis>${ide.tpEmis}</tpEmis><cDV>0</cDV><tpAmb>${ide.tpAmb}</tpAmb><finNFe>${ide.finNFe}</finNFe><indFinal>${ide.indFinal}</indFinal><indPres>${ide.indPres}</indPres><procEmi>${ide.procEmi}</procEmi><verProc>${ide.verProc}</verProc></ide><emit><CNPJ>${cnpj}</CNPJ><xNome>${escapeXml(enterprise.name)}</xNome><enderEmit><xLgr>${escapeXml(enterprise.address || 'RUA')}</xLgr><nro>${escapeXml(enterprise.addressNumber || 'S/N')}</nro><xBairro>${escapeXml(enterprise.neighborhood || 'CENTRO')}</xBairro><cMun>${ide.cMunFG}</cMun><xMun>${escapeXml(enterprise.city || 'MUNICIPIO')}</xMun><UF>${escapeXml(uf)}</UF><CEP>${digitsOnly(enterprise.zipCode).padStart(8, '0').slice(0, 8)}</CEP><cPais>1058</cPais><xPais>BRASIL</xPais></enderEmit><IE>${escapeXml(enterprise.stateRegistration || 'ISENTO')}</IE><CRT>1</CRT></emit>${detXml}<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${vProd}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>${vDesc}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${vNF}</vNF></ICMSTot></total><transp><modFrete>9</modFrete></transp><pag>${pagXml}</pag><infNFeSupl><qrCode>${escapeXml(qrCodePayload)}</qrCode><urlChave>http://www.fazenda.pr.gov.br/nfce/consulta</urlChave></infNFeSupl></infNFe></NFe>`;

  return { xml, qrCodePayload, ide };
}

module.exports = { buildNfceXml, buildInfNFeId };
