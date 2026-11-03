// Extração de preço a partir da página de produto.
// Estratégia em camadas (da mais confiável para a menos):
//   1. JSON-LD schema.org Product/Offer (usado por quase todas as lojas)
//   2. Metatags de preço (product:price:amount, itemprop=price)
//   3. Padrões específicos (KaBuM __NEXT_DATA__, Amazon a-offscreen, etc.)
import { parseBRL } from './offer.js';
import { pricesFromText, pricesOf } from './extract.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// parseBRL mora em src/offer.js; reexportado aqui por compatibilidade.
export { parseBRL };

function* walk(node) {
  if (Array.isArray(node)) { for (const n of node) yield* walk(n); return; }
  if (node && typeof node === 'object') {
    yield node;
    for (const v of Object.values(node)) if (v && typeof v === 'object') yield* walk(v);
  }
}

const isType = (n, t) => [].concat(n['@type'] || []).some(x => String(x).toLowerCase() === t);

function fromJsonLd(html) {
  let title = null, available = null, card = null, seller = null;
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    for (const n of walk(data)) {
      if (isType(n, 'product')) title ??= n.name;
      if (isType(n, 'offer') || isType(n, 'aggregateoffer')) {
        const p = parseBRL(n.lowPrice ?? n.price ?? n.priceSpecification?.price);
        if (p && (card == null || p < card)) card = p;
        if (n.availability) available ??= !/OutOfStock|SoldOut|Discontinued/i.test(n.availability);
        const s = n.seller?.name ?? (typeof n.seller === 'string' ? n.seller : null);
        if (s) seller ??= s;
      }
    }
  }
  return { title, available, card, seller };
}

function metaPrice(html) {
  const m = html.match(/<meta[^>]+(?:property|itemprop|name)=["'](?:product:price:amount|og:price:amount|price)["'][^>]*content=["']([^"']+)["']/i);
  return m ? parseBRL(m[1]) : null;
}

// Bloco principal de preço da página, por loja, para não pegar preços de produtos sugeridos.
const PRICE_BLOCK = {
  amazon: /id=["'](?:corePrice|apex)[\s\S]{0,6000}/,
  kabum: /id=["']blocoValores["'][\s\S]{0,4000}/,
  terabyte: /id=["'](?:prod-price|valVista)["'][\s\S]{0,4000}|class=["'][^"']*prod-new-price[\s\S]{0,4000}/,
  mercadolivre: /class=["'][^"']*ui-pdp-price[\s\S]{0,6000}/,
  magalu: /data-testid=["']price[\s\S]{0,4000}/,
};

// Lê a página de um produto e devolve a oferta "crua" (em reais), no formato de src/offer.js.
export async function fetchPrice({ url, storeId, timeoutMs = 20000 }) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9', Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}${res.status === 403 || res.status === 503 ? ' (bloqueio anti-bot)' : ''}`);
  const html = await res.text();
  return parseProductPage(html, storeId, res.url || url);
}

// Separada de fetchPrice para ser testada com fixtures, sem rede.
function ogTitle(html) {
  return html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
}

export function parseProductPage(html, storeId, url) {
  const ld = fromJsonLd(html);
  const block = html.match(PRICE_BLOCK[storeId] ?? /$^/)?.[0];
  const fromBlock = block ? pricesFromText(block) : { pix: null, card: null, installments: null };
  // Dados embutidos (KaBuM priceWithDiscount, Pichau avista/final_price...) classificados pelo nome do campo
  let embedded = { pix: null, card: null, installments: null };
  if (storeId === 'kabum') {
    const pix = html.match(/"priceWithDiscount"\s*:\s*([\d.]+)/)?.[1], card = html.match(/"price"\s*:\s*([\d.]+)/)?.[1];
    embedded = { pix: pix ? Number(pix) : null, card: card ? Number(card) : null, installments: null };
  }
  if (storeId === 'pichau') {
    const m = html.match(/"pichau_prices"\s*:\s*(\{[^}]*\})/);
    if (m) { try { embedded = pricesOf({ pichau_prices: JSON.parse(m[1]) }); } catch { /* ignora */ } }
  }
  const raw = {
    url,
    title: ld.title ?? ogTitle(html),
    pix: embedded.pix ?? fromBlock.pix,
    card: embedded.card ?? fromBlock.card ?? ld.card ?? metaPrice(html),
    installments: fromBlock.installments ?? embedded.installments,
    seller: ld.seller,
    available: ld.available ?? !/produto indispon[ií]vel|esgotado|avise-me quando chegar/i.test(html),
  };
  // Amazon, Shopee e AliExpress cobram o mesmo valor no Pix e no cartão.
  if (['amazon', 'shopee', 'aliexpress'].includes(storeId)) { raw.price = raw.pix ?? raw.card; raw.samePrice = true; delete raw.pix; delete raw.card; }
  if (raw.pix == null && raw.card == null && raw.price == null && !raw.installments) throw new Error('Preço não encontrado nesta página');
  return raw;
}
