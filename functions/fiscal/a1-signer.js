const forge = require('node-forge');
const { SignedXml } = require('xml-crypto');

let cachedTestA1 = null;

/**
 * Load ICP-Brasil A1 (.pfx/.p12) from base64.
 * Matches leaf certificate to private key via localKeyId when chain certs are present.
 * Never log password or raw PFX.
 */
function loadPfx({ pfxBase64, password }) {
  if (!pfxBase64 || !password) {
    const err = new Error('A1 PFX and password are required');
    err.code = 'missing_fiscal_config';
    throw err;
  }
  const der = forge.util.decode64(String(pfxBase64).replace(/\s/g, ''));
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, String(password));

  const shroudedBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
    forge.pki.oids.pkcs8ShroudedKeyBag
  ] || [];
  const plainKeyBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[
    forge.pki.oids.keyBag
  ] || [];
  const keyBag = shroudedBags[0] || plainKeyBags[0];

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[
    forge.pki.oids.certBag
  ] || [];

  const keyLocalId = keyBag?.attributes?.localKeyId?.[0];
  let certBag =
    (keyLocalId
      ? certBags.find((b) => b?.attributes?.localKeyId?.[0] === keyLocalId)
      : null) ||
    certBags.find((b) => {
      const bc = b?.cert?.getExtension?.('basicConstraints');
      return !bc || !bc.cA;
    }) ||
    certBags[0];

  if (!keyBag?.key || !certBag?.cert) {
    const err = new Error('Could not extract key/certificate from PFX');
    err.code = 'missing_fiscal_config';
    throw err;
  }

  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
  const certificatePem = forge.pki.certificateToPem(certBag.cert);
  const asn1Cert = forge.pki.certificateToAsn1(certBag.cert);
  const derCert = forge.asn1.toDer(asn1Cert).getBytes();
  const md = forge.md.sha1.create();
  md.update(derCert);
  const thumbprint = md.digest().toHex().toUpperCase();
  const notAfter = certBag.cert.validity.notAfter;
  const a1ExpiresAt = notAfter instanceof Date ? notAfter.toISOString() : undefined;

  return { privateKeyPem, certificatePem, thumbprint, a1ExpiresAt };
}

/**
 * Generates an ephemeral self-signed RSA keypair/certificate for SEFAZ Simulator mode (no real A1).
 */
function generateSelfSignedTestA1(commonName = 'SIMULACAO SEFAZ ERP MINIMALS') {
  if (cachedTestA1) return cachedTestA1;

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs = [{ name: 'commonName', value: commonName }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  cachedTestA1 = {
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certificatePem: forge.pki.certificateToPem(cert),
    thumbprint: 'SIMULATED_A1_CERT',
    a1ExpiresAt: cert.validity.notAfter.toISOString(),
  };
  return cachedTestA1;
}

/**
 * Enveloped XMLDSig over infNFe Id (NF-e 4.00 pattern).
 * Inserts <Signature> after </infNFeSupl> when present (XSD order: infNFe -> infNFeSupl -> Signature).
 */
function signNfceXml({ xml, privateKeyPem, certificatePem }) {
  const idMatch =
    String(xml).match(/infNFe[^>]*\sId="([^"]+)"/i) || String(xml).match(/\sId="(NFe[^"]+)"/);
  if (!idMatch) {
    const err = new Error('infNFe Id attribute not found for signature');
    err.code = 'provider_reject';
    throw err;
  }
  const referenceUri = `#${idMatch[1]}`;

  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certificatePem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });

  sig.addReference({
    xpath: "//*[local-name(.)='infNFe']",
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    uri: referenceUri,
  });

  const hasSupl = /<infNFeSupl[\s>]/i.test(String(xml));
  sig.computeSignature(xml, {
    location: {
      reference: hasSupl ? "//*[local-name(.)='infNFeSupl']" : "//*[local-name(.)='infNFe']",
      action: 'after',
    },
  });
  return sig.getSignedXml();
}

module.exports = { loadPfx, signNfceXml, generateSelfSignedTestA1 };
