// Peças comuns às fontes oficiais (Awin, Lomadee, Amazon Creators API).
// Sem cabeçalho de navegador, sem cookie: cada chamada se identifica só com a credencial do próprio usuário.
import { netError } from '../http.js';
import { parseBRL, toCents } from '../offer.js';
import { limiterFor } from '../rate-limit.js';

export const env = (k) => (process.env[k] ?? '').trim();
export const missingVars = (names) => names.filter(k => !env(k));

// "1869.99 BRL" / "R$ 1.869,99" / 1869.99 → 186999 centavos. Moeda diferente de BRL → null (não mistura moedas).
export function moneyCents(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return toCents(v);
  const s = String(v).trim();
  const cur = s.match(/\b([A-Z]{3})\b/)?.[1];
  if (cur && cur !== 'BRL') return null;
  return toCents(parseBRL(s.replace(/\b[A-Z]{3}\b/, '')));
}
// Os adaptadores entregam o formato "cru" de normalizeOffer (reais); a conta é feita em centavos inteiros
// e só convertida no fim (cents / 100 volta exato em normalizeOffer → Math.round(x * 100)).
export const reais = (cents) => (Number.isInteger(cents) && cents > 0 ? cents / 100 : null);

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Todos os termos da busca aparecem no título (sem acento; "1 tb" também casa com "1tb").
export function matchesQuery(title, q) {
  const t = fold(title);
  const compact = t.replace(/[^a-z0-9]+/g, '');
  const terms = fold(q).split(/[^a-z0-9]+/).filter(Boolean);
  return terms.length > 0 && terms.every(w => t.includes(w) || compact.includes(w));
}

function httpMessage(nome, status, hint) {
  if (status === 401 || status === 403) return `${nome}: HTTP ${status} (credencial recusada${hint ? `: ${hint}` : ''})`;
  if (status === 429) return `${nome}: HTTP 429 (limite de chamadas da API atingido; tente de novo em alguns minutos)`;
  if (status === 404) return `${nome}: HTTP 404 (endereço ou recurso não encontrado na API)`;
  return `${nome}: HTTP ${status}`;
}

// Chamada a uma API oficial: pega a ficha de cada limite (data/source-limits.json), chama e traduz erros.
export async function callApi(url, { nome, limits = [], fetchImpl = fetch, hint, timeoutMs = 20000, now, sleep, maxWaitMs, ...opts } = {}) {
  for (const l of limits) await limiterFor(l).take({ ...(maxWaitMs != null ? { maxWaitMs } : {}), ...(now ? { now } : {}), ...(sleep ? { sleep } : {}) });
  let res;
  try { res = await fetchImpl(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) }); }
  catch (e) { throw new Error(`${nome}: ${netError(e)}`); }
  if (!res.ok) throw new Error(httpMessage(nome, res.status, hint));
  return res;
}

export async function readJson(res, nome) {
  try { return await res.json(); } catch { throw new Error(`${nome}: a resposta não veio em JSON`); }
}
