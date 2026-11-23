function hasText(value) {
  return Boolean(value && String(value).trim());
}

function isValidOrigin(origin) {
  return typeof origin === 'number' && Number.isInteger(origin) && origin >= 0 && origin <= 8;
}

function productReady(product) {
  return hasText(product.ncm) && isValidOrigin(product.origin) && hasText(product.cstOrCsosn);
}

function canEmitNfce(enterprise, products) {
  if (!enterprise.nfceEnabled) {
    return {
      ok: false,
      code: 'missing_fiscal_config',
      message: 'NFC-e is disabled for this enterprise',
    };
  }

  if (!enterprise.hasIssuerCredentials) {
    return {
      ok: false,
      code: 'missing_fiscal_config',
      message: 'Fiscal issuer credentials are missing',
    };
  }

  if (!enterprise.taxRegime || !hasText(enterprise.nfceSeries) || !enterprise.nfceEnvironment) {
    return {
      ok: false,
      code: 'missing_fiscal_config',
      message: 'Fiscal enterprise settings are incomplete',
    };
  }

  if (!products.length || products.some((p) => !productReady(p))) {
    return {
      ok: false,
      code: 'missing_fiscal_product_data',
      message: 'One or more products lack NCM, origin, or CST/CSOSN',
    };
  }

  return { ok: true };
}

function nextNfceStatus(current, event) {
  if (event === 'enqueue') {
    if (current === 'none' || current === 'error' || current === 'pending') return 'pending';
    return current;
  }

  if (event === 'authorize') {
    if (current === 'pending') return 'authorized';
    return current;
  }

  if (event === 'fail') {
    if (current === 'pending') return 'error';
    return current;
  }

  if (event === 'retry') {
    if (current === 'error' || current === 'pending') return 'pending';
    return current;
  }

  if (event === 'cancel') {
    if (current === 'authorized') return 'cancelled';
    return current;
  }

  return current;
}

module.exports = { canEmitNfce, nextNfceStatus };
