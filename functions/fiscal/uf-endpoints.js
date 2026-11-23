/**
 * Official NFC-e (modelo 65) WebService URLs, QR Code v2 and Consulta Chave URLs by UF.
 *
 * Covers primary UFs: PR (own SEFAZ), SP (own SEFAZ), PA, SC, RJ (SVRS), plus other SVRS states.
 * Always re-verify endpoints on portal.svrs.rs.gov.br / sped.fazenda.pr.gov.br / fazenda.sp.gov.br
 * before production go-live.
 */

const UF_IBGE = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
  MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29',
  MG: '31', ES: '32', RJ: '33', SP: '35',
  PR: '41', SC: '42', RS: '43',
  MS: '50', MT: '51', GO: '52', DF: '53',
};

const UF_CAPITAL_IBGE = {
  PR: '4106902', // Curitiba
  PA: '1501402', // Belem
  SP: '3550308', // Sao Paulo
  SC: '4205407', // Florianopolis
  RJ: '3304557', // Rio de Janeiro
  RS: '4314902', // Porto Alegre
  MG: '3106200', // Belo Horizonte
  ES: '3205309', // Vitoria
  DF: '5300108', // Brasilia
  BA: '2927408', // Salvador
  PE: '2611606', // Recife
  CE: '2304400', // Fortaleza
  AM: '1302603', // Manaus
  GO: '5208707', // Goiania
  MT: '5103403', // Cuiaba
  MS: '5002704', // Campo Grande
};

const SVRS_WS = {
  homologation: 'https://nfce-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
  production: 'https://nfce.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
  statusHomologation: 'https://nfce-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
  statusProduction: 'https://nfce.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
};

const PR_WS = {
  homologation: 'https://homologacao.nfce.sefa.pr.gov.br/nfce/NFeAutorizacao4',
  production: 'https://nfce.sefa.pr.gov.br/nfce/NFeAutorizacao4',
  statusHomologation: 'https://homologacao.nfce.sefa.pr.gov.br/nfce/NFeStatusServico4',
  statusProduction: 'https://nfce.sefa.pr.gov.br/nfce/NFeStatusServico4',
};

const SP_WS = {
  homologation: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx',
  production: 'https://nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx',
  statusHomologation: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx',
  statusProduction: 'https://nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx',
};

const NFCE_UF_ENDPOINTS = {
  PR: {
    ...PR_WS,
    qrCodeHomologation: 'http://www.fazenda.pr.gov.br/nfce/qrcode',
    qrCodeProduction: 'http://www.fazenda.pr.gov.br/nfce/qrcode',
    urlChaveHomologation: 'http://www.fazenda.pr.gov.br/nfce/consulta',
    urlChaveProduction: 'http://www.fazenda.pr.gov.br/nfce/consulta',
    notes: 'SEFAZ-PR proprio NFC-e 4.00',
  },
  PA: {
    ...SVRS_WS,
    qrCodeHomologation: 'https://appnfc.sefa.pa.gov.br/portal-homologacao/view/consultas/nfce/nfceForm.seam',
    qrCodeProduction: 'https://appnfc.sefa.pa.gov.br/portal/view/consultas/nfce/nfceForm.seam',
    urlChaveHomologation: 'https://appnfc.sefa.pa.gov.br/portal-homologacao/view/consultas/nfce/consultanfce.seam',
    urlChaveProduction: 'https://appnfc.sefa.pa.gov.br/portal/view/consultas/nfce/consultanfce.seam',
    notes: 'SVRS NFC-e 4.00 (Para)',
  },
  SP: {
    ...SP_WS,
    qrCodeHomologation: 'https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode',
    qrCodeProduction: 'https://www.nfce.fazenda.sp.gov.br/qrcode',
    urlChaveHomologation: 'https://www.homologacao.nfce.fazenda.sp.gov.br/consulta',
    urlChaveProduction: 'https://www.nfce.fazenda.sp.gov.br/consulta',
    notes: 'SEFAZ-SP proprio NFC-e 4.00',
  },
  SC: {
    ...SVRS_WS,
    qrCodeHomologation: 'https://hom.sat.sef.sc.gov.br/nfce/consulta',
    qrCodeProduction: 'https://sat.sef.sc.gov.br/nfce/consulta',
    urlChaveHomologation: 'https://hom.sat.sef.sc.gov.br/nfce/consulta',
    urlChaveProduction: 'https://sat.sef.sc.gov.br/nfce/consulta',
    notes: 'SVRS NFC-e 4.00 (Santa Catarina)',
  },
  RJ: {
    ...SVRS_WS,
    qrCodeHomologation: 'https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode',
    qrCodeProduction: 'https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode',
    urlChaveHomologation: 'https://consultadfe.fazenda.rj.gov.br/consultaDFe',
    urlChaveProduction: 'https://consultadfe.fazenda.rj.gov.br/consultaDFe',
    notes: 'SVRS NFC-e 4.00 (Rio de Janeiro)',
  },
  RS: {
    ...SVRS_WS,
    qrCodeHomologation: 'https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx',
    qrCodeProduction: 'https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx',
    urlChaveHomologation: 'https://www.sefaz.rs.gov.br/nfce/consulta',
    urlChaveProduction: 'https://www.sefaz.rs.gov.br/nfce/consulta',
    notes: 'SVRS NFC-e 4.00 (Rio Grande do Sul)',
  },
  ES: {
    ...SVRS_WS,
    qrCodeHomologation: 'https://homologacao.sefaz.es.gov.br/ConsultaNFCe/qrcode.aspx',
    qrCodeProduction: 'https://app.sefaz.es.gov.br/ConsultaNFCe/qrcode.aspx',
    urlChaveHomologation: 'https://homologacao.sefaz.es.gov.br/ConsultaNFCe',
    urlChaveProduction: 'https://app.sefaz.es.gov.br/ConsultaNFCe',
    notes: 'SVRS NFC-e 4.00 (Espirito Santo)',
  },
  DF: {
    ...SVRS_WS,
    qrCodeHomologation: 'http://dec.fazenda.df.gov.br/ConsultarNFCe.aspx',
    qrCodeProduction: 'http://dec.fazenda.df.gov.br/ConsultarNFCe.aspx',
    urlChaveHomologation: 'http://www.fazenda.df.gov.br/nfce/consulta',
    urlChaveProduction: 'http://www.fazenda.df.gov.br/nfce/consulta',
    notes: 'SVRS NFC-e 4.00 (Distrito Federal)',
  },
};

function resolveNfceEndpoint(uf, environment) {
  const key = String(uf || 'PR')
    .trim()
    .toUpperCase();
  const row = NFCE_UF_ENDPOINTS[key];
  if (!row) {
    const err = new Error(`UF not enabled for SEFAZ-direct: ${key}`);
    err.code = 'uf_not_supported';
    throw err;
  }
  const env = environment === 'production' ? 'production' : 'homologation';
  const isProd = env === 'production';
  return {
    uf: key,
    cUF: UF_IBGE[key] || '41',
    url: isProd ? row.production : row.homologation,
    statusUrl: isProd ? row.statusProduction : row.statusHomologation,
    qrCodeBaseUrl: isProd ? row.qrCodeProduction : row.qrCodeHomologation,
    urlChave: isProd ? row.urlChaveProduction : row.urlChaveHomologation,
    environment: env,
  };
}

module.exports = {
  UF_IBGE,
  UF_CAPITAL_IBGE,
  NFCE_UF_ENDPOINTS,
  resolveNfceEndpoint,
};
