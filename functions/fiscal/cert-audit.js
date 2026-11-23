/**
 * Multi-tenant A1 helpers — expiry gate + log redaction.
 * Never log password or PFX bytes.
 */

function isCertExpired(a1ExpiresAt, now = new Date()) {
  if (!a1ExpiresAt) return false;
  const expires = new Date(a1ExpiresAt);
  if (Number.isNaN(expires.getTime())) return false;
  return expires.getTime() <= now.getTime();
}

function assertA1NotExpired(secrets, now = new Date()) {
  const expiresAt = secrets?.a1ExpiresAt;
  if (isCertExpired(expiresAt, now)) {
    const err = new Error(`A1 certificate expired at ${expiresAt}`);
    err.code = 'cert_expired';
    throw err;
  }
}

function redactFiscalLog(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value
      .replace(/a1Password["']?\s*[:=]\s*["'][^"']*["']/gi, 'a1Password:[REDACTED]')
      .replace(/a1PfxBase64["']?\s*[:=]\s*["'][^"']*["']/gi, 'a1PfxBase64:[REDACTED]')
      .replace(/password["']?\s*[:=]\s*["'][^"']*["']/gi, 'password:[REDACTED]');
  }
  if (typeof value === 'object') {
    const out = Array.isArray(value) ? [] : {};
    for (const [key, val] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (
        lower.includes('password') ||
        lower.includes('pfx') ||
        lower === 'apitoken' ||
        lower === 'csctoken'
      ) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactFiscalLog(val);
      }
    }
    return out;
  }
  return value;
}

module.exports = { isCertExpired, assertA1NotExpired, redactFiscalLog };
