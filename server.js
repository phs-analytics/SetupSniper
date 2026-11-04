import http from 'node:http';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPrice } from './src/scraper.js';
import { computeReliability } from './src/reliability.js';
import { fetchReclameAqui } from './src/reclameaqui.js';
import { ADAPTERS, searchStore } from './src/stores.js';
import { activeStoreIds } from './src/scope.js';
import { cleanResults, flagOutliers } from './src/extract.js';
import { normalizeOffer, referencePrice, formatBRL, toCents, canonicalUrl as canonicalUrlOf } from './src/offer.js';
import { storeState } from './src/monitor.js';
import { finalTotals } from './src/final-price.js';
import { finalScore } from './src/seller-score.js';
import { rankOffers } from './src/ranking.js';
import { parsePromo, storeFromUrl } from './src/promo-parser.js';
import { resolveLink } from './src/link-resolver.js';
import { inferCouponRule, defaultExpiry, isCouponActive, SOURCE_LABEL } from './src/discounts.js';
import { parseChannelPage, channelUrl, validChannel } from './src/telegram-channels.js';
import { channelStatus, promoFromPost, addPromos, queryPromos, watchMatches } from './src/promo-feed.js';
import { fetchPtax } from './src/ptax.js';
import { parseProductPage } from './src/scraper.js';
import { fetchText } from './src/http.js';
import { browserAvailable } from './src/browser.js';
import { configured as officialConfigured, setMlUserTokenProvider } from './src/official-apis.js';
import { authUrl as mlAuthUrl, newState, codeFromInput, exchangeCode, validToken } from './src/ml-oauth.js';
import { parseCapture } from './src/capture.js';
import { startBot, sendMessage, escHtml } from './src/telegram.js';
import { VERSION, selfUpdate } from './src/update.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* sem .env */ }
// data/ versionado (configuração) e dados do usuário (fora do git). DATA_DIR permite separar os dados do usuário,
// por exemplo nos testes.
const CONFIG = (f) => path.join(ROOT, 'data', f);
const DATA = (f) => path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), f);
// PORT=0 deixa o sistema escolher uma porta livre (usado nos testes); o log mostra a porta real.
const PORT = process.env.PORT === '0' ? 0 : Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DEMO = process.argv.includes('--demo') || process.env.DEMO === '1';
const SENHA = process.env.SENHA || '';
const HISTORY_MAX = 300;

const readJson = async (f, fb) => existsSync(DATA(f)) ? JSON.parse(await readFile(DATA(f), 'utf8')) : fb;
const readConfig = async (f, fb) => existsSync(CONFIG(f)) ? JSON.parse(await readFile(CONFIG(f), 'utf8')) : fb;
const saving = {};
const writeJson = (f, v) => (saving[f] = (saving[f] ?? Promise.resolve()).then(() => writeFile(DATA(f), JSON.stringify(v, null, 2))).catch(e => console.error(e)));

const storesCfg = await readConfig('stores.json', { stores: [] });
const watch = await readJson('watchlist.json', null) ?? await readConfig('watchlist.example.json', { items: [] });
const settings = await readJson('settings.json', {});
settings.intervalMin ??= Number(process.env.INTERVAL_MIN) || 15;
// Escopo: só as lojas ativas são consultadas (src/scope.js). monitorStores escolhe, dentro delas, quais os Fixados conferem.
const activeIds = () => activeStoreIds(storesCfg.stores, settings, ADAPTERS);
settings.monitorStores ??= activeIds();
const monitorIds = () => settings.monitorStores.filter(id => activeIds().includes(id));
settings.alerts ??= { enabled: true, dropPct: 10, minScore: 60, allowSuspicious: false };
settings.telegram ??= { token: '', chatId: '' };
if (process.env.TELEGRAM_TOKEN) settings.telegram.token = process.env.TELEGRAM_TOKEN;
if (process.env.TELEGRAM_CHAT_ID) settings.telegram.chatId = process.env.TELEGRAM_CHAT_ID;
const history = await readJson('history.json', {});        // "itemId:storeId" e "itemId:__best" -> [{t, price}]
const alertState = await readJson('alerts.json', { last: {}, log: [] });

// Preço de referência para ordenar, comparar metas e alertar: Pix (padrão) ou crédito.
settings.priceReference ??= 'pix';

// ---------- Fases 2 e 3: cupons, perfil, CEP, cotação e regras configuráveis ----------
const taxesCfg = await readConfig('taxes.json', { importTaxStores: [] });
const cepUf = await readConfig('cep-uf.json', { faixas: [] });
const couponRules = await readConfig('coupon-rules.json', { channelTtlHours: 24, stacking: { default: 1 } });
const couponsDb = await readJson('coupons.json', { coupons: [] });
const channelsState = await readJson('channels-state.json', { seen: {} });
channelsState.status ??= {};                                    // canal -> { ok, at, posts, error, noPreview }
channelsState.alerted ??= [];                                   // posts que já geraram aviso de produto fixado
const suggestedChannels = (await readConfig('telegram-channels.json', { canais: [] })).canais ?? [];
const promosDb = await readJson('promos.json', { promos: [] }); // feed de promoções lidas dos canais (dado do usuário)
settings.cep ??= '';                                            // fica só em data/settings.json (fora do git), nunca em logs ou no Telegram
settings.fx ??= { usdBrl: null, mode: 'manual', updatedAt: null };
settings.profile ??= { boughtAt: [], subscriptions: [] };
settings.channels ??= [];                                       // canais públicos do Telegram (opt-in)
settings.channelIntervalMin ??= 30;
if (DEMO && !settings.channels.length) settings.channels = ['LaPromotion', 'urubupromo', 'pcdofafapromo', 'CupomKabum', 'pichauofertas', 'terabyteshopoficial'];   // demo: canais simulados                             // leitura dos canais: a cada 30 min (mínimo 15)
delete settings.channelIntervalH;
const totalsCtx = (store) => ({ taxes: taxesCfg, cepUf, cep: settings.cep, fx: settings.fx?.usdBrl, stacking: couponRules.stacking?.[store] ?? couponRules.stacking?.default ?? 1, now: Date.now() });
// Fase 4: nota de confiança da OFERTA = plataforma + vendedor + risco da oferta (src/seller-score.js).
const sellerScoreCfg = await readConfig('seller-score.json', undefined);
const FIRST_PARTY = ['kabum', 'pichau', 'terabyte'];   // vendem o próprio estoque (sem sinal de marketplace na oferta)
function sellerData(o) {
  const s = o.seller ?? {};
  return {
    store: o.store, name: s.name ?? null, official: s.official ?? null,
    soldByStore: FIRST_PARTY.includes(o.store) && !s.id ? true : null,
    foreign: o.shipping?.origin === 'INTL' ? true : null,
    ...(o.sellerInfo ?? {}),    // dados extras do vendedor, quando um adaptador conseguir ler (idade, vendas, avaliações...)
  };
}
const trustOf = (o) => finalScore({ platformScore: scoreOf(o.store), seller: sellerData(o), offer: { suspeito: !!o.suspeito, title: o.title } }, sellerScoreCfg, { now: new Date() });
const withTotals = (o) => ({ ...o, totals: finalTotals(o, couponsDb.coupons, settings.profile, totalsCtx(o.store)) });
const withTrust = (o) => ({ ...o, trust: trustOf(o) });
const trustScore = (o) => o?.trust?.score ?? scoreOf(o?.store ?? o?.storeId);
const refKind = () => (settings.priceReference === 'card' ? 'card' : 'pix');
// Referência para ordenar, comparar com a meta e alertar: o TOTAL FINAL (com cupom, frete e impostos) no Pix ou no cartão.
const refOf = (o) => o?.totals?.[refKind()]?.total ?? referencePrice(o, refKind());

// ---------- migração: até a v2.3 os valores eram reais (float); agora são centavos inteiros ----------
const reaisParaCentavos = (v) => (typeof v === 'number' && v > 0 ? Math.round(v * 100) : v ?? null);
if (watch.schemaVersion !== 2) {
  for (const it of watch.items) for (const k of ['target', 'minPrice', 'maxPrice']) it[k] = reaisParaCentavos(it[k]);
  watch.schemaVersion = 2;
  if (existsSync(DATA('watchlist.json'))) writeJson('watchlist.json', watch);
}
if (history.__schema !== 2) {
  for (const [k, h] of Object.entries(history)) if (Array.isArray(h)) for (const e of h) e.price = reaisParaCentavos(e.price);
  history.__schema = 2;
  if (existsSync(DATA('history.json'))) writeJson('history.json', history);
}
if (alertState.schema !== 2) {
  for (const e of alertState.log) e.price = reaisParaCentavos(e.price);
  for (const v of Object.values(alertState.last)) v.price = reaisParaCentavos(v.price);
  alertState.schema = 2;
  if (existsSync(DATA('alerts.json'))) writeJson('alerts.json', alertState);
}

const offers = {};       // offers[itemId][storeId] = {price, title, url, image, updatedAt, error, suspeito}
const checking = new Set();
const raLive = {};
let lastRefresh = null, refreshing = false;
const clients = new Set();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const brl = formatBRL;   // recebe centavos
const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);

