// Adaptadores de busca por loja. Cada um monta a URL de busca e, se necessário, ajuda o extrator genérico.
import { fetchText } from './http.js';
import { collectJsonBlobs, extractFromJson, extractFromHtmlCards, decode } from './extract.js';
import { parseBRL } from './scraper.js';
import { browserAvailable, renderPage } from './browser.js';

const enc = encodeURIComponent;
const slug = (q) => q.trim().toLowerCase().replace(/\s+/g, '-');

function generic(html, base, opts = {}) {
  let items = extractFromJson(collectJsonBlobs(html), { base, ...opts });
  if (!items.length && opts.productPath) items = extractFromHtmlCards(html, { base, productPath: opts.productPath });
  return items;
}

export const ADAPTERS = {
  kabum: {
    base: 'https://www.kabum.com.br',
    url: (q, p) => `https://www.kabum.com.br/busca/${enc(slug(q))}?page_number=${p}&page_size=40`,
    parse: (html, a) => generic(html, a.base, {
      linkOf: (o) => o.code && o.friendlyName ? `/produto/${o.code}/${o.friendlyName}` : null,
      productPath: /\/produto\/\d+/,
    }),
  },
  pichau: {
    base: 'https://www.pichau.com.br',
    url: (q, p) => `https://www.pichau.com.br/search?q=${enc(q)}&page=${p}`,
    parse: (html, a) => generic(html, a.base, {
      linkOf: (o) => o.url_key ? `/${o.url_key}` : null,
      productPath: /pichau\.com\.br\/[a-z0-9-]{15,}|^\/[a-z0-9-]{15,}/,
    }),
  },
  terabyte: {
    base: 'https://www.terabyteshop.com.br',
    url: (q) => `https://www.terabyteshop.com.br/busca?str=${enc(q)}`,
    pages: 1,
    parse: (html, a) => generic(html, a.base, { productPath: /\/produto\/\d+/ }),
  },
  amazon: {
    base: 'https://www.amazon.com.br',
    url: (q, p) => `https://www.amazon.com.br/s?k=${enc(q)}&page=${p}`,
    parse: (html) => {
      const out = [];
      const blocks = html.split(/data-component-type=["']s-search-result["']/).slice(1);
      for (const b of blocks) {
        const chunk = b.slice(0, 15000);
        const asin = chunk.match(/data-asin=["']([A-Z0-9]{10})["']/)?.[1];
        const title = chunk.match(/<h2[^>]*aria-label=["']([^"']+)["']/)?.[1] ?? chunk.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([^<]{8,})<\/span>/)?.[1];
        const price = chunk.match(/<span class=["']a-offscreen["']>\s*R\$\s*(?:&nbsp;)?([\d.,]+)/)?.[1];
        const link = chunk.match(/href=["'](\/[^"']*\/dp\/[A-Z0-9]{10}[^"']*)["']/)?.[1];
        if (!title || !price) continue;
        out.push({
          title: decode(title), price: parseBRL(price),
          url: asin ? `https://www.amazon.com.br/dp/${asin}` : link ? 'https://www.amazon.com.br' + link : null,
          image: chunk.match(/class=["']s-image["'][^>]*src=["']([^"']+)["']/)?.[1] ?? chunk.match(/src=["']([^"']+)["'][^>]*class=["']s-image/)?.[1] ?? null,
          available: true,
        });
      }
      return out;
    },
  },
  mercadolivre: {
    base: 'https://www.mercadolivre.com.br',
    url: (q, p) => `https://lista.mercadolivre.com.br/${enc(slug(q))}${p > 1 ? `_Desde_${(p - 1) * 48 + 1}` : ''}_NoIndex_True`,
    // 1ª tentativa: API pública (traz reputação do vendedor); se recusar, cai para o HTML.
    api: async (q, p) => {
      const j = await fetchText(`https://api.mercadolibre.com/sites/MLB/search?q=${enc(q)}&offset=${(p - 1) * 50}&limit=50`, { json: true });
      return (j.results ?? []).map(r => ({
        title: r.title, price: r.price, url: r.permalink, image: r.thumbnail?.replace(/^http:/, 'https:'),
        available: r.available_quantity !== 0, official: !!r.official_store_id,
        seller: r.official_store_name ?? r.seller?.nickname ?? null,
      }));
    },
    parse: (html, a) => {
      const out = [];
      for (const card of html.split(/class=["'][^"']*poly-card[ "']/).slice(1)) {
        const c = card.slice(0, 8000);
        const t = c.match(/poly-component__title[^>]*>(?:<a[^>]*href=["']([^"']+)["'][^>]*>)?([^<]{8,})</);
        const link = t?.[1] ?? c.match(/href=["'](https:\/\/[^"']*mercadoli[^"']*)["']/)?.[1];
        const cur = c.match(/poly-price__current[\s\S]{0,1500}/)?.[0] ?? c;
        const frac = cur.match(/andes-money-amount__fraction[^>]*>([\d.]+)</)?.[1];
        const cents = cur.match(/andes-money-amount__cents[^>]*>(\d{2})</)?.[1] ?? '00';
        if (!t || !frac) continue;
        out.push({ title: decode(t[2]), price: parseBRL(`${frac},${cents}`), url: link, image: c.match(/<img[^>]+(?:data-src|src)=["'](https:[^"']+)["']/)?.[1] ?? null,
          available: true, official: /Loja oficial|poly-component__seller.*?oficial/i.test(c) });
      }
      return out.length ? out : generic(html, a.base, { productPath: /MLB-?\d+/ });
    },
  },
  magalu: {
    base: 'https://www.magazineluiza.com.br',
    url: (q, p) => `https://www.magazineluiza.com.br/busca/${enc(q)}/?page=${p}`,
    parse: (html, a) => generic(html, a.base, { productPath: /\/p\/[a-z0-9]{6,}\//i }),
  },
  aliexpress: {
    base: 'https://pt.aliexpress.com',
    url: (q, p) => `https://pt.aliexpress.com/w/wholesale-${enc(slug(q))}.html?page=${p}`,
    headers: { Cookie: 'aep_usuc_f=site=bra&c_tp=BRL&region=BR&b_locale=pt_BR; intl_locale=pt_BR' },
    browserCookies: [{ name: 'aep_usuc_f', value: 'site=bra&c_tp=BRL&region=BR&b_locale=pt_BR', domain: '.aliexpress.com', path: '/' }],
    parse: (html, a) => generic(html, a.base, {
      linkOf: (o) => o.productId ? `https://pt.aliexpress.com/item/${o.productId}.html` : null,
      imageOf: (o) => o.image?.imgUrl ? (o.image.imgUrl.startsWith('//') ? 'https:' + o.image.imgUrl : o.image.imgUrl) : null,
      productPath: /\/item\/\d+\.html/,
    }),
  },
  shopee: {
    base: 'https://shopee.com.br',
    url: (q, p) => `https://shopee.com.br/search?keyword=${enc(q)}&page=${p - 1}`,
    api: async (q, p) => {
      const j = await fetchText(`https://shopee.com.br/api/v4/search/search_items?by=relevancy&keyword=${enc(q)}&limit=60&newest=${(p - 1) * 60}&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`,
        { json: true, headers: { Referer: 'https://shopee.com.br/', 'X-Api-Source': 'pc', 'X-Shopee-Language': 'pt-BR' } });
      return shopeeItems(j);
    },
    browserCapture: /api\/v4\/search\/search_items/,
    fromCaptured: (list) => list.flatMap(shopeeItems),
    parse: (html, a) => generic(html, a.base, { priceScale: 100000, productPath: /-i\.\d+\.\d+/ }),
  },
  // Agregadores (só na busca profunda): mostram ofertas de muitas lojas menores.
  buscape: {
    base: 'https://www.buscape.com.br', deepOnly: true, pages: 1,
    url: (q) => `https://www.buscape.com.br/search?q=${enc(q)}`,
    parse: (html, a) => generic(html, a.base, { productPath: /\/[a-z-]+\/[a-z0-9-]{10,}/ }),
  },
  zoom: {
    base: 'https://www.zoom.com.br', deepOnly: true, pages: 1,
    url: (q) => `https://www.zoom.com.br/search?q=${enc(q)}`,
    parse: (html, a) => generic(html, a.base, { productPath: /\/[a-z-]+\/[a-z0-9-]{10,}/ }),
  },
};

function shopeeItems(j) {
  return (j?.items ?? []).map(x => x.item_basic ?? x).filter(b => b?.name).map(b => ({
    title: b.name, price: (b.price_min ?? b.price) / 100000,
    url: `https://shopee.com.br/product/${b.shopid}/${b.itemid}`,
    image: b.image ? `https://down-br.img.susercontent.com/file/${b.image}` : null,
    available: b.stock !== 0, official: !!(b.is_official_shop || b.shopee_verified),
  }));
}

// Busca numa loja: API → HTML → (busca profunda) navegador headless.
export async function searchStore(storeId, query, { deep = false } = {}) {
  const a = ADAPTERS[storeId];
  if (!a) throw new Error('loja desconhecida');
  const pages = deep ? (a.pages ?? 2) : 1;
  const errors = [];
  let items = [];
  for (let p = 1; p <= pages; p++) {
    let got = [];
    if (a.api) { try { got = await a.api(query, p); } catch (e) { errors.push('API: ' + e.message); } }
    if (!got.length) {
      try { got = a.parse(await fetchText(a.url(query, p), { headers: a.headers }), a); }
      catch (e) { errors.push(e.message); }
    }
    if (!got.length && deep && browserAvailable()) {
      try {
        const r = await renderPage(a.url(query, p), { capture: a.browserCapture, cookies: a.browserCookies });
        got = a.fromCaptured?.(r.captured) ?? [];
        if (!got.length) got = a.parse(r.html, a);
      } catch (e) { errors.push('navegador: ' + e.message); }
    }
    items.push(...got);
    if (!got.length) break;
  }
  if (!items.length && errors.length) throw new Error(errors.at(-1));
  return { items, searchUrl: a.url(query, 1) };
}
