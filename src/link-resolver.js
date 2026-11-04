// Resolve links encurtados (meli.la, amzn.to, s.shopee.com.br, a.aliexpress.com, links de afiliado da Magalu
// e da TikTok Shop...) até a URL da loja, seguindo os redirecionamentos públicos: sem login, sem cookies,
// sem executar JavaScript. Só segue para domínios conhecidos de lojas e encurtadores.
import { canonicalUrl } from './offer.js';
import { storeFromUrl } from './promo-parser.js';
import { UA } from './http.js';

// identificação honesta, a mesma de src/http.js

// Domínios pelos quais o resolvedor aceita passar (lojas + encurtadores de afiliado)
const ALLOWED = /(^|\.)(meli\.la|mercadolivre\.com\.br|mercadolibre\.com|amzn\.to|a\.co|amazon\.com\.br|shp\.ee|shopee\.com\.br|aliexpress\.com|aliexpress\.us|magazineluiza\.com\.br|magalu\.com|magalu\.com\.br|mglu\.me|kabum\.com\.br|pichau\.com\.br|terabyteshop\.com\.br|tiktok\.com|vm\.tiktok\.com|shopee\.ee|magazinevoce\.com\.br|tidd\.ly|bit\.ly|tinyurl\.com|cutt\.ly|rebrand\.ly)$/i;
export const isAllowedHost = (u) => { try { return ALLOWED.test(new URL(u).hostname); } catch { return false; } };
// Encurtadores de afiliado: a página deles não é a do produto, então o redirecionamento em HTML é seguido.
const SHORTENER = /^(meli\.la|amzn\.to|a\.co|shp\.ee|s\.shopee\.com\.br|a\.aliexpress\.com|s\.click\.aliexpress\.com|mglu\.me|divulgador\.magalu\.com|vm\.tiktok\.com|shopee\.ee|tidd\.ly|bit\.ly|tinyurl\.com|cutt\.ly|rebrand\.ly)$/i;
export const isShortener = (u) => { try { return SHORTENER.test(new URL(u).hostname); } catch { return false; } };

// Redirecionamentos feitos no HTML (meta refresh ou location simples em script)
export function htmlRedirect(html, base) {
  const meta = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'>\s]+)/i)?.[1];
  const js = html.match(/(?:window\.)?location(?:\.href)?\s*=\s*["'](https?:\/\/[^"']+)["']/i)?.[1]
    ?? html.match(/location\.replace\(\s*["'](https?:\/\/[^"']+)["']\s*\)/i)?.[1];
  const alvo = meta ?? js;
  if (!alvo) return null;
  try { return new URL(alvo.replace(/&amp;/g, '&'), base).href; } catch { return null; }
}

// fetchImpl permite testar sem rede.
export async function resolveLink(url, { maxHops = 8, timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const chain = [];
  let atual = url;
  for (let i = 0; i < maxHops; i++) {
    if (!isAllowedHost(atual)) throw new Error(`link fora das lojas suportadas: ${new URL(atual).hostname}`);
    chain.push(atual);
    const res = await fetchImpl(atual, { redirect: 'manual', headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(timeoutMs) });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) { atual = new URL(loc, atual).href; continue; }
    if (res.status === 200) {
      const html = await res.text();
      const prox = htmlRedirect(html, atual);
      if (prox && prox !== atual && isShortener(atual)) { atual = prox; continue; }   // encurtador com redirecionamento em HTML
      return { finalUrl: atual, canonicalUrl: canonicalUrl(atual), store: storeFromUrl(atual), chain, html };
    }
    throw new Error(`HTTP ${res.status} ao abrir o link${[403, 429, 503].includes(res.status) ? ' (bloqueio anti-bot)' : ''}`);
  }
  throw new Error('redirecionamentos demais');
}