// ---------- lojas e score ----------
function storesWithScore() {
  const ativos = activeIds();
  return storesCfg.stores.filter(s => ativos.includes(s.id)).map(s => {
    const live = raLive[s.id];
    const merged = live ? { ...s, reclameAqui: { ...s.reclameAqui, ...Object.fromEntries(Object.entries(live.data).filter(([, v]) => v != null)) } } : s;
    return { ...merged, deepOnly: !!ADAPTERS[s.id]?.deepOnly, estimado: !live, raFonte: live ? `Reclame Aqui ao vivo (${live.at})` : `${s.fonte ?? 'estimativa'} (não oficial)`,
      reliability: s.agregador ? null : computeReliability(merged) };
  });
}
const scoreOf = (storeId) => storesWithScore().find(s => s.id === storeId)?.reliability?.score ?? null;

// ---------- estado e tempo real ----------
function publicSettings() {
  const t = settings.telegram;
  return { ...settings, telegram: { configured: !!t.token, tokenHint: t.token ? '…' + t.token.slice(-4) : '', chatId: t.chatId } };
}
function state() {
  return {
    demo: DEMO, refreshing, lastRefresh, browser: browserAvailable(), version: VERSION,
    settings: publicSettings(),
    stores: storesWithScore(),
    alerts: alertState.log.slice(0, 30),
    ml: mlStatus(),
    channels: { suggested: suggestedChannels, status: channelsState.status, reading: readingChannels, promos: promosDb.promos.length },
    coupons: couponsDb.coupons.filter(c => isCouponActive(c) || Date.now() - Date.parse(c.seenAt ?? 0) < 7 * 864e5).slice(0, 200),
    taxes: { importTaxStores: taxesCfg.importTaxStores, atualizadoEm: taxesCfg.atualizadoEm },
    items: watch.items.map(it => ({
      ...it, checking: checking.has(it.id),
      bestHistory: (history[`${it.id}:__best`] ?? []).slice(-60),
      offers: monitorIds().map(sid => ({ storeId: sid, pin: it.pins?.[sid] ?? null, searchUrl: ADAPTERS[sid]?.url(it.query, 1), ...offers[it.id]?.[sid], history: (history[`${it.id}:${sid}`] ?? []).slice(-40) })),
    })),
  };
}
let bTimer = null;
function broadcast() {               // agrupa várias mudanças seguidas num envio
  clearTimeout(bTimer);
  bTimer = setTimeout(() => { const msg = `data: ${JSON.stringify(state())}\n\n`; for (const r of clients) r.write(msg); }, 150);
}
function record(key, price) {
  const h = (history[key] ??= []);
  const last = h.at(-1);
  if (!last || last.price !== price || Date.now() - last.t > 6 * 3600e3) h.push({ t: Date.now(), price });
  if (h.length > HISTORY_MAX) h.splice(0, h.length - HISTORY_MAX);
}

// ---------- modo demo ----------
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
function demoBase(q) {
  const n = q.toLowerCase();
  if (/7800x3d/.test(n)) return 1850; if (/ddr5/.test(n)) return 380; if (/ssd|nvme/.test(n)) return 460;
  if (/rtx|rx\s?\d{4}|placa de video/.test(n)) return 2600;
  return 80 + (hash(n) % 2900);
}
async function demoSearch(storeId, q, page = 1) {
  await sleep(250 + (hash(storeId + q) % 1400));
  // Simula lojas com várias páginas de resultado (a Terabyte só tem uma), para o scroll infinito.
  const maxPages = ADAPTERS[storeId]?.pages ?? 3;
  if (page > maxPages) return { items: [], searchUrl: ADAPTERS[storeId]?.url(q, 1), hasMore: false };
  const base = demoBase(q), h = hash(storeId + q + (page > 1 ? page : '')), n = 6 + (h % 7);
  const variants = ['', 'Box', 'Lacrado', 'Original', 'Garantia', 'Envio imediato'];
  // Marketplaces: vários vendedores simulados, de estabelecidos a lojas novas (para o comparativo e a nota)
  const SELLERS = [
    { id: 11, name: 'TECHSTORE', info: { ageDays: 2900, sales: 48000, nativeReputation: { level: '5_green', powerSeller: 'platinum' } } },
    { id: 12, name: 'MEGA INFO', info: { ageDays: 1300, sales: 6200, nativeReputation: { level: '5_green', powerSeller: 'gold' } } },
    { id: 13, name: 'Loja Oficial da Marca', official: true, info: {} },
    { id: 14, name: 'PC Express', info: { ageDays: 700, sales: 900, nativeReputation: { level: '4_light_green' } } },
    { id: 15, name: 'loja_nova_83', info: { ageDays: 18, sales: 4, nativeReputation: { level: null } } },
  ];
  const marketplace = ['mercadolivre', 'shopee', 'aliexpress', 'amazon', 'magalu'].includes(storeId);
  const items = Array.from({ length: n }, (_, i) => {
    const drift = Math.sin(Date.now() / 6e5 + h + i) * 0.03;
    const f = 0.9 + ((h >> (i * 3)) % 25) / 100 + drift + (storeId === 'aliexpress' ? -0.12 : 0);
    const card = Math.round(base * f * 100) / 100;
    // Como nas lojas reais: Amazon, Shopee e AliExpress têm um preço só; as outras dão desconto no Pix.
    const preco = ['amazon', 'shopee', 'aliexpress'].includes(storeId) ? { price: card, samePrice: true } : { pix: Math.round(card * 0.9 * 100) / 100, card };
    return { title: `${q.replace(/\b\w/g, c => c.toUpperCase())} ${variants[(h + i) % variants.length]}`.trim(),
      ...preco, installments: { n: 10, value: Math.round(card * 10) / 100, interestFree: true },
      url: `https://example.com/${storeId}/${page}-${i}`, image: null, available: (h + i) % 9 !== 0,
      ...(marketplace ? (() => { const sv = SELLERS[(h + i + page) % SELLERS.length]; return { seller: { id: sv.id, name: sv.name, official: !!sv.official }, official: !!sv.official, sellerInfo: sv.info }; })() : {}) };
  });
  if (['shopee', 'aliexpress'].includes(storeId)) items.push({ title: `${q} Promoção`, price: Math.round(base * 0.45), samePrice: true, url: `https://example.com/${storeId}/x`, available: true });
  items.push({ title: `Adesivo ${q}`, price: Math.round(base * 0.05), url: `https://example.com/${storeId}/a`, available: true });
  return { items, searchUrl: ADAPTERS[storeId]?.url(q, 1), hasMore: page < maxPages };
}

// ---------- busca ----------
async function searchOne(storeId, q, deep, page = 1) {
  const r = DEMO ? await demoSearch(storeId, q, page)
    : await searchStore(storeId, q, { deep, page, browserFallback: settings.browserFallback !== false });
  const offersRaw = r.items.map(x => normalizeOffer(x, storeId));
  let items = cleanResults(offersRaw, q), approx = false;
  // Nenhum título com TODOS os termos: mostra os parecidos (≥ 60% dos termos), marcados como tal,
  // em vez de "nenhum resultado" (ex.: a loja escreve "RX7600" e a busca foi "rx 7600 xt 8gb").
  if (!items.length && offersRaw.length) { items = cleanResults(offersRaw, q, { minRel: 0.6 }).map(x => ({ ...x, approx: true })); approx = items.length > 0; }
  items = items.map(x => withTotals({ ...x, storeId }));
  // + preços que o seu navegador enviou desta loja nas últimas 24 h (se não vieram de novo agora)
  if (page === 1) { const urls = new Set(items.map(x => x.canonicalUrl ?? x.url)); items.push(...capturedFor(storeId, q).filter(x => !urls.has(x.canonicalUrl ?? x.url))); }
  return { items, searchUrl: r.searchUrl, raw: r.items.length, approx, hasMore: !!r.hasMore, page: r.page ?? page };
}

async function runSearch(q, { deep = false, stores, onStore, page = 1 } = {}) {
  const ativos = activeIds();
  const ids = (stores?.length ? stores : ativos)
    .filter(id => ativos.includes(id) && ADAPTERS[id] && (deep || !ADAPTERS[id].deepOnly));
  const all = [];
  await Promise.all(ids.map(async (id) => {
    const t0 = Date.now();
    try {
      const r = await searchOne(id, q, deep, page);
      r.items = r.items.map(withTrust);
      all.push(...r.items);
      // Sem itens: diz por quê ("a loja não achou nada" é diferente de "achou, mas nenhum era o produto")
      const reason = r.items.length ? null : r.raw ? `a loja mostrou ${r.raw} produto(s), mas nenhum parece ser "${q}"` : 'a loja não mostrou produtos para essa busca';
      onStore?.({ storeId: id, status: 'ok', items: r.items, raw: r.raw, approx: r.approx, reason, hasMore: r.hasMore && r.items.length > 0, page: r.page, searchUrl: r.searchUrl, ms: Date.now() - t0 });
    } catch (e) {
      // A loja não respondeu ao servidor, mas o seu navegador enviou preços dela: mostra esses, marcados
      const cap = page === 1 ? capturedFor(id, q) : [];
      if (cap.length) {
        all.push(...cap);
        onStore?.({ storeId: id, status: 'ok', items: cap, raw: cap.length, fromCaptures: true, blockedNote: e.message, hasMore: false, page, searchUrl: ADAPTERS[id].url(q, 1), ms: Date.now() - t0 });
      } else onStore?.({ storeId: id, status: 'error', error: e.message, blocked: !!e.blocked, items: [], hasMore: false, page, searchUrl: ADAPTERS[id].url(q, 1), ms: Date.now() - t0 });
    }
  }));
  return flagOutliers(all, refOf).map(withTrust);
}

