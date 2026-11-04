// Adaptadores de busca por loja. Cada um monta a URL de busca e, se necessário, ajuda o extrator genérico.
import { fetchText } from './http.js';
import { collectJsonBlobs, extractFromJson, extractFromHtmlCards, pricesFromText, decode, sellerInfoFrom } from './extract.js';
import { parseBRL } from './scraper.js';
import { providerFor, storeSources } from './sources/index.js';
import { blockPause, startBlockPause, clearBlockPause } from './rate-limit.js';

// Para o servidor consultar e limpar a pausa após bloqueio (estado em memória).
export { blockPause, clearBlockPause, listBlockPauses } from './rate-limit.js';
export { officialSourcesStatus, storeSources, SOURCE_IDS, SOURCE_LABELS } from './sources/index.js';

const enc = encodeURIComponent;
const slug = (q) => q.trim().toLowerCase().replace(/\s+/g, '-');

function generic(html, base, opts = {}) {
  let items = extractFromJson(collectJsonBlobs(html), { base, ...opts });
  if (!items.length && opts.productPath) {
    items = extractFromHtmlCards(html, { base, productPath: opts.productPath });
    if (opts.samePrice) items = items.map(({ pix, card, ...i }) => ({ ...i, price: pix ?? card, samePrice: true }));
  }
  return items;
}

