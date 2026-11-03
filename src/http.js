// Requisições HTTP com cabeçalhos de navegador, timeout e cache curto.
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const cache = new Map(); // url -> {t, body}
const CACHE_MS = 8 * 60e3;

export async function fetchText(url, { headers = {}, timeoutMs = 20000, json = false, useCache = true } = {}) {
  const hit = useCache && cache.get(url);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.body;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.6',
      Accept: json ? 'application/json,text/plain,*/*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...headers,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
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