// ---------- diagnóstico das lojas ----------
// Sem dados pessoais: só versão, sistema, se há navegador, quais APIs oficiais estão configuradas (sim/não)
// e, por loja, o resultado de cada tentativa. Feito para o usuário copiar e mandar para quem for ajudar.
let diagRunning = null;
async function diagnostico(q = 'ssd 1tb') {
  if (diagRunning) return diagRunning;
  diagRunning = (async () => {
    const lojas = await Promise.all(activeIds().map(async (id) => {
      const t0 = Date.now();
      try {
        const r = DEMO ? { ...(await demoSearch(id, q)), source: 'demo', trace: [{ via: 'demo', ok: true }] }
          : await searchStore(id, q, { noCache: true, browserFallback: settings.browserFallback !== false });
        return { id, nome: storeName(id), ok: r.items.length > 0, itens: r.items.length, fonte: r.source, ms: Date.now() - t0, tentativas: r.trace };
      } catch (e) {
        return { id, nome: storeName(id), ok: false, itens: 0, bloqueado: !!e.blocked, erro: e.message, ms: Date.now() - t0, tentativas: e.trace ?? [] };
      }
    }));
    return {
      quando: new Date().toISOString(), versao: VERSION.version, commit: VERSION.commit, node: process.version, sistema: `${process.platform}/${process.arch}`,
      demo: DEMO, navegador: browserAvailable(), browserFallback: settings.browserFallback !== false,
      apisOficiais: { mercadolivre: officialConfigured.mercadolivre(), shopee: officialConfigured.shopee(), aliexpress: officialConfigured.aliexpress() },
      busca: q, lojas,
    };
  })();
  try { return await diagRunning; } finally { diagRunning = null; }
}

// ---------- monitoramento ----------
async function checkItem(it) {
  if (checking.has(it.id)) return;
  checking.add(it.id); broadcast();
  try {
    const res = (offers[it.id] ??= {});
    const results = {};   // sid -> { offers, raw } | { error }
    await Promise.all(monitorIds().map(async (sid) => {
      const pin = it.pins?.[sid];
      try {
        if (pin && !DEMO) {
          const raw = await fetchPrice({ url: pin, storeId: sid });
          results[sid] = { raw: 1, offers: [withTotals({ ...normalizeOffer({ ...raw, url: raw.url ?? pin }, sid), storeId: sid, pinned: true })] };
        } else {
          const r = await searchOne(sid, it.query, false);
          results[sid] = { raw: r.raw, offers: r.items, searchUrl: r.searchUrl };
        }
      } catch (e) {
        results[sid] = { error: e.message };
      }
    }));
    const flagged = flagOutliers(Object.values(results).flatMap(r => r.offers ?? []), refOf).map(withTrust);
    const now = Date.now();
    for (const sid of monitorIds()) {
      const r = results[sid];
      if (!r) continue;
      const mine = r.offers ? flagged.filter(o => o.storeId === sid) : undefined;
      // Erro agora, mas o seu navegador enviou o preço deste link há menos de 12 h: mantém esse preço
      const prev = res[sid];
      if (r.error && prev?.capturedAt && now - prev.capturedAt < 12 * 3600e3) { res[sid] = { ...prev, lastError: r.error, errorAt: now }; continue; }
      const st = storeState(r.error ? r : { raw: r.raw, offers: mine }, it, refOf);
      const o = st.offer;
      res[sid] = {
        ...(st.status === 'error' ? res[sid] : {}),
        status: st.status, message: st.message, error: st.status === 'error' ? st.message : null,
        updatedAt: now, errorAt: st.status === 'error' ? now : undefined, searchUrl: r.searchUrl,
        price: st.price, offer: o,
        // outros vendedores desta loja (marketplace), já na ordem preço + confiança
        others: (st.others ?? []).map(x => ({ title: x.title, url: x.url, price: refOf(x), seller: x.seller ?? null, trust: x.trust ? { score: x.trust.score, tier: x.trust.tier, reasons: x.trust.reasons?.slice(0, 4) } : null, suspeito: !!x.suspeito, totals: x.totals })),
        title: o?.title ?? res[sid]?.title ?? null, url: o?.url ?? res[sid]?.url ?? null, image: o?.image ?? null,
        suspeito: !!o?.suspeito, pinned: !!o?.pinned, official: !!o?.seller?.official, count: st.count ?? 0,
      };
      if (st.status === 'ok') record(`${it.id}:${sid}`, st.price);
    }
    const valid = Object.entries(res).filter(([sid, o]) => o.status === 'ok' && !o.suspeito && (trustScore(o.offer) ?? 0) >= settings.alerts.minScore);
    if (valid.length) record(`${it.id}:__best`, Math.min(...valid.map(([, o]) => o.price)));
    await evaluateAlerts(it);
  } finally {
    checking.delete(it.id); broadcast();
  }
}

async function refreshAll() {
  if (refreshing) return;
  refreshing = true; broadcast();
  try {
    for (const it of watch.items) { await checkItem(it); if (!DEMO) await sleep(2000); }
    lastRefresh = Date.now();
    await writeJson('history.json', history);
  } finally { refreshing = false; broadcast(); }
}

// ---------- alertas ----------
function avg30(it) {
  const h = (history[`${it.id}:__best`] ?? []).filter(x => Date.now() - x.t < 30 * 864e5);
  return h.length >= 3 ? h.reduce((a, x) => a + x.price, 0) / h.length : null;
}

async function evaluateAlerts(it) {
  const a = settings.alerts;
  if (!a.enabled || it.alerts === false) return;   // alertas desligados no geral ou só neste produto
  const avg = avg30(it);
  const hits = [];
  for (const [sid, o] of Object.entries(offers[it.id] ?? {})) {
    if (o.status !== 'ok' || !o.price || (o.suspeito && !a.allowSuspicious)) continue;
    const sc = trustScore(o.offer) ?? scoreOf(sid);
    if (sc != null && sc < a.minScore) continue;
    const reasons = [];
    if (it.target && o.price <= it.target) reasons.push(`total final (${refKind() === 'pix' ? 'Pix' : 'cartão'}) caiu abaixo da sua meta de ${brl(it.target)}`);
    if (avg && o.price <= avg * (1 - a.dropPct / 100)) reasons.push(`${Math.round((1 - o.price / avg) * 100)}% abaixo da média de 30 dias (${brl(avg)})`);
    if (!reasons.length) continue;
    const key = `${it.id}:${sid}`, prev = alertState.last[key];
    if (prev && o.price >= prev.price * 0.99 && Date.now() - prev.t < 24 * 3600e3) continue; // já avisado
    alertState.last[key] = { price: o.price, t: Date.now() };
    hits.push({ sid, o, sc, reasons, store: storesCfg.stores.find(s => s.id === sid)?.name ?? sid });
  }
  if (!hits.length) return;
  // Em destaque: o menor preço entre os vendedores mais confiáveis (src/ranking.js)
  const ranked = rankOffers(hits, (h) => ({ price: h.o.price, score: h.sc, suspeito: h.o.suspeito }));
  hits.splice(0, hits.length, ...ranked);
  const top = hits[0];
  // Uma mensagem por produto, com a melhor oferta em destaque e as outras listadas.
  const entry = { t: Date.now(), itemId: it.id, item: it.name, storeId: top.sid, store: top.store, price: top.o.price, url: top.o.url,
    reasons: top.reasons, score: top.sc, others: hits.length - 1, sent: false };
  const tgc = settings.telegram;
  if (tgc.token && tgc.chatId) {
    const others = hits.slice(1, 4).map(h => `• ${brl(h.o.price)} na ${escHtml(h.store)}${h.o.url ? ` — <a href="${escHtml(h.o.url)}">abrir</a>` : ''}`).join('\n');
    try {
      await sendMessage(tgc.token, tgc.chatId,
        `🔥 <b>Preço baixo!</b>\n<b>${escHtml(it.name)}</b>\n\n💰 <b>${brl(top.o.price)}</b> na ${escHtml(top.store)}${top.sc != null ? ` (confiança ${top.sc}/100${top.o.offer?.trust?.tier ? ', ' + escHtml(top.o.offer.trust.tier) : ''}, estimativa)` : ''}\n` +
        top.reasons.map(r => '• ' + escHtml(r)).join('\n') +
        (top.o.title ? `\n\n<i>${escHtml(top.o.title.slice(0, 140))}</i>` : '') + (top.o.url ? `\n<a href="${escHtml(top.o.url)}">Abrir oferta</a>` : '') +
        (others ? `\n\nOutras lojas abaixo da meta:\n${others}` : '') + (DEMO ? '\n\n(modo demo: preço simulado)' : ''));
      entry.sent = true;
    } catch (e) { entry.error = e.message; }
  }
  alertState.log.unshift(entry); alertState.log.length = Math.min(alertState.log.length, 100);
  log(`[alerta] ${it.name} ${brl(top.o.price)} @ ${top.store} — ${top.reasons.join('; ')}`);
  writeJson('alerts.json', alertState);
}

