// Awin (rede de afiliados), usada para a KaBuM!: feed de produtos do anunciante.
//
// Credenciais (no .env do usuário): AWIN_TOKEN (token pessoal em https://ui.awin.com/awin-api) e
// AWIN_PUBLISHER_ID (o número da sua conta de publisher). A conta precisa estar aprovada no programa da loja.
//
// Como funciona (documentação conferida em 04/11/2026):
//   - Programas aprovados: GET https://api.awin.com/publishers/{publisherId}/programmes?relationship=joined
//     (https://help.awin.com/apidocs/get-program-information). Serve para achar o id do anunciante pelo domínio
//     da loja, se ele não estiver fixo em data/stores.json (kabum → "afiliado.awin.advertiserId").
//   - Feed de produtos (formato Google, JSON Lines):
//     GET https://api.awin.com/publishers/{publisherId}/awinfeeds/download/{advertiserId}-retail-{locale}.jsonl
//     (https://help.awin.com/apidocs/retail-publisher-productapidocumentation-1). O feed é o catálogo inteiro:
//     é baixado uma vez, guardado em memória (cacheHoras em data/source-limits.json) e filtrado aqui.
//     Se a última linha trouxer { error }, o download veio incompleto.
//   - Limites: 20 chamadas/min por usuário na API; no máximo 5/min para o download do feed.
//
// [não verificado ao vivo] Sem conta Awin no ambiente de desenvolvimento: testado com fixtures
// (tests/fixtures/awin-*.json*). Não conferidos: se a KaBuM publica o feed no formato Google (enhanced) e com
// locale pt_BR; o nome do campo com o link rastreado no feed (aceitos: aw_deep_link, awin_deep_link,
// tracking_url, deeplink); se a linha do feed
// vem plana ou em seções (product_basic, product_price...). O leitor aceita as duas formas.
import { canonicalUrl } from '../offer.js';
import { SOURCE_LIMITS } from '../rate-limit.js';
import { env, missingVars, moneyCents, reais, matchesQuery, callApi, readJson } from './util.js';

const VARS = ['AWIN_TOKEN', 'AWIN_PUBLISHER_ID'];
const NOME = 'Awin';
const HINT = 'confira AWIN_TOKEN e AWIN_PUBLISHER_ID e se a conta está aprovada no programa da loja';
const DEFAULTS = { dominio: 'kabum.com.br', locale: 'pt_BR', pageSize: 40 };
const MAX_LINES = 400000;

export const id = 'awin';
export const nome = 'Awin (feed de afiliado)';
export const configured = () => missingVars(VARS).length === 0;
export const missing = () => missingVars(VARS);

const auth = () => ({ Authorization: `Bearer ${env('AWIN_TOKEN')}`, Accept: 'application/json' });

const advertisers = new Map();   // `${publisher}|${dominio}` → advertiserId
const feeds = new Map();         // `${advertiserId}|${locale}` → { at, items } | { promise }
export function resetAwinCache() { advertisers.clear(); feeds.clear(); }

const hostOf = (u) => { try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return ''; } };

async function findAdvertiser(o) {
  if (o.advertiserId) return Number(o.advertiserId);
  const pid = env('AWIN_PUBLISHER_ID');
  const key = `${pid}|${o.dominio}`;
  if (advertisers.has(key)) return advertisers.get(key);
  const res = await callApi(`https://api.awin.com/publishers/${encodeURIComponent(pid)}/programmes?relationship=joined&countryCode=BR`,
    { ...o, nome: NOME, limits: ['awin'], hint: HINT, headers: auth() });
  const list = [].concat((await readJson(res, NOME)) ?? []);
  const alvo = o.dominio.replace(/^www\./, '');
  const p = list.find(x => [x.displayUrl, x.clickThroughUrl, ...(x.validDomains ?? []).map(d => d?.domain ?? d)]
    .filter(Boolean).some(d => hostOf(d) === alvo || hostOf(d).endsWith('.' + alvo)));
  if (!p?.id) throw new Error(`${NOME}: a sua conta não está aprovada no programa da loja (${alvo}); peça a entrada no painel da Awin`);
  advertisers.set(key, Number(p.id));
  return Number(p.id);
}

