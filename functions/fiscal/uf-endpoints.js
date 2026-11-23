/**
 * NFC-e authorization WebService URLs by UF (modelo 65).
 *
 * Sources (consulted 2026-11-23):
 * - SVRS (PA): https://dfe-portal.svrs.rs.gov.br/NFCE/Servicos
 * - PR próprio: https://sped.fazenda.pr.gov.br/NFCe/Pagina/Web-Services-NFC-e
 *   (também listado no portal SVRS sob “SEFAZ Paraná”)
 *
 * PA uses SEFAZ Virtual RS (SVRS). PR uses SEFAZ-PR own NFC-e endpoints.
 * Add more UFs only after confirming the autorizador on the official portal.
 * Re-verify URLs before production go-live.
 */

const SVRS_NFCE_AUTORIZACAO = {
  homologation: 'https://nfce-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
  production: 'https://nfce.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
  notes: 'SVRS NFC-e NFeAutorizacao 4.00 — dfe-portal.svrs.rs.gov.br/NFCE/Servicos (2026-11-23)',
};

/** SEFAZ-PR — URL sem ?wsdl (só para obtenção do WSDL no browser). */
const PR_NFCE_AUTORIZACAO = {
  homologation: 'https://homologacao.nfce.sefa.pr.gov.br/nfce/NFeAutorizacao4',
  production: 'https://nfce.sefa.pr.gov.br/nfce/NFeAutorizacao4',
  notes: 'SEFAZ-PR NFC-e NFeAutorizacao 4.00 — sped.fazenda.pr.gov.br/NFCe/Pagina/Web-Services-NFC-e (2026-11-23)',
};

/** @type {Record<string, { homologation: string, production: string, notes?: string }>} */
const NFCE_UF_ENDPOINTS = {
  // Pilot SaaS UFs
  PA: { ...SVRS_NFCE_AUTORIZACAO },
  PR: { ...PR_NFCE_AUTORIZACAO },
};

function resolveNfceEndpoint(uf, environment) {
  const key = String(uf || '')
    .trim()
    .toUpperCase();
  const row = NFCE_UF_ENDPOINTS[key];
  if (!row) {
    const err = new Error(`UF not enabled for SEFAZ-direct: ${key}`);
    err.code = 'uf_not_supported';
    throw err;
  }
  const env = environment === 'production' ? 'production' : 'homologation';
  return { uf: key, url: row[env], environment: env };
}

module.exports = { NFCE_UF_ENDPOINTS, resolveNfceEndpoint };