// ---------- cupons e posts de promoção (Fase 2) ----------
const saveCoupons = () => {
  // Remove cupons expirados há mais de 7 dias
  couponsDb.coupons = couponsDb.coupons.filter(c => isCouponActive(c) || Date.now() - Date.parse(c.expiresAt ?? c.seenAt ?? 0) < 7 * 864e5);
  return writeJson('coupons.json', couponsDb);
};
const pendingFix = new Map();     // id curto → oferta (para o botão "Fixar" do bot)
const storeName = (id) => storesCfg.stores.find(s => s.id === id)?.name ?? id;

// Guarda (ou atualiza) um cupom; o mesmo código na mesma loja e produto não é duplicado.
function upsertCoupon(c) {
  const same = couponsDb.coupons.find(x => x.store === c.store && x.productUrl === c.productUrl && x.codes.join() === c.codes.join());
  if (same) { Object.assign(same, { ...c, id: same.id, status: same.status === 'confirmed_by_user' ? same.status : c.status }); return same; }
  couponsDb.coupons.unshift(c);
  return c;
}

// Linhas de total (Pix e Crédito) para o bot
function totalsText(t) {
  const linha = (rot, x, extra = '') => x ? `<b>${rot}:</b> ${brl(x.total)}${x.complete ? '' : ' <i>(parcial)</i>'}${extra}` : `<b>${rot}:</b> —`;
  const parc = t.card?.installments ? ` · ${t.card.installments.n}x ${brl(t.card.installments.value)}${t.card.installments.interestFree ? ' sem juros' : ''}` : '';
  const out = [linha('Total Pix', t.pix), linha('Total Crédito', t.card, parc)];
  if (t.card?.totalWithInterest && t.card.totalWithInterest !== t.card.total) out.push(`(parcelado com juros: ${brl(t.card.totalWithInterest)})`);
  if (t.cheaper) out.push(`💡 ${t.cheaper === 'pix' ? 'Pix' : 'Crédito'} economiza ${brl(t.saving)}`);
  const notas = [...new Set([...(t.pix?.notes ?? []), ...(t.card?.notes ?? [])])];
  if (notas.length) out.push('⚠️ ' + notas.join(' · '));
  return out.join('\n');
}

// Processa um post de promoção: lê o link, a página do produto e o cupom, e calcula os totais.
// opts: { source: 'telegram_forward'|'telegram_channel'|'manual', sourceName, sourceUrl }
// Nome do produto a partir do endereço (".../produto/426262/placa-de-video-rtx-4060-msi" → "placa de video rtx 4060 msi")
function titleFromUrl(u) {
  try {
    const parts = new URL(u).pathname.split('/').filter(x => /[a-z]-[a-z0-9]/i.test(x) && !/^(MLB|dp|p|produto|item)$/i.test(x));
    const slug = parts.sort((a, b) => b.length - a.length)[0];
    return slug ? decodeURIComponent(slug).replace(/\.html?$/, '').replace(/[-_]+/g, ' ').replace(/\bMLB ?\d+\b/i, '').trim().slice(0, 120) || null : null;
  } catch { return null; }
}

// ---------- preços enviados pelo navegador do usuário (favorito ou extensão) ----------
// Ficam 24 h em memória e entram na busca e nos Fixados quando a loja não responde ao servidor.
const CAPTURE_TTL = 24 * 3600e3;
const captures = new Map();   // url canônica → oferta (com capturedAt)
function rememberCaptures(items) {
  const now = Date.now();
  for (const o of items) if (o.canonicalUrl ?? o.url) captures.set(o.canonicalUrl ?? o.url, { ...o, captured: true, capturedAt: now });
  for (const [k, o] of captures) if (now - o.capturedAt > CAPTURE_TTL) captures.delete(k);
  while (captures.size > 2000) captures.delete(captures.keys().next().value);
}
function capturedFor(storeId, q) {
  const mine = [...captures.values()].filter(o => o.storeId === storeId && Date.now() - o.capturedAt < CAPTURE_TTL);
  return mine.length ? cleanResults(mine, q).map(o => withTrust(withTotals(o))) : [];
}