export const ADAPTERS = {
  kabum: {
    base: 'https://www.kabum.com.br',
    url: (q, p) => `https://www.kabum.com.br/busca/${enc(slug(q))}?page_number=${p}&page_size=40`,
    // 1ª tentativa: o catálogo público em JSON que a própria página de busca carrega (sem login).
    // [não verificado ao vivo nesta versão] Se mudar ou recusar, cai para o HTML.
    api: async (q, p, ft = fetchText) => kabumItems(await ft(`https://servicespub.prod.api.aws.grupokabum.com.br/catalog/v2/products?query=${enc(q)}&page_number=${p}&page_size=40&facet_filters=&sort=most_searched`,
      { json: true })),
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
          // A Amazon cobra o mesmo valor no Pix e no cartão; as parcelas vêm do texto do bloco.
          title: decode(title), price: parseBRL(price), samePrice: true,
          installments: pricesFromText(chunk).installments,
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
    api: async (q, p, ft = fetchText) => {
      const j = await ft(`https://api.mercadolibre.com/sites/MLB/search?q=${enc(q)}&offset=${(p - 1) * 50}&limit=50`, { json: true });
      // A API de busca não traz o preço no Pix: "price" é o preço no crédito (1x).
      return (j.results ?? []).map(r => ({
        title: r.title, card: r.price, url: r.permalink, image: r.thumbnail?.replace(/^http:/, 'https:'),
        available: r.available_quantity !== 0,
        installments: r.installments ? { n: r.installments.quantity, value: r.installments.amount, rate: r.installments.rate } : null,
        seller: { id: r.seller?.id ?? null, name: r.official_store_name ?? r.seller?.nickname ?? null, official: !!r.official_store_id },
        freeShipping: r.shipping?.free_shipping === true,
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
        const txt = pricesFromText(c);   // "R$ 608 com Pix", "10x R$ 69,90 sem juros"
        out.push({ title: decode(t[2]), card: parseBRL(`${frac},${cents}`), pix: txt.pix, installments: txt.installments,
          url: link, image: c.match(/<img[^>]+(?:data-src|src)=["'](https:[^"']+)["']/)?.[1] ?? null,
          available: true, official: /Loja oficial|poly-component__seller.*?oficial/i.test(c),
          freeShipping: /frete gr[aá]tis|chegar[aá] gr[aá]tis/i.test(c) });
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
      samePrice: true,
    }),
  },
  shopee: {
    base: 'https://shopee.com.br',
    url: (q, p) => `https://shopee.com.br/search?keyword=${enc(q)}&page=${p - 1}`,
    api: async (q, p, ft = fetchText) => {
      const j = await ft(`https://shopee.com.br/api/v4/search/search_items?by=relevancy&keyword=${enc(q)}&limit=60&newest=${(p - 1) * 60}&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`,
        { json: true, headers: { 'X-Shopee-Language': 'pt-BR' } });
      return shopeeItems(j);
    },
    browserCapture: /api\/v4\/search\/search_items/,
    fromCaptured: (list) => list.flatMap(shopeeItems),
    parse: (html, a) => generic(html, a.base, { priceScale: 100000, productPath: /-i\.\d+\.\d+/, samePrice: true }),
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

// Catálogo da KaBuM: { data: [{ id, attributes: { title, price, price_with_discount, offer?, available, images, friendly_name } }] }
export function kabumItems(j) {
  return (j?.data ?? []).map(d => ({ id: d.id, ...(d.attributes ?? d) })).filter(x => x.title).map(x => {
    const o = x.offer ?? {};
    const pix = o.price_with_discount ?? x.price_with_discount ?? null;
    const card = o.price ?? x.price ?? null;
    const slugName = x.friendly_name ?? x.friendlyName ?? null;
    return {
      title: x.title, pix: pix > 0 ? pix : null, card: card > 0 ? card : null,
      installments: x.max_installment ? { n: Number(String(x.max_installment).match(/\d+/)?.[0]), value: null } : null,
      url: x.id ? `https://www.kabum.com.br/produto/${x.id}${slugName ? '/' + slugName : ''}` : null,
      image: [].concat(x.images ?? x.image ?? [])[0] ?? null,
      available: x.available !== false && x.stock !== 0,
      // Vendido por parceiro do marketplace KaBuM: o vendedor não é a loja (muda a nota de confiança).
      seller: x.marketplace ? { id: x.marketplace.seller_id ?? x.marketplace.seller_name ?? 'marketplace', name: x.marketplace.seller_name ?? null, official: null } : null,
      sellerInfo: x.marketplace ? sellerInfoFrom('kabum', x.marketplace) ?? undefined : undefined,   // nota/vendas do parceiro, se o catálogo trouxer [não verificado]
    };
  }).map(i => (i.installments && !(i.installments.n >= 2 && i.installments.value) ? { ...i, installments: null } : i));
}

function shopeeItems(j) {
  // Preços da Shopee vêm multiplicados por 100.000. O mesmo valor vale no Pix e no cartão.
  return (j?.items ?? []).map(x => x.item_basic ?? x).filter(b => b?.name).map(b => ({
    title: b.name, price: (b.price_min ?? b.price) / 100000, samePrice: true,
    url: `https://shopee.com.br/product/${b.shopid}/${b.itemid}`,
    image: b.image ? `https://down-br.img.susercontent.com/file/${b.image}` : null,
    available: b.stock !== 0,
    seller: { id: b.shopid ?? null, official: !!(b.is_official_shop || b.shopee_verified) },
    sellerInfo: sellerInfoFrom('shopee', b) ?? undefined,   // selo Mall/Indicado da loja
    origin: b.shop_location ? (/china|exterior|overseas|hong kong|kor|taiwan|jap|estados unidos|usa/i.test(b.shop_location) ? 'INTL' : 'BR') : null,
    freeShipping: b.show_free_shipping === true,
  }));
}

// Busca numa loja, percorrendo as fontes de data/stores.json ("sources"), da mais oficial para a menos oficial:
//   api-oficial → feed-afiliado → api-publica → pagina (veja src/sources/index.js).
// Fontes sem credencial no .env são puladas. Para na primeira fonte que devolver itens.
// page: página da loja (o scroll infinito pede 2, 3...). A busca profunda lê `pages` páginas de uma vez.
// Retorna { items, searchUrl, page, hasMore, source, sourceLegacy, trace }.
//   source: id da fonte que respondeu ('api-oficial', 'feed-afiliado', 'api-publica', 'pagina');
//   sourceLegacy: o mesmo no formato da 2.x ('oficial', 'afiliado', 'api', 'html');
//   trace: o que cada tentativa devolveu, com { via, fonte, ok, n | error } (usado no diagnóstico das lojas).
// Pausa após bloqueio: se a página bloquear (captcha ou HTTP 401/403/429/503), a loja fica
// pausaAposBloqueioHoras (data/source-limits.json) sem tentar a página de novo.
// noCache: true (diagnóstico pedido pelo usuário) ignora a pausa e tenta de novo.
// deps: só para testes (fetchText, providerFor, sources, now).
const LEGACY = { 'api-oficial': 'oficial', 'feed-afiliado': 'afiliado', 'api-publica': 'api', pagina: 'html' };
const BLOCK_RE = /HTTP (401|403|429|503)|verifica/;
const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export async function searchStore(storeId, query, { deep = false, page = 1, noCache = false, deps = {} } = {}) {
  const a = ADAPTERS[storeId];
  if (!a) throw new Error('loja desconhecida');
  const d = { fetchText, providerFor, now: Date.now, ...deps };
  const maxPages = a.pages ?? 10;
  if (page > maxPages) return { items: [], searchUrl: a.url(query, 1), page, hasMore: false };
  const last = deep ? Math.min(maxPages, page + (a.pages ?? 2) - 1) : page;
  const order = deps.sources ?? storeSources(storeId, { hasPublicApi: !!a.api });
  const errors = [];
  let items = [], lastGot = 0, blocked = false, source = null, pausa = null;
  const trace = [];
  // Pausa que já existia antes desta busca: a página não é tentada de novo enquanto ela vale.
  const pausaAntes = noCache ? null : blockPause(storeId, { now: d.now() });
  const pausadaMsg = (p) => `pausada após bloqueio até ${hhmm(p.until)}${p.reason ? ` (${p.reason})` : ''}; sem nova tentativa antes disso`;
  for (let p = page; p <= last; p++) {
    let got = [];
    for (const fonte of order) {
      if (got.length) break;
      if (fonte === 'api-oficial' || fonte === 'feed-afiliado') {
        const prov = d.providerFor(storeId, fonte);
        if (!prov?.configured()) continue;
        try { got = await prov.search(query, p); trace.push({ via: prov.nome, fonte, ok: true, n: got.length }); if (got.length) source = fonte; }
        catch (e) { errors.push(e.message.startsWith(prov.nome) ? e.message : `${prov.nome}: ${e.message}`); trace.push({ via: prov.nome, fonte, ok: false, error: e.message }); }
      } else if (fonte === 'api-publica') {
        if (!a.api) continue;
        try { got = await a.api(query, p, d.fetchText); trace.push({ via: 'API pública', fonte, ok: true, n: got.length }); if (got.length) source = fonte; }
        catch (e) { errors.push('API: ' + e.message); trace.push({ via: 'API pública', fonte, ok: false, error: e.message }); }
      } else if (fonte === 'pagina') {
        if (pausaAntes) {
          blocked = true; pausa = pausaAntes;
          errors.push(pausadaMsg(pausaAntes));
          trace.push({ via: 'página da loja', fonte, ok: false, skipped: true, pausadaAte: pausaAntes.until, error: pausadaMsg(pausaAntes) });
          continue;
        }
        try {
          const html = await d.fetchText(a.url(query, p), { headers: a.headers, useCache: !noCache });
          if (isChallenge(html)) { blocked = true; throw new Error('a loja pediu verificação (captcha/anti-bot)'); }
          got = a.parse(html, a);
          trace.push({ via: 'página da loja', fonte, ok: true, n: got.length, bytes: html.length });
          clearBlockPause(storeId);   // a página respondeu: nada de pausa
          if (got.length) source = fonte;
        } catch (e) {
          errors.push(e.message);
          const t = { via: 'página da loja', fonte, ok: false, error: e.message };
          if (BLOCK_RE.test(e.message)) {
            blocked = true;
            pausa = startBlockPause(storeId, { now: d.now(), reason: e.message });
            t.pausadaAte = pausa.until;
          }
          trace.push(t);
        }
      }
    }
    items.push(...got);
    lastGot = got.length;
    if (!got.length) break;
  }
  if (!items.length && errors.length) {
    const err = new Error(errors.at(-1));
    err.blocked = blocked; err.trace = trace;
    if (pausa) err.pausa = pausa;
    throw err;
  }
  return { items, searchUrl: a.url(query, 1), page: last, hasMore: lastGot > 0 && last < maxPages,
    source, sourceLegacy: source ? LEGACY[source] : null, trace, ...(pausa ? { pausa } : {}) };
}

// Página de verificação (captcha, "confirme que você é humano", desafio do Cloudflare/Akamai/PerimeterX).
// O SetupSniper não tenta resolver: só reconhece, para mostrar "bloqueado" em vez de "nenhum resultado".
export function isChallenge(html) {
  const h = String(html ?? '').slice(0, 60000);
  return /cf-chl-|challenge-platform|cf_chl_opt|<title>\s*(Just a moment|Um momento|Attention Required)|captcha-delivery|px-captcha|_Incapsula_Resource|validatecaptcha|\/errors\/validateCaptcha|Robot Check|Digite os caracteres que você vê|verifique que você é humano|confirme que você não é um robô|punish\?x5secdata|baxia-punish/i.test(h);
}
