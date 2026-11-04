// Requisições HTTP com timeout e cache curto. O SetupSniper se identifica como ele mesmo: nada de se passar
// por navegador (regra do projeto: não burlar proteção das lojas).
import { readFileSync } from 'node:fs';
const VERSAO = (() => { try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version; } catch { return '3'; } })();
export const UA = `SetupSniper/${VERSAO} (+https://github.com/phs-analytics/SetupSniper; uso pessoal)`;
const cache = new Map(); // url -> {t, body}
const CACHE_MS = 8 * 60e3;

export async function fetchText(url, { headers = {}, timeoutMs = 20000, json = false, useCache = true } = {}) {
  const hit = useCache && cache.get(url);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.body;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.6',
        Accept: json ? 'application/json,text/plain,*/*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...headers,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) { throw new Error(netError(e)); }
  if (!res.ok) {
    const blocked = [401, 403, 429, 503].includes(res.status);
    throw new Error(`HTTP ${res.status}${blocked ? ' (bloqueio anti-bot)' : ''}`);
  }
  const body = json ? await res.json() : await res.text();
  if (useCache) {
    cache.set(url, { t: Date.now(), body });
    if (cache.size > 300) cache.delete(cache.keys().next().value);
  }
  return body;
}

// "fetch failed" não diz nada: traduz a causa real (DNS, conexão recusada, tempo esgotado, certificado).
export function netError(e) {
  const c = e?.cause?.code ?? e?.code ?? '';
  if (e?.name === 'TimeoutError' || /TIMEOUT/.test(c)) return 'sem resposta (tempo esgotado)';
  if (c === 'ENOTFOUND' || c === 'EAI_AGAIN') return 'endereço não encontrado (DNS): o aparelho está sem internet ou a rede bloqueia o site';
  if (c === 'ECONNREFUSED') return 'conexão recusada';
  if (c === 'ECONNRESET' || c === 'UND_ERR_SOCKET') return 'a conexão foi cortada pelo site ou pela rede (possível bloqueio)';
  if (/CERT|SSL|TLS/i.test(c)) return 'problema de certificado (HTTPS) na rede';
  const msg = e?.cause?.message ?? e?.message ?? 'erro de rede';
  return `erro de rede: ${msg}`.slice(0, 160);
}