// ---------- conta do Mercado Livre (login oficial, OAuth) ----------
let mlAuthData = await readJson('ml-auth.json', null);
const mlPending = new Map();   // state → { t, redirect }
// Endereço de retorno: o do .env; senão, se você abriu o SetupSniper em HTTPS (ex.: tailscale serve ou servidor na
// nuvem), o próprio servidor (login conclui sozinho); senão, https://localhost/... (aí é preciso colar o endereço).
const mlRedirect = (origin) => process.env.ML_REDIRECT_URI || (/^https:\/\/[^/]+$/.test(origin ?? '') ? `${origin}/auth/ml/callback` : 'https://localhost/setupsniper-ml');
const mlApp = () => ({ clientId: process.env.ML_CLIENT_ID ?? '', clientSecret: process.env.ML_CLIENT_SECRET ?? '' });
const saveMlAuth = async (d) => { mlAuthData = d; await writeJson('ml-auth.json', d); };
setMlUserTokenProvider(() => mlAuthData ? validToken(mlAuthData, { ...mlApp(), save: saveMlAuth }) : null);
function mlStatus() {
  return { app: officialConfigured.mercadolivre(), connected: !!mlAuthData?.accessToken, nickname: mlAuthData?.nickname ?? null,
    renewable: !!mlAuthData?.refreshToken, expiresAt: mlAuthData?.expiresAt ?? null, redirectUri: mlRedirect() };
}
async function mlConnect(input, { checkState = true } = {}) {
  const { code, state, error } = codeFromInput(input);
  if (error) throw new Error(`o Mercado Livre não autorizou: ${error}`);
  if (!code) throw new Error('não achei o código: cole o endereço inteiro para onde o Mercado Livre levou o navegador');
  if (checkState && state && !mlPending.has(state)) throw new Error('esse pedido de login expirou: toque em "Conectar" de novo');
  const redirect = mlPending.get(state)?.redirect ?? mlRedirect();
  mlPending.delete(state);
  const st = await exchangeCode({ ...mlApp(), redirectUri: redirect, code });
  try {
    const me = await (await fetch('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${st.accessToken}` }, signal: AbortSignal.timeout(15000) })).json();
    st.nickname = me.nickname ?? null;
  } catch { /* sem apelido: tudo bem */ }
  await saveMlAuth(st); broadcast();
  return mlStatus();
}

async function processPromo(text, opts = {}) {
  const p = parsePromo(text);
  if (!p.links.length) return { text: 'Não encontrei link de loja nesse post. Encaminhe o post completo, com o link.' };
  let r;
  try {
    r = DEMO ? { finalUrl: p.links[0], canonicalUrl: p.links[0], store: p.store, html: '' } : await resolveLink(p.links[0]);
  } catch (e) {
    // Link direto de loja (compartilhado do app, por exemplo) que não abriu agora: dá para fixar mesmo assim,
    // e os Fixados tentam de novo depois. Encurtador que não abriu não diz a loja: aí não tem jeito.
    const direta = storeFromUrl(p.links[0]);
    if (!direta) return { text: `❌ Não consegui abrir o link: ${escHtml(e.message)}` };
    r = { finalUrl: p.links[0], canonicalUrl: canonicalUrlOf(p.links[0]), store: direta, html: '', erro: e.message };
  }
  if (r.store === 'tiktokshop' && !activeIds().includes(r.store)) return { text: 'TikTok Shop ainda não é suportada: fica desligada até ser testada com a rede liberada (veja docs/tiktok-shop.md). Post descartado.' };
  if (!r.store || !activeIds().includes(r.store)) return { text: `Loja fora do escopo do SetupSniper${r.store ? ` (${escHtml(storeName(r.store))})` : ''}. Post descartado.` };

  // Página do produto: preço atual no Pix e no cartão (sem login)
  let raw = null, erroPagina = null;
  if (DEMO) {
    const base = (p.announcedPrice ?? 50000) / 100 * 1.11;
    raw = ['amazon', 'shopee', 'aliexpress'].includes(r.store) ? { price: base, samePrice: true } : { pix: base, card: Math.round(base * 1.15 * 100) / 100 };
  } else {
    if (r.erro) erroPagina = r.erro;
    else { try { raw = parseProductPage(r.html, r.store, r.finalUrl); } catch (e) { erroPagina = e.message; } }
  }
  const offer = withTotals({ ...normalizeOffer({ ...(raw ?? {}), title: raw?.title ?? p.product ?? titleFromUrl(r.finalUrl), url: r.canonicalUrl ?? r.finalUrl }, r.store), storeId: r.store });

  // Cupom: regra do post ou inferida do preço anunciado × preço da página
  let coupon = null;
  if (p.coupons.length) {
    const page = referencePrice(offer, 'pix');
    const regra = p.rules.find(x => x.type !== 'shipping') ?? (page && p.announcedPrice ? inferCouponRule(page, p.announcedPrice) : null);
    const now = new Date().toISOString();
    coupon = upsertCoupon({
      id: newId(), store: r.store, seller: null, productUrl: offer.canonicalUrl,
      codes: p.coupons, type: regra?.type ?? 'unknown', value: regra?.value ?? null,
      minOrder: regra?.minOrder ?? null, maxDiscount: regra?.maxDiscount ?? null,
      appliesTo: p.appliesTo, conditions: p.conditions, announcedPrice: p.announcedPrice,
      inferred: !p.rules.some(x => x.type !== 'shipping') && !!regra,
      source: opts.source ?? 'telegram_forward', sourceName: opts.sourceName ?? SOURCE_LABEL[opts.source ?? 'telegram_forward'],
      sourceUrl: opts.sourceUrl ?? null, seenAt: now, expiresAt: defaultExpiry(now, couponRules.channelTtlHours ?? 24), status: 'unverified',
    });
    await saveCoupons();
  }
  const o = withTrust(withTotals(offer));   // recalcula com o cupom recém-salvo
  const fixId = newId();
  pendingFix.set(fixId, o);
  if (pendingFix.size > 50) pendingFix.delete(pendingFix.keys().next().value);

  const pr = o.price;
  const sc = o.trust?.score ?? scoreOf(r.store);
  const regraTxt = coupon ? (coupon.type === 'percent' ? `${coupon.value}% OFF` : coupon.type === 'fixed' ? `${brl(coupon.value)} OFF` : 'regra não informada')
    + (coupon.minOrder ? ` acima de ${brl(coupon.minOrder)}` : '') + (coupon.maxDiscount ? ` (até ${brl(coupon.maxDiscount)})` : '') + (coupon.inferred ? ' · inferida pelo preço anunciado' : '') : '';
  const html = [
    `🛒 <b>${escHtml(o.title ?? p.product ?? 'Produto')}</b> · ${escHtml(storeName(r.store))}`,
    erroPagina ? `⚠️ Não consegui ler o preço na página da loja agora (${escHtml(erroPagina)}).\nToque em 📌 Fixar: eu tento de novo nas próximas verificações. Ou abra a página no navegador e use o favorito "Enviar para o SetupSniper".` : `Na página: Pix ${brl(pr.pix)} · Cartão ${brl(pr.card)}`,
    p.announcedPrice ? `Anunciado no post: ${brl(p.announcedPrice)}` : '',
    coupon ? `🎟️ Cupom: <code>${coupon.codes.map(escHtml).join('</code> ou <code>')}</code> — ${escHtml(regraTxt)}\n<i>divulgado por ${escHtml(coupon.sourceName)} em ${new Date(coupon.seenAt).toLocaleString('pt-BR')}, não verificado</i>` : 'Nenhum cupom no post.',
    '',
    totalsText(o.totals),
    sc != null ? `\nConfiança: ${sc}/100 (${escHtml(o.trust?.tier ?? '')}, estimativa do SetupSniper)${o.trust?.reasons?.length ? '\n• ' + o.trust.reasons.slice(0, 4).map(escHtml).join('\n• ') : ''}` : '',
  ].filter(x => x !== '').join('\n');
  const buttons = [[{ text: '📌 Fixar', data: `fix:${fixId}` }]];
  if (coupon) buttons.push([{ text: '✅ Funcionou', data: `ok:${coupon.id}` }, { text: '❌ Não funcionou', data: `no:${coupon.id}` }]);
  return { text: html, buttons, offer: o, coupon, parsed: p };
}

function setCouponStatus(id, status) {
  const c = couponsDb.coupons.find(x => x.id === id);
  if (!c) throw new Error('Cupom não encontrado');
  c.status = status;
  saveCoupons(); broadcast();
  return c;
}

// ---------- canais públicos do Telegram (opt-in) ----------
let readingChannels = false;
// Lê cada canal ativado pela prévia pública t.me/s/<canal>, um de cada vez, com pausa entre eles.
// Toda promoção com link de loja do escopo entra no feed (aba Promoções). Posts com cupom também passam
// pelo fluxo dos posts encaminhados (resolve o link, lê o preço na loja e salva o cupom), no máximo 3 por canal.
async function readChannels() {
  if (readingChannels) return;
  readingChannels = true; broadcast();
  const novos = [];
  try {
    for (const canal of (settings.channels ?? []).filter(validChannel)) {
      const nome = canal.replace(/^@/, '');
      try {
        const html = DEMO ? demoChannelPage(nome) : await fetchText(channelUrl(nome), { useCache: false });
        const posts = parseChannelPage(html);
        channelsState.status[nome] = { ...channelStatus(html, posts), at: new Date().toISOString() };
        const seen = new Set(channelsState.seen[nome] ?? []);
        let comCupom = 0;
        for (const post of posts.filter(x => !seen.has(x.id))) {
          seen.add(post.id);
          const p = parsePromo(post.text);
          const promo = promoFromPost(post, nome, p, { activeStores: activeIds() });
          if (!promo) continue;
          novos.push(promo);
          if (!DEMO && p.coupons.length && p.store && comCupom < 3) {
            comCupom++;
            await processPromo(post.text, { source: 'telegram_channel', sourceName: '@' + nome, sourceUrl: post.url }).catch(e => log(`[canal] ${e.message}`));
          }
        }
        channelsState.seen[nome] = [...seen].slice(-300);
      } catch (e) {
        channelsState.status[nome] = { ok: false, error: e.message, at: new Date().toISOString() };
        log(`[canal ${nome}] ${e.message}`);
      }
      if (!DEMO) await sleep(2500);   // educado: um canal de cada vez
    }
    promosDb.promos = addPromos(promosDb.promos, novos);
    await writeJson('promos.json', promosDb);
    await alertPromoMatches(novos);
  } finally {
    readingChannels = false;
    await writeJson('channels-state.json', channelsState);
    broadcast();
  }
}

// Promoção de canal que bate com um produto fixado e está dentro da meta: avisa no Telegram.
// O preço é o divulgado no post (não verificado); o aviso diz isso.
async function alertPromoMatches(novos) {
  const tgc = settings.telegram;
  if (!settings.alerts?.enabled) return;
  for (const promo of novos) {
    if (channelsState.alerted.includes(promo.id)) continue;
    const its = watchMatches(promo, watch.items);
    if (!its.length) continue;
    channelsState.alerted = [...channelsState.alerted, promo.id].slice(-500);
    const entry = { t: Date.now(), itemId: its[0].id, item: its[0].name, storeId: promo.store, store: promo.store ? storeName(promo.store) : 'loja a confirmar',
      price: promo.price, url: promo.postUrl, reasons: [`divulgado no canal @${promo.channel}, não verificado`], fromChannel: true, sent: false };
    if (tgc.token && tgc.chatId) {
      try {
        await sendMessage(tgc.token, tgc.chatId,
          `📣 <b>Promoção num canal</b> para <b>${escHtml(its[0].name)}</b>\n\n${escHtml(promo.product ?? '')}\n💰 <b>${brl(promo.price)}</b>${promo.store ? ` na ${escHtml(storeName(promo.store))}` : ''}` +
          (promo.coupons.length ? `\n🎟️ ${escHtml(promo.coupons.join(' ou '))}` : '') +
          `\n\n<i>Divulgado por @${escHtml(promo.channel)}, não verificado. Confira o total na loja.</i>\n<a href="${escHtml(promo.postUrl)}">Ver o post</a>` + (DEMO ? '\n\n(modo demo)' : ''));
        entry.sent = true;
      } catch (e) { entry.error = e.message; }
    }
    alertState.log.unshift(entry); alertState.log.length = Math.min(alertState.log.length, 100);
  }
  await writeJson('alerts.json', alertState);
}

// Modo demo: posts simulados no formato da prévia t.me/s, para ver a aba Promoções funcionando
function demoChannelPage(canal) {
  const prods = [['Placa de Vídeo MSI GeForce RTX 4060 Ventus 2X 8GB', 1799, 'kabum', 'https://www.kabum.com.br/produto/1'], ['Processador AMD Ryzen 5 7600, AM5', 999, 'pichau', 'https://www.pichau.com.br/processador-amd-ryzen-5-7600'],
    ['SSD Kingston NV2 1TB NVMe', 389, 'amazon', 'https://amzn.to/demo'], ['Memória Kingston Fury Beast 16GB DDR5 5600', 329, 'mercadolivre', 'https://meli.la/demo'],
    ['Monitor Gamer LG UltraGear 24" 180Hz', 749, 'magalu', 'https://www.magazineluiza.com.br/monitor/p/abc123/'], ['Fonte Corsair RM750e 750W 80 Plus Gold', 529, 'terabyte', 'https://www.terabyteshop.com.br/produto/2'],
    ['Water Cooler Rise Mode 240mm', 189, 'shopee', 'https://shopee.com.br/product/1/2'], ['Mouse Logitech G203 Lightsync', 99, 'aliexpress', 'https://pt.aliexpress.com/item/1.html']];
  const h = hash(canal), slot = Math.floor(Date.now() / 6e5);
  const posts = Array.from({ length: 4 }, (_, i) => {
    const [t, v, , link] = prods[(h + i + slot) % prods.length];
    const price = Math.round(v * (0.9 + ((h >> i) % 15) / 100));
    const cupom = (h + i) % 3 === 0 ? `<br/>🎟️ Cupom: ${canal.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase()}10` : '';
    const id = `${canal}/${slot * 10 + i}`;
    const date = new Date(Date.now() - i * 47 * 60e3 - (h % 50) * 60e3).toISOString();
    return `<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="${id}"><div class="tgme_widget_message_text">🔥 ${t}<br/>Por: R$ ${price},90${cupom}<br/><a href="${link}">${link}</a></div><time datetime="${date}"></time></div></div>`;
  });
  return `<section class="tgme_channel_history">${posts.join('')}</section>`;
}

async function refreshPtax() {
  if (settings.fx?.mode !== 'ptax' || DEMO) return;
  try {
    const r = await fetchPtax();
    settings.fx = { ...settings.fx, usdBrl: r.usdBrl, updatedAt: r.data };
    await writeJson('settings.json', settings); broadcast();
  } catch (e) { log(`[ptax] ${e.message}`); }
}

// ---------- comandos do bot ----------
const botHandlers = {
  async diagnostico() {
    const d = await diagnostico();
    return '🩺 <b>Diagnóstico das lojas</b> (busca "ssd 1tb")\n\n' + d.lojas.map(l => `${l.ok ? '✅' : l.bloqueado ? '⛔' : '❌'} <b>${escHtml(l.nome)}</b>: ${l.ok ? `${l.itens} itens via ${escHtml(l.fonte)}` : escHtml((l.erro ?? 'nenhum item').slice(0, 120))}`).join('\n') +
      `\n\nNavegador headless: ${d.navegador ? 'sim' : 'não'}. Relatório completo: aba Lojas → Diagnóstico.`;
  },
  post: async (text) => processPromo(text, { source: 'telegram_forward' }),
  async callback(data) {
    const [acao, id] = String(data).split(':');
    if (acao === 'ok') { const c = setCouponStatus(id, 'confirmed_by_user'); return `✅ Anotado: o cupom ${escHtml(c.codes[0])} funcionou.`; }
    if (acao === 'no') { const c = setCouponStatus(id, 'expired'); return `Anotado: o cupom ${escHtml(c.codes[0])} foi marcado como expirado e sai dos cálculos.`; }
    if (acao === 'fix') {
      const o = pendingFix.get(id);
      if (!o) return 'Essa oferta expirou. Encaminhe o post de novo.';
      const it = await addItem({ name: o.title, query: (o.title ?? '').split(/\s+/).slice(0, 6).join(' '), refPrice: refOf(o), pin: { storeId: o.store, url: o.canonicalUrl ?? o.url } });
      return `📌 Fixado: <b>${escHtml(it.name)}</b>. Vou acompanhar o total final e avisar quando cair.`;
    }
    return 'Ação desconhecida.';
  },
  async cupons() {
    const ativos = couponsDb.coupons.filter(c => isCouponActive(c));
    if (!ativos.length) return 'Nenhum cupom ativo. Encaminhe um post de promoção para eu salvar o cupom.';
    return '🎟️ <b>Cupons ativos</b>\n\n' + ativos.slice(0, 15).map(c => `<code>${c.codes.map(escHtml).join(' / ')}</code> · ${escHtml(storeName(c.store))} · ${c.status === 'confirmed_by_user' ? 'funcionou' : 'não verificado'}${c.expiresAt ? ` · até ${new Date(c.expiresAt).toLocaleString('pt-BR')}` : ''}`).join('\n');
  },
  async precos() {
    if (!watch.items.length) return 'Nenhum produto fixado. Use /fixar &lt;produto&gt; ou o botão 📌 Fixar no site.';
    return '📌 <b>Produtos fixados</b>\n\n' + watch.items.map((it, i) => {
      const best = rankOffers(Object.entries(offers[it.id] ?? {}).filter(([sid, o]) => o.status === 'ok' && o.price && !o.suspeito && (trustScore(o.offer) ?? scoreOf(sid) ?? 100) >= settings.alerts.minScore),
        ([sid, o]) => ({ price: o.price, score: trustScore(o.offer) ?? scoreOf(sid) }))[0];
      const name = storesCfg.stores.find(s => s.id === best?.[0])?.name;
      return `${i + 1}. <b>${escHtml(it.name)}</b>${it.alerts === false ? ' 🔕' : ''}\n` + (best ? `${brl(best[1].price)} na ${escHtml(name)}${it.target ? ` · meta ${brl(it.target)}` : ''}\n<a href="${escHtml(best[1].url)}">abrir</a>` : 'sem oferta ainda');
    }).join('\n\n');
  },
  async fixar(args) {
    // "/fixar ryzen 5 7600 meta 1200" (ou "R$ 1200", "até 1200") → busca "ryzen 5 7600", meta R$ 1.200
    const m = args.match(/^(.*?)\s+(?:meta|r\$|at[eé]|por)\s*:?\s*(?:r\$\s*)?([\d.]+(?:,\d{1,2})?)$/i);
    const query = (m ? m[1] : args).trim(), target = m ? toCents(m[2]) : null;   // centavos
    const it = await addItem({ query, target });
    return `📌 Fixado: <b>${escHtml(it.name)}</b>${target ? `\nMeta: ${brl(target)}` : '\nSem meta: aviso quando cair ' + settings.alerts.dropPct + '% abaixo da média.'}\n\nVou buscar os preços agora. Veja com /fixados.`;
  },
  async desafixar(arg) {
    const n = Number(arg), it = watch.items[n - 1];
    if (!it) return 'Use /desafixar &lt;número&gt; — veja os números em /fixados.';
    watch.items = watch.items.filter(x => x !== it); delete offers[it.id];
    await writeJson('watchlist.json', watch); broadcast();
    return `Removido: <b>${escHtml(it.name)}</b>`;
  },
  async status() {
    const up = process.uptime(), mem = process.memoryUsage().rss / 1048576;
    return `🖥 <b>SetupSniper</b> v${VERSION.version}${VERSION.commit ? ` (${VERSION.commit})` : ''}\n` +
      `Ligado há ${Math.floor(up / 3600)} h ${Math.floor(up % 3600 / 60)} min · memória ${mem.toFixed(0)} MB\n` +
      `${watch.items.length} produto(s) fixado(s) · última verificação ${lastRefresh ? new Date(lastRefresh).toLocaleTimeString('pt-BR') : 'ainda não'}\n` +
      `Use /atualizar para baixar a versão mais nova do GitHub.`;
  },
  async atualizar() {
    const r = await selfUpdate();
    if (r.restart) setTimeout(() => process.exit(0), 1500); // o script iniciar.sh sobe de novo
    return r.message;
  },
  async buscar(q) {
    const found = (await runSearch(q, { stores: monitorIds() })).filter(r => !r.suspeito && r.available !== false && refOf(r) != null);
    const res = rankOffers(found, (o) => ({ price: refOf(o), score: trustScore(o) })).slice(0, 6);
    if (!res.length) return `Nada encontrado para "${escHtml(q)}".`;
    return `🔎 <b>${escHtml(q)}</b>\n\n` + res.map(r => {
      const sc = scoreOf(r.storeId), n = storesCfg.stores.find(s => s.id === r.storeId)?.name;
      return `${brl(refOf(r))} · ${escHtml(n)}${sc != null ? ` (${sc})` : ''}\n<a href="${escHtml(r.url ?? '')}">${escHtml(r.title.slice(0, 70))}</a>`;
    }).join('\n\n');
  },
};

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
async function body(req, limit = 1e5) { let b = ''; for await (const c of req) { b += c; if (b.length > limit) throw new Error('payload grande'); } return b ? JSON.parse(b) : {}; }
const json = (res, code, v) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)); };
const STORE_HOSTS = Object.values(ADAPTERS).map(a => new URL(a.base).hostname.replace(/^(www|pt|lista)\./, ''));
function storeUrl(u) {
  if (DEMO) return /^https?:\/\//.test(u ?? '') ? u : null;   // demo usa links fictícios
  try { const h = new URL(u); return /^https?:$/.test(h.protocol) && STORE_HOSTS.some(d => h.hostname === d || h.hostname.endsWith('.' + d)) ? h.href : null; } catch { return null; }
}
// Valores de dinheiro na API: centavos inteiros.
const num = (v) => v === '' || v == null ? null : Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
async function addItem(b) {
  const query = String(b.query ?? '').trim();
  if (query.length < 2) throw new Error('Informe o que buscar');
  const ref = num(b.refPrice);
  const it = { id: newId(), name: String(b.name || query).slice(0, 120), query, target: num(b.target), alerts: b.alerts !== false,
    minPrice: num(b.minPrice) ?? (ref ? Math.round(ref * 0.5) : null), maxPrice: num(b.maxPrice) ?? (ref ? Math.round(ref * 2.5) : null),
    pins: b.pin?.storeId && ADAPTERS[b.pin.storeId] && storeUrl(b.pin.url) ? { [b.pin.storeId]: storeUrl(b.pin.url) } : {}, createdAt: Date.now() };
  watch.items.unshift(it);
  await writeJson('watchlist.json', watch);
  checkItem(it).then(() => writeJson('history.json', history));
  return it;
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const { pathname } = url;
  if (SENHA) {
    const pass = Buffer.from((req.headers.authorization || '').split(' ')[1] ?? '', 'base64').toString().split(':').slice(1).join(':');
    if (pass !== SENHA) { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="SetupSniper"' }); return res.end('Senha necessária'); }
  }
  try {
    if (pathname === '/api/state') return json(res, 200, state());
    if (pathname === '/api/health') return json(res, 200, { ok: true, version: VERSION, uptime: Math.round(process.uptime()), rssMB: Math.round(process.memoryUsage().rss / 1048576), lastRefresh, items: watch.items.length });

    if (pathname === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(state())}\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clients.delete(res); clearInterval(ping); });
      return;
    }

    if (pathname === '/api/search') {   // resultados em streaming, loja por loja
      const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
      if (q.length < 2) return json(res, 400, { error: 'Digite pelo menos 2 letras' });
      const deep = url.searchParams.get('deep') === '1';
      const stores = (url.searchParams.get('stores') ?? '').split(',').filter(Boolean);
      const page = Math.max(1, Math.min(20, Number(url.searchParams.get('page')) || 1));   // scroll infinito
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      let closed = false; req.on('close', () => { closed = true; });
      const send = (o) => !closed && res.write(`data: ${JSON.stringify(o)}\n\n`);
      log(`[busca] "${q}"${deep ? ' (profunda)' : ''}${page > 1 ? ` · página ${page}` : ''}`);
      await runSearch(q, { deep, stores, page, onStore: (r) => send({ type: 'store', ...r }) });
      send({ type: 'done' }); return res.end();
    }

    if (pathname === '/api/refresh' && req.method === 'POST') { refreshAll(); return json(res, 202, { ok: true }); }

    // ---- app instalado (PWA): link compartilhado pelo botão "Compartilhar" do celular ----
    if (pathname === '/compartilhar') {
      const sp = url.searchParams;
      const texto = [sp.get('title'), sp.get('text'), sp.get('url')].filter(Boolean).join('\n').slice(0, 4000);
      res.writeHead(302, { Location: '/#compartilhar=' + encodeURIComponent(texto) }); return res.end();
    }

    // ---- "Enviar para o SetupSniper": página aberta pelo usuário no navegador dele ----
    if (pathname === '/api/capture' && req.method === 'POST') {
      let b;
      try { b = await body(req, 12e6); } catch (e) { return json(res, 413, { error: 'Página grande demais para enviar' }); }
      const pageUrl = String(b.url ?? '');
      const r = parseCapture({ url: pageUrl, html: String(b.html ?? '') });
      if (!r.items.length) return json(res, 422, { store: r.store, kind: r.kind, items: [], error: r.error ?? 'nenhum preço encontrado' });
      const items = flagOutliers(r.items.map(x => withTotals({ ...normalizeOffer(x, r.store), storeId: r.store, captured: true, capturedAt: Date.now() })), refOf).map(withTrust);
      rememberCaptures(items);
      // Produto fixado com este link: atualiza o preço agora, como se a verificação tivesse rodado
      let atualizados = 0;
      if (r.kind === 'product') {
        const canon = canonicalUrlOf(pageUrl);
        for (const it of watch.items) {
          if (!it.pins?.[r.store] || canonicalUrlOf(it.pins[r.store]) !== canon) continue;
          const o = items[0];
          (offers[it.id] ??= {})[r.store] = { ...(offers[it.id][r.store] ?? {}), status: 'ok', message: 'enviado pelo seu navegador', error: null, updatedAt: Date.now(), capturedAt: Date.now(),
            price: refOf(o), offer: o, title: o.title, url: o.url, image: o.image, suspeito: !!o.suspeito, pinned: true, official: !!o.seller?.official, count: 1, others: [] };
          const h = (history[`${it.id}:${r.store}`] ??= []); if (refOf(o) != null) h.push({ t: Date.now(), price: refOf(o) });
          atualizados++;
          evaluateAlerts(it).catch(() => {});
        }
        if (atualizados) { await writeJson('history.json', history); broadcast(); }
      }
      log(`[enviar${b.source === 'extensao' ? ' · extensão' : ''}] ${r.store} · ${r.kind} · ${items.length} oferta(s)${atualizados ? ` · ${atualizados} fixado(s) atualizado(s)` : ''}`);
      return json(res, 200, { store: r.store, kind: r.kind, items, atualizados });
    }

    // ---- conta do Mercado Livre (login oficial) ----
    if (pathname === '/api/ml/start' && req.method === 'POST') {
      if (!officialConfigured.mercadolivre()) return json(res, 400, { error: 'Cadastre ML_CLIENT_ID e ML_CLIENT_SECRET no .env primeiro (veja docs/fontes-oficiais.md).' });
      const b = await body(req).catch(() => ({}));
      const redirect = mlRedirect(String(b.origin ?? ''));
      const state = newState();
      mlPending.set(state, { t: Date.now(), redirect });
      for (const [k, v] of mlPending) if (Date.now() - v.t > 15 * 60e3) mlPending.delete(k);
      return json(res, 200, { url: mlAuthUrl({ clientId: mlApp().clientId, redirectUri: redirect, state }), redirectUri: redirect, automatic: redirect.endsWith('/auth/ml/callback') });
    }
    if (pathname === '/api/ml/code' && req.method === 'POST') {
      try { return json(res, 200, await mlConnect((await body(req)).input)); } catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (pathname === '/auth/ml/callback') {   // retorno automático (quando ML_REDIRECT_URI aponta para este servidor em HTTPS)
      try { await mlConnect(url.href); res.writeHead(302, { Location: '/#lojas' }); return res.end(); }
      catch (e) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não deu para conectar: ' + e.message); }
    }
    if (pathname === '/api/ml/disconnect' && req.method === 'POST') {
      mlAuthData = null; await rm(DATA('ml-auth.json'), { force: true }); broadcast();
      return json(res, 200, mlStatus());
    }

    // ---- diagnóstico: testa cada loja agora, sem cache, e diz o que cada tentativa devolveu ----
    if (pathname === '/api/diagnostico' && req.method === 'POST') return json(res, 200, await diagnostico());

    // ---- promoções dos canais do Telegram (feed com scroll infinito) ----
    if (pathname === '/api/promos') {
      const sp = url.searchParams;
      return json(res, 200, queryPromos(promosDb.promos, { store: sp.get('store') || null, q: sp.get('q') || null,
        offset: Math.max(0, Number(sp.get('offset')) || 0), limit: Math.max(1, Math.min(60, Number(sp.get('limit')) || 30)) }));
    }
    if (pathname === '/api/channels/read' && req.method === 'POST') { readChannels(); return json(res, 202, { ok: true }); }

    if (pathname === '/api/watch' && req.method === 'POST') {
      try { return json(res, 201, await addItem(await body(req))); } catch (e) { return json(res, 400, { error: e.message }); }
    }
    const wm = pathname.match(/^\/api\/watch\/([\w-]+)(\/check)?$/);
    if (wm) {
      const it = watch.items.find(x => x.id === wm[1]);
      if (!it) return json(res, 404, { error: 'Produto não encontrado' });
      if (wm[2] && req.method === 'POST') { checkItem(it); return json(res, 202, { ok: true }); }
      if (req.method === 'DELETE') {
        watch.items = watch.items.filter(x => x !== it); delete offers[it.id];
        await writeJson('watchlist.json', watch); broadcast(); return json(res, 200, { ok: true });
      }
      if (req.method === 'PATCH') {
        const b = await body(req);
        if ('name' in b && String(b.name).trim()) it.name = String(b.name).trim().slice(0, 120);
        if ('query' in b && String(b.query).trim().length >= 2) it.query = String(b.query).trim();
        for (const k of ['target', 'minPrice', 'maxPrice']) if (k in b) it[k] = num(b[k]);
        if ('alerts' in b) it.alerts = !!b.alerts;
        if (b.pin?.storeId && ADAPTERS[b.pin.storeId]) {
          it.pins ??= {};
          if (!b.pin.url) delete it.pins[b.pin.storeId];
          else if (storeUrl(b.pin.url)) it.pins[b.pin.storeId] = storeUrl(b.pin.url);
          else return json(res, 400, { error: 'O link precisa ser de uma das lojas suportadas' });
        }
        await writeJson('watchlist.json', watch); broadcast();
        if (Object.keys(b).some(k => k !== 'alerts')) checkItem(it);
        return json(res, 200, it);
      }
    }

    if (pathname === '/api/settings' && req.method === 'POST') {
      const b = await body(req);
      if (b.telegram) {
        if ('token' in b.telegram) { const t = String(b.telegram.token).trim(); if (t && !/^\d+:[\w-]{30,}$/.test(t)) return json(res, 400, { error: 'Token inválido. Ele tem o formato 123456789:ABC… e vem do @BotFather.' }); settings.telegram.token = t; if (!t) settings.telegram.chatId = ''; }
        if ('chatId' in b.telegram) settings.telegram.chatId = String(b.telegram.chatId).trim();
      }
      if (b.alerts) {
        const a = b.alerts;
        if ('enabled' in a) settings.alerts.enabled = !!a.enabled;
        if ('allowSuspicious' in a) settings.alerts.allowSuspicious = !!a.allowSuspicious;
        if ('dropPct' in a) settings.alerts.dropPct = Math.min(80, Math.max(1, Number(a.dropPct) || 10));
        if ('minScore' in a) settings.alerts.minScore = Math.min(100, Math.max(0, Number(a.minScore) || 0));
      }
      if ('priceReference' in b) settings.priceReference = b.priceReference === 'card' ? 'card' : 'pix';
      if (Array.isArray(b.monitorStores)) settings.monitorStores = b.monitorStores.filter(id => activeIds().includes(id));
      if (b.intervalMin) { settings.intervalMin = Math.max(5, Math.min(720, Number(b.intervalMin))); schedule(); }
      // Fase 3: CEP (só 8 dígitos), cotação do dólar, perfil e canais
      if ('cep' in b) {
        const cep = String(b.cep ?? '').replace(/\D/g, '');
        if (cep && cep.length !== 8) return json(res, 400, { error: 'O CEP precisa ter 8 dígitos.' });
        settings.cep = cep;
      }
      if (b.fx) {
        const mode = b.fx.mode === 'ptax' ? 'ptax' : 'manual';
        const v = Number(String(b.fx.usdBrl ?? '').replace(',', '.'));
        settings.fx = { ...settings.fx, mode, ...(mode === 'manual' ? { usdBrl: v > 0 && v < 100 ? v : null, updatedAt: new Date().toISOString() } : {}) };
        if (mode === 'ptax') refreshPtax();
      }
      if (b.profile) {
        settings.profile = {
          boughtAt: (b.profile.boughtAt ?? []).filter(id => activeIds().includes(id)),
          subscriptions: (b.profile.subscriptions ?? []).filter(x => ['meli+', 'prime'].includes(x)),
        };
      }
      if (Array.isArray(b.channels)) {
        const bad = b.channels.filter(c => !validChannel(c));
        if (bad.length) return json(res, 400, { error: `Nome de canal inválido: ${bad.join(', ')}` });
        settings.channels = [...new Set(b.channels.map(c => String(c).replace(/^@/, '')))].slice(0, 40);
        for (const k of Object.keys(channelsState.status)) if (!settings.channels.includes(k)) delete channelsState.status[k];
        setTimeout(readChannels, 1000);
      }
      if (b.channelIntervalMin != null) settings.channelIntervalMin = Math.max(15, Math.min(1440, Number(b.channelIntervalMin) || 30));
      await writeJson('settings.json', settings); broadcast();
      return json(res, 200, publicSettings());
    }
    // ---- cupons (Fase 2) ----
    if (pathname === '/api/promo' && req.method === 'POST') {
      const b = await body(req);
      const r = await processPromo(String(b.text ?? '').slice(0, 4000), { source: 'manual', sourceName: 'post colado no site' });
      broadcast();
      return json(res, 200, { text: r.text, offer: r.offer ?? null, coupon: r.coupon ?? null });
    }
    if (pathname === '/api/coupons' && req.method === 'POST') {
      const b = await body(req);
      const codes = String(b.codes ?? '').toUpperCase().split(/[\s,\/]+|\bOU\b/).map(x => x.trim()).filter(x => /^[A-Z0-9_-]{3,25}$/.test(x));
      if (!codes.length) return json(res, 400, { error: 'Informe o código do cupom.' });
      if (!activeIds().includes(b.store)) return json(res, 400, { error: 'Escolha uma das lojas do escopo.' });
      const type = ['percent', 'fixed', 'shipping'].includes(b.type) ? b.type : 'unknown';
      const now = new Date().toISOString();
      const c = upsertCoupon({
        id: newId(), store: b.store, seller: null, productUrl: storeUrl(b.productUrl) ? canonicalUrlOf(b.productUrl) : null, codes, type,
        value: type === 'percent' ? Math.min(100, Math.max(1, Number(b.value) || 0)) || null : num(b.value),
        minOrder: num(b.minOrder), maxDiscount: num(b.maxDiscount),
        appliesTo: Array.isArray(b.appliesTo) && b.appliesTo.length ? b.appliesTo.filter(x => ['pix', 'card'].includes(x)) : null,
        conditions: (b.conditions ?? []).filter(x => ['first_purchase', 'app_only', 'subscriber', 'new_account'].includes(x)),
        announcedPrice: null, inferred: false, source: 'manual', sourceName: 'cadastro manual', sourceUrl: null,
        seenAt: now, expiresAt: b.expiresAt ? new Date(b.expiresAt).toISOString() : null, status: 'unverified',
      });
      await saveCoupons(); broadcast();
      return json(res, 201, c);
    }
    const cm = pathname.match(/^\/api\/coupons\/([\w-]+)$/);
    if (cm && req.method === 'PATCH') {
      const b = await body(req);
      if (!['confirmed_by_user', 'expired', 'unverified'].includes(b.status)) return json(res, 400, { error: 'Status inválido' });
      try { return json(res, 200, setCouponStatus(cm[1], b.status)); } catch (e) { return json(res, 404, { error: e.message }); }
    }
    if (cm && req.method === 'DELETE') {
      couponsDb.coupons = couponsDb.coupons.filter(c => c.id !== cm[1]);
      await saveCoupons(); broadcast();
      return json(res, 200, { ok: true });
    }
    if (pathname === '/api/telegram/test' && req.method === 'POST') {
      const t = settings.telegram;
      if (!t.token) return json(res, 400, { error: 'Salve o token do bot primeiro.' });
      if (!t.chatId) return json(res, 400, { error: 'Envie /start para o seu bot no Telegram para conectar o chat.' });
      try { await sendMessage(t.token, t.chatId, '✅ Teste do <b>SetupSniper</b>: as notificações estão funcionando.'); return json(res, 200, { ok: true }); }
      catch (e) { return json(res, 502, { error: 'Telegram recusou: ' + e.message }); }
    }

    // Módulos puros compartilhados com a interface (a mesma regra de agrupar e ordenar nos dois lados)
    const lib = pathname.match(/^\/lib\/(compare|extract|ranking|offer)\.js$/);
    const file = lib ? path.join(ROOT, 'src', lib[1] + '.js') : path.join(ROOT, 'public', pathname === '/' ? 'index.html' : pathname);
    if (!lib && (!file.startsWith(path.join(ROOT, 'public')) || !existsSync(file))) { res.writeHead(404); return res.end('não encontrado'); }
    // no-cache: depois de atualizar o servidor, o navegador confere se há versão nova (sem precisar limpar o cache)
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: e.message }); else res.end();
  }
});

