// Login OFICIAL na conta do Mercado Livre do próprio usuário (OAuth 2.0, "authorization code").
// O usuário autoriza no site do Mercado Livre; o SetupSniper recebe um token só para LER a API
// (busca, catálogo, vendedores). Não compra, não vê dados de comprador, não guarda a senha.
//
// Como o Mercado Livre só aceita endereço de retorno HTTPS cadastrado no app, há dois jeitos de concluir:
//   1. automático: ML_REDIRECT_URI aponta para https://<seu-servidor>/auth/ml/callback (ex.: Tailscale Serve);
//   2. colar o endereço: o navegador vai para o endereço cadastrado (que pode nem abrir) e o usuário cola
//      esse endereço (com ?code=...) na aba Lojas.
// Tokens ficam em data/ml-auth.json (fora do git). [não verificado ao vivo]
import { randomBytes } from 'node:crypto';
import { netError } from './http.js';

export const ML_AUTH_HOST = 'https://auth.mercadolivre.com.br/authorization';
export const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';

export const newState = () => randomBytes(16).toString('hex');

export function authUrl({ clientId, redirectUri, state }) {
  const u = new URL(ML_AUTH_HOST);
  u.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state }).toString();
  return u.href;
}

// Aceita o código puro ("TG-...") ou o endereço inteiro para onde o Mercado Livre levou o navegador.
export function codeFromInput(input) {
  const t = String(input ?? '').trim();
  if (!t) return { code: null, state: null };
  try {
    const u = new URL(t);
    if (u.searchParams.get('error')) return { code: null, state: u.searchParams.get('state'), error: u.searchParams.get('error_description') ?? u.searchParams.get('error') };
    return { code: u.searchParams.get('code'), state: u.searchParams.get('state') };
  } catch {
    return /^[A-Za-z0-9_-]{8,200}$/.test(t) ? { code: t, state: null } : { code: null, state: null };
  }
}

async function tokenRequest(params, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(ML_TOKEN_URL, { method: 'POST', body: new URLSearchParams(params),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  } catch (e) { throw new Error(netError(e)); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`o Mercado Livre recusou: ${j.message ?? j.error_description ?? j.error ?? 'HTTP ' + res.status}`);
  return j;
}

// Troca o código pelo token. Retorna o que deve ser salvo em data/ml-auth.json.
export async function exchangeCode({ clientId, clientSecret, redirectUri, code, now = Date.now(), fetchImpl = fetch }) {
  const j = await tokenRequest({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }, fetchImpl);
  return toStored(j, now);
}

// Renova com o refresh token (o do Mercado Livre é de uso único: sempre salve o novo).
export async function refreshToken({ clientId, clientSecret, refresh, now = Date.now(), fetchImpl = fetch }) {
  const j = await tokenRequest({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refresh }, fetchImpl);
  return toStored(j, now);
}

const toStored = (j, now) => ({
  accessToken: j.access_token, refreshToken: j.refresh_token ?? null, userId: j.user_id ?? null,
  expiresAt: now + (j.expires_in ?? 21600) * 1000, obtainedAt: now,
});

// Token válido (renova quando faltar menos de 5 min). save(novo) persiste a renovação.
export async function validToken(stored, { clientId, clientSecret, save, now = Date.now(), fetchImpl = fetch }) {
  if (!stored?.accessToken) return null;
  if (stored.expiresAt - now > 5 * 60e3) return stored.accessToken;
  if (!stored.refreshToken) return null;   // app sem "offline_access": precisa conectar de novo
  const novo = await refreshToken({ clientId, clientSecret, refresh: stored.refreshToken, now, fetchImpl });
  await save?.({ ...stored, ...novo, nickname: stored.nickname });
  return novo.accessToken;
}
