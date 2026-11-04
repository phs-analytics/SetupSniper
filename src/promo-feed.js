// Feed de promoções lidas dos canais públicos do Telegram (e dos posts encaminhados ao bot).
// Funções puras, testadas em tests/promo-feed.test.js. O preço é o DIVULGADO no post, não verificado na loja.
import { relevance, queryTokens } from './extract.js';

// Estado de leitura de um canal a partir da página t.me/s/<canal>
export function channelStatus(html, posts) {
  if (posts.length) return { ok: true, posts: posts.length };
  if (/tgme_page_extra|tgme_page_title/.test(html) && !/tgme_channel_history/.test(html)) {
    return { ok: false, noPreview: true, error: 'sem prévia pública (é um grupo ou o canal desativou a prévia): encaminhe os posts ao bot' };
  }
  return { ok: false, error: 'nenhum post legível na prévia pública' };
}

// Post → item do feed. Sem link de loja do escopo (nem encurtador a resolver) → null.
export function promoFromPost(post, canal, parsed, { activeStores = [] } = {}) {
  const store = parsed.store;
  if (store && !activeStores.includes(store)) return null;
  if (!store && !parsed.needsResolution) return null;
  if (!parsed.product && parsed.announcedPrice == null && !parsed.coupons.length) return null;
  return {
    id: post.id, channel: canal.replace(/^@/, ''), postUrl: post.url, date: post.date ?? null,
    store: store ?? null, product: parsed.product, price: parsed.announcedPrice, oldPrice: parsed.oldPrice,
    coupons: parsed.coupons, rules: parsed.rules, conditions: parsed.conditions,
    link: parsed.links[0] ?? null, kind: parsed.coupons.length ? (parsed.product && parsed.announcedPrice ? 'promo+cupom' : 'cupom') : 'promo',
  };
}

// Junta novos itens ao feed: sem repetir, mais novos primeiro, no máximo `max`, descartando os mais velhos que `ttlDays`.
export function addPromos(feed, novos, { max = 600, ttlDays = 4, now = Date.now() } = {}) {
  const byId = new Map(feed.map(p => [p.id, p]));
  for (const p of novos) if (p && !byId.has(p.id)) byId.set(p.id, { ...p, seenAt: p.seenAt ?? new Date(now).toISOString() });
  const limite = now - ttlDays * 864e5;
  return [...byId.values()]
    .filter(p => Date.parse(p.date ?? p.seenAt) >= limite)
    .sort((a, b) => Date.parse(b.date ?? b.seenAt) - Date.parse(a.date ?? a.seenAt))
    .slice(0, max);
}

// Filtro e paginação do feed (scroll infinito): ?store=&q=&offset=&limit=
export function queryPromos(feed, { store, q, offset = 0, limit = 30 } = {}) {
  let list = feed;
  if (store) list = list.filter(p => p.store === store);
  if (q && q.trim().length >= 2) {
    const t = queryTokens(q);
    // Com um produto no filtro, os mais baratos primeiro (sem preço no fim); sem filtro, os mais recentes.
    list = list.filter(p => relevance(p.product ?? '', t) >= 0.75).sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  }
  return { total: list.length, items: list.slice(offset, offset + limit), hasMore: offset + limit < list.length };
}

// Promoção que bate com um produto fixado e fica dentro da meta (preço divulgado ≤ meta)
export function watchMatches(promo, items) {
  if (!promo.product || promo.price == null) return [];
  return items.filter(it => it.alerts !== false && it.query
    && relevance(promo.product, queryTokens(it.query)) >= (queryTokens(it.query).length >= 4 ? 0.75 : 1)
    && (it.target == null || promo.price <= it.target)
    && (it.minPrice == null || promo.price >= it.minPrice));
}
