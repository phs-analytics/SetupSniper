// Extração de preço a partir da página de produto.
// Estratégia em camadas (da mais confiável para a menos):
//   1. JSON-LD schema.org Product/Offer (usado por quase todas as lojas)
//   2. Metatags de preço (product:price:amount, itemprop=price)
//   3. Padrões específicos (KaBuM __NEXT_DATA__, Amazon a-offscreen, etc.)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export function parseBRL(s) {
  if (typeof s === 'number') return s;
  if (!s) return null;
  let t = String(s).replace(/[^\d.,]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');   // "1.234" = mil duzentos e trinta e quatro
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function* walk(node) {
  if (Array.isArray(node)) { for (const n of node) yield* walk(n); return; }
  if (node && typeof node === 'object') {
    yield node;
    for (const v of Object.values(node)) if (v && typeof v === 'object') yield* walk(v);
  }
}

const isType = (n, t) => [].concat(n['@type'] || []).some(x => String(x).toLowerCase() === t);

function fromJsonLd(html) {
  const out = [];
  let title = null, available = null;
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    for (const n of walk(data)) {
      if (isType(n, 'product')) title ??= n.name;
      if (isType(n, 'offer') || isType(n, 'aggregateoffer')) {
        const p = parseBRL(n.lowPrice ?? n.price ?? n.priceSpecification?.price);
        if (p) out.push(p);
        if (n.availability) available ??= !/OutOfStock|SoldOut|Discontinued/i.test(n.availability);
      }
    }
  }
  return { prices: out, title, available };
}

function fromMeta(html) {
  const out = [];
  const re = /<meta[^>]+(?:property|itemprop|name)=["'](?:product:price:amount|og:price:amount|price)["'][^>]*content=["']([^"']+)["']/gi;
  for (const m of html.matchAll(re)) { const p = parseBRL(m[1]); if (p) out.push(p); }
  return out;
}

function fromStoreSpecific(html, storeId) {
  const out = [];
  const grab = (re) => { for (const m of html.matchAll(re)) { const p = parseBRL(m[1]); if (p) out.push(p); } };
  if (storeId === 'kabum') grab(/"priceWithDiscount"\s*:\s*([\d.]+)/g);
  if (storeId === 'amazon') {
    // Só olha o bloco de preço principal para não pegar preços de produtos sugeridos.
    const core = html.match(/id=["'](?:corePrice|apex)[\s\S]{0,4000}/)?.[0] ?? '';
    const m = core.match(/<span class=["']a-offscreen["']>\s*R\$\s*([\d.,]+)/);
    if (m) out.push(parseBRL(m[1]));
  }
  if (storeId === 'terabyte') grab(/id=["']valVista["'][^>]*>\s*R\$\s*([\d.,]+)/g);
  if (storeId === 'pichau') grab(/"price"\s*:\s*\{[^}]*"final_price"\s*:\s*\{[^}]*"value"\s*:\s*([\d.]+)/g);
  if (storeId === 'mercadolivre') grab(/<meta itemprop=["']price["'] content=["']([\d.]+)["']/g);
  return out;
}

function ogTitle(html) {
  return html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
}

export async function fetchPrice({ url, storeId, minPrice = 0, maxPrice = Infinity, timeoutMs = 20000 }) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9', Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}${res.status === 403 || res.status === 503 ? ' (bloqueio anti-bot)' : ''}`);
  const html = await res.text();

  const ld = fromJsonLd(html);
  const candidates = [...fromStoreSpecific(html, storeId), ...ld.prices, ...fromMeta(html)]
    .filter(p => p >= minPrice && p <= maxPrice);
  if (!candidates.length) throw new Error('Preço não encontrado na página (layout mudou ou bloqueio)');

  // Menor preço plausível = normalmente o preço à vista/PIX.
  return {
    price: Math.min(...candidates),
    title: ld.title ?? ogTitle(html),
    available: ld.available ?? !/produto indispon[ií]vel|esgotado|avise-me quando chegar/i.test(html),
  };
}
