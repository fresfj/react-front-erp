const forge = require('node-forge');
const { SignedXml } = require('xml-crypto');

/**
 * Load ICP-Brasil A1 (.pfx/.p12) from base64.
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

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const keyBag = (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0];
  const certBag = (certBags[forge.pki.oids.certBag] || [])[0];
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
 * Enveloped XMLDSig over infNFe Id (NFe pattern).
 * Validate against SEFAZ homolog before production — namespaces/transforms may need NT tweaks.
 */
function signNfceXml({ xml, privateKeyPem, certificatePem }) {
  const idMatch = String(xml).match(/InfNFe[^>]*\sId="([^"]+)"/i) || String(xml).match(/\sId="(NFe[^"]+)"/);
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

  sig.computeSignature(xml, {
    location: { reference: "//*[local-name(.)='infNFe']", action: 'after' },
  });
  return sig.getSignedXml();
}

module.exports = { loadPfx, signNfceXml };