let timer = null;
function schedule() { clearInterval(timer); timer = setInterval(refreshAll, (DEMO ? 1 : settings.intervalMin) * 60e3); }

async function refreshReclameAqui() {
  if (DEMO) return;
  for (const s of storesCfg.stores.filter(x => activeIds().includes(x.id))) {
    if (!s.reclameAquiSlug) continue;
    const data = await fetchReclameAqui(s.reclameAquiSlug);
    if (data) raLive[s.id] = { data, at: new Date().toLocaleDateString('pt-BR') };
    await sleep(2000);
  }
  broadcast();
}

server.listen(PORT, HOST, () => {
  console.log(`\n  SetupSniper em http://localhost:${server.address().port}${DEMO ? '  (MODO DEMO — preços simulados)' : ''}`);
  console.log(`  Monitorando ${watch.items.length} produto(s) a cada ${DEMO ? 1 : settings.intervalMin} min · navegador headless: ${browserAvailable() ? 'sim' : 'não'}${SENHA ? ' · com senha' : ''}\n`);
  refreshReclameAqui();
  refreshAll();
  schedule();
  setInterval(refreshReclameAqui, 24 * 3600e3);
  // Fase 2 e 3: canais públicos do Telegram (opt-in, intervalo longo) e PTAX (opt-in, 1x por dia)
  // A cada `channelIntervalMin` (padrão 30 min, mínimo 15). O intervalo é relido a cada rodada.
  const nextChannels = () => setTimeout(async () => { await readChannels().catch(e => log('[canais] ' + e.message)); nextChannels(); }, Math.max(15, settings.channelIntervalMin ?? 30) * 60e3);
  setTimeout(() => readChannels().catch(e => log('[canais] ' + e.message)), DEMO ? 1500 : 60e3); nextChannels();
  refreshPtax(); setInterval(refreshPtax, 24 * 3600e3);
  const t = settings.telegram;
  if (!DEMO && t.token && t.chatId) sendMessage(t.token, t.chatId, `🟢 <b>SetupSniper</b> ligado (v${VERSION.version}). Acompanhando ${watch.items.length} produto(s) fixado(s).`).catch(e => log('[telegram] ' + e.message));
  startBot({ getSettings: () => settings, saveChatId: async (id) => { settings.telegram.chatId = id; await writeJson('settings.json', settings); broadcast(); }, handlers: botHandlers, log });
});
