/**
 * SEFAZ NFC-e authorization client (NFeAutorizacao4).
 * SOAP 1.2 envelope — verify action/namespace against pilot UF WSDL before prod.
 */

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
  const m = String(xml || '').match(re);
  return m ? m[1].trim() : '';
}

function buildSoapEnvelope(signedXml) {
  const compact = String(signedXml).replace(/<\?xml[^?]*\?>/i, '').trim();
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
    `xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body>` +
    `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">` +
    `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
    `<idLote>1</idLote><indSinc>1</indSinc>${compact}</enviNFe>` +
    `</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
}

async function autorizarNfce({ endpointUrl, signedXml, timeoutMs = 45000 }) {
  if (!endpointUrl || !signedXml) {
    const err = new Error('endpointUrl and signedXml are required');
    err.code = 'provider_reject';
    throw err;
  }

  const body = buildSoapEnvelope(signedXml);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
      },
      body,
      signal: controller.signal,
    });
  } catch (error) {
    const err = new Error(error?.name === 'AbortError' ? 'SEFAZ timeout' : error.message || 'SEFAZ network error');
    err.code = 'network';
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text();
  if (!res.ok) {
    const err = new Error(`SEFAZ HTTP ${res.status}`);
    err.code = 'sefaz_unavailable';
    err.sefaz = { raw: raw.slice(0, 2000) };
    throw err;
  }

  const cStat = extractTag(raw, 'cStat') || extractTag(raw, 'cStat');
  const xMotivo = extractTag(raw, 'xMotivo');
  const chNFe = extractTag(raw, 'chNFe');
  const nProt = extractTag(raw, 'nProt');
  const nNF = extractTag(raw, 'nNF');

  // 100 = autorizado uso NFe; 150 = autorizado fora de prazo (treat as authorized)
  if (cStat === '100' || cStat === '150') {
    return {
      status: 'authorized',
      nfceKey: chNFe,
      nfceProtocol: nProt,
      nfceNumber: nNF,
      cStat,
      xMotivo,
      raw,
    };
  }

  return {
    status: 'rejected',
    nfceKey: chNFe || '',
    nfceProtocol: nProt || '',
    nfceNumber: nNF || '',
    cStat,
    xMotivo: xMotivo || `SEFAZ cStat=${cStat || 'unknown'}`,
    raw,
  };
}

module.exports = { autorizarNfce, buildSoapEnvelope, extractTag };