// Linha do feed → item compacto (só o necessário, para caber na memória do celular).
export function feedItem(line) {
  if (!line || typeof line !== 'object') return null;
  const p = { ...line };
  for (const [k, v] of Object.entries(line)) if (/^product_/.test(k) && v && typeof v === 'object' && !Array.isArray(v)) Object.assign(p, v);
  const title = p.title ?? p.product_name;
  const link = p.link ?? p.merchant_deep_link;
  if (!title || !link) return null;
  const regular = moneyCents(p.price ?? p.search_price);
  const sale = moneyCents(p.sale_price);
  const cents = sale ?? regular;
  if (!cents) return null;
  const inst = p.installment && typeof p.installment === 'object'
    ? { n: Number(p.installment.months), cents: moneyCents(p.installment.amount) } : null;
  const aff = p.aw_deep_link ?? p.awin_deep_link ?? p.tracking_url ?? p.deeplink ?? null;
  return {
    id: p.id != null ? String(p.id) : null, title: String(title), link: String(link),
    image: p.image_link ?? p.aw_image_url ?? null, cents, listCents: sale && regular && regular > sale ? regular : null,
    availability: p.availability ?? null, inst: inst?.n >= 2 && inst.cents ? inst : null,
    aff: typeof aff === 'string' && /^https:\/\//.test(aff) ? aff : null,
  };
}

async function* lines(res) {
  if (res.body?.getReader) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { yield buf.slice(0, i); buf = buf.slice(i + 1); }
    }
    buf += dec.decode();
    if (buf) yield buf;
  } else for (const l of String(await res.text()).split('\n')) yield l;
}

async function downloadFeed(advertiserId, o) {
  const pid = env('AWIN_PUBLISHER_ID');
  const url = `https://api.awin.com/publishers/${encodeURIComponent(pid)}/awinfeeds/download/${advertiserId}-retail-${o.locale}.jsonl`;
  const res = await callApi(url, { ...o, nome: NOME, limits: ['awin-feed', 'awin'], hint: HINT, timeoutMs: 180000, headers: { ...auth(), Accept: 'application/x-ndjson, application/json' } });
  const items = [];
  let last = null, n = 0;
  for await (const raw of lines(res)) {
    const l = raw.trim();
    if (!l) continue;
    if (++n > MAX_LINES) break;
    let obj;
    try { obj = JSON.parse(l); } catch { continue; }
    last = obj;
    const it = feedItem(obj);
    if (it) items.push(it);
  }
  if (last && last.error != null && !last.title && !last.product_basic) {
    throw new Error(`${NOME}: o feed da Awin veio incompleto (${last.message ?? 'erro ' + last.error}); tente de novo mais tarde`);
  }
  return items;
}

async function feedFor(advertiserId, o) {
  const key = `${advertiserId}|${o.locale}`;
  const ttl = (SOURCE_LIMITS.fontes?.['awin-feed']?.cacheHoras ?? 6) * 3600e3;
  const now = o.now ?? Date.now;
  const hit = feeds.get(key);
  if (hit?.items && now() - hit.at < ttl) return hit.items;
  if (hit?.promise) return hit.promise;
  const promise = downloadFeed(advertiserId, o)
    .then(items => { feeds.set(key, { at: now(), items }); return items; })
    .catch(e => { feeds.delete(key); throw e; });
  feeds.set(key, { promise });
  return promise;
}

const toOffer = (it) => ({
  title: it.title,
  card: reais(it.cents),
  installments: it.inst ? { n: it.inst.n, value: reais(it.inst.cents) } : null,
  url: canonicalUrl(it.link),         // sempre a URL limpa da loja
  affiliateUrl: it.aff,               // link rastreado, separado (só usado se o usuário ligar a opção)
  image: it.image,
  available: it.availability == null ? null : /^in[_ ]?stock$|^preorder$|^backorder$/i.test(it.availability),
});

// Busca no feed da loja. page começa em 1; pageSize itens por página.
export async function search(query, page = 1, opts = {}) {
  if (!configured()) throw new Error(`${NOME}: falta ${missing().join(', ')} no .env`);
  const o = { ...DEFAULTS, fetchImpl: fetch, ...opts };
  const advertiserId = await findAdvertiser(o);
  const items = await feedFor(advertiserId, o);
  const found = items.filter(it => matchesQuery(it.title, query));
  return found.slice((page - 1) * o.pageSize, page * o.pageSize).map(toOffer);
}

