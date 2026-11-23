/**
 * SEFAZ NFC-e SOAP 1.2 client with native Node.js HTTPS mTLS (A1 certificate).
 * Supports NFeAutorizacao4 and NFeStatusServico4 without third-party fiscal intermediaries.
 */

const https = require('node:https');

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
  const m = String(xml || '').match(re);
  return m ? m[1].trim() : '';
}

function buildSoapEnvelope(signedXml) {
  const compact = String(signedXml).replace(/<\?xml[^?]*\?>/i, '').trim();
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
    `xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body>` +
    `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">` +
    `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
    `<idLote>1</idLote><indSinc>1</indSinc>${compact}</enviNFe>` +
    `</nfeDadosMsg></soap12:Body></soap12:Envelope>`
  );
}

function buildStatusServicoEnvelope({ cUF, environment }) {
  const tpAmb = environment === 'production' ? '1' : '2';
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
    `xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body>` +
    `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">` +
    `<consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
    `<tpAmb>${tpAmb}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ>` +
    `</consStatServ>` +
    `</nfeDadosMsg></soap12:Body></soap12:Envelope>`
  );
}

function postSoapMtls({ endpointUrl, body, certificatePem, privateKeyPem, timeoutMs = 45000 }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(endpointUrl);
    const payloadBuf = Buffer.from(body, 'utf8');

    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        cert: certificatePem,
        key: privateKeyPem,
        rejectUnauthorized: true,
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          'Content-Length': payloadBuf.length,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            raw: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('SEFAZ timeout'));
    });

    req.on('error', (error) => {
      const err = new Error(error?.message || 'SEFAZ network error');
      err.code = 'network';
      reject(err);
    });

    req.write(payloadBuf);
    req.end();
  });
}

async function autorizarNfce({
  endpointUrl,
  signedXml,
  certificatePem,
  privateKeyPem,
  timeoutMs = 45000,
}) {
  if (!endpointUrl || !signedXml) {
    const err = new Error('endpointUrl and signedXml are required');
    err.code = 'provider_reject';
    throw err;
  }

  const body = buildSoapEnvelope(signedXml);
  const { statusCode, raw } = await postSoapMtls({
    endpointUrl,
    body,
    certificatePem,
    privateKeyPem,
    timeoutMs,
  });

  if (statusCode < 200 || statusCode >= 300) {
    const err = new Error(`SEFAZ HTTP ${statusCode}`);
    err.code = 'sefaz_unavailable';
    err.sefaz = { raw: raw.slice(0, 2000) };
    throw err;
  }

  const cStat = extractTag(raw, 'cStat');
  const xMotivo = extractTag(raw, 'xMotivo');
  const chNFe = extractTag(raw, 'chNFe');
  const nProt = extractTag(raw, 'nProt');
  const nNF = extractTag(raw, 'nNF');

  // 100 = autorizado uso NFe; 150 = autorizado fora de prazo
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

async function consultarStatusServico({
  endpointUrl,
  cUF,
  environment = 'homologation',
  certificatePem,
  privateKeyPem,
  timeoutMs = 20000,
}) {
  const body = buildStatusServicoEnvelope({ cUF, environment });
  const { statusCode, raw } = await postSoapMtls({
    endpointUrl,
    body,
    certificatePem,
    privateKeyPem,
    timeoutMs,
  });

  if (statusCode < 200 || statusCode >= 300) {
    const err = new Error(`SEFAZ Status HTTP ${statusCode}`);
    err.code = 'sefaz_unavailable';
    throw err;
  }

  const cStat = extractTag(raw, 'cStat');
  const xMotivo = extractTag(raw, 'xMotivo');
  return {
    online: cStat === '107',
    cStat,
    xMotivo,
  };
}

module.exports = {
  autorizarNfce,
  consultarStatusServico,
  buildSoapEnvelope,
  buildStatusServicoEnvelope,
  extractTag,
};
