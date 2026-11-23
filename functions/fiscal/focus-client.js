/**
 * Focus NFe HTTP helper (NFC-e v2).
 * Docs: https://doc.focusnfe.com.br/docs/nfce-operacoes-disponiveis-na-api
 * Auth: Basic with token as username and empty password.
 */

function getFocusBaseUrl(env) {
  return env === 'production'
    ? 'https://api.focusnfe.com.br'
    : 'https://homologacao.focusnfe.com.br';
}

async function focusRequest({ token, env, method, path, body }) {
  const auth = Buffer.from(`${token}:`).toString('base64');
  const res = await fetch(`${getFocusBaseUrl(env)}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.mensagem ||
      data?.message ||
      data?.erro ||
      (Array.isArray(data?.erros) && data.erros[0]?.mensagem) ||
      res.statusText;
    const err = new Error(msg || `Focus HTTP ${res.status}`);
    err.status = res.status;
    err.focus = data;
    throw err;
  }
  return data;
}

module.exports = { getFocusBaseUrl, focusRequest };
