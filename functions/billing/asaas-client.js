function getAsaasBaseUrl(env) {
  return env === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
}

async function asaasRequest({ apiKey, env, method, path, body }) {
  const res = await fetch(`${getAsaasBaseUrl(env)}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      access_token: apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || data?.message || res.statusText;
    const err = new Error(msg);
    err.status = res.status;
    err.asaas = data;
    throw err;
  }
  return data;
}

module.exports = { getAsaasBaseUrl, asaasRequest };
