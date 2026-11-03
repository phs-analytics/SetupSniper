import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPrice } from './src/scraper.js';
import { computeReliability } from './src/reliability.js';
import { fetchReclameAqui } from './src/reclameaqui.js';
import { ADAPTERS, searchStore } from './src/stores.js';
import { cleanResults, flagOutliers } from './src/extract.js';
import { browserAvailable } from './src/browser.js';
import { startBot, sendMessage, escHtml } from './src/telegram.js';
import { VERSION, selfUpdate } from './src/update.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* sem .env */ }
const DATA = (f) => path.join(ROOT, 'data', f);
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DEMO = process.argv.includes('--demo') || process.env.DEMO === '1';
const SENHA = process.env.SENHA || '';
const HISTORY_MAX = 300;

const readJson = async (f, fb) => existsSync(DATA(f)) ? JSON.parse(await readFile(DATA(f), 'utf8')) : fb;
const saving = {};
const writeJson = (f, v) => (saving[f] = (saving[f] ?? Promise.resolve()).then(() => writeFile(DATA(f), JSON.stringify(v, null, 2))).catch(e => console.error(e)));

const storesCfg = await readJson('stores.json', { stores: [] });
const watch = await readJson('watchlist.json', null) ?? await readJson('watchlist.example.json', { items: [] });
const settings = await readJson('settings.json', {});
settings.intervalMin ??= Number(process.env.INTERVAL_MIN) || 15;
settings.monitorStores ??= storesCfg.stores.filter(s => !s.agregador).map(s => s.id);
settings.alerts ??= { enabled: true, dropPct: 10, minScore: 60, allowSuspicious: false };
settings.telegram ??= { token: '', chatId: '' };
if (process.env.TELEGRAM_TOKEN) settings.telegram.token = process.env.TELEGRAM_TOKEN;
if (process.env.TELEGRAM_CHAT_ID) settings.telegram.chatId = process.env.TELEGRAM_CHAT_ID;
const history = await readJson('history.json', {});        // "itemId:storeId" e "itemId:__best" -> [{t, price}]
const alertState = await readJson('alerts.json', { last: {}, log: [] });

const offers = {};       // offers[itemId][storeId] = {price, title, url, image, updatedAt, error, suspeito}
const checking = new Set();
const raLive = {};
let lastRefresh = null, refreshing = false;
const clients = new Set();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);

// ---------- lojas e score ----------
function storesWithScore() {
  return storesCfg.stores.map(s => {
    const live = raLive[s.id];
    const merged = live ? { ...s, reclameAqui: { ...s.reclameAqui, ...Object.fromEntries(Object.entries(live.data).filter(([, v]) => v != null)) } } : s;
    return { ...merged, deepOnly: !!ADAPTERS[s.id]?.deepOnly, raFonte: live ? `Reclame Aqui ao vivo (${live.at})` : s.fonte,
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
    items: watch.items.map(it => ({
      ...it, checking: checking.has(it.id),
      bestHistory: (history[`${it.id}:__best`] ?? []).slice(-60),
      offers: settings.monitorStores.map(sid => ({ storeId: sid, pin: it.pins?.[sid] ?? null, ...offers[it.id]?.[sid], history: (history[`${it.id}:${sid}`] ?? []).slice(-40) })),
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
async function demoSearch(storeId, q) {
  await sleep(250 + (hash(storeId + q) % 1400));
  const base = demoBase(q), h = hash(storeId + q), n = 2 + (h % 5);
  const variants = ['', 'Box', 'Lacrado', 'Versão 2026', 'Garantia 1 ano', 'Envio imediato'];
  const items = Array.from({ length: n }, (_, i) => {
    const drift = Math.sin(Date.now() / 6e5 + h + i) * 0.03;
    const f = 0.9 + ((h >> (i * 3)) % 25) / 100 + drift + (storeId === 'aliexpress' ? -0.12 : 0);
    return { title: `${q.replace(/\b\w/g, c => c.toUpperCase())} ${variants[(h + i) % variants.length]}`.trim(),
      price: Math.round(base * f * 100) / 100, url: `https://example.com/${storeId}/${i}`, image: null, available: (h + i) % 9 !== 0, official: i === 0 };
  });
  if (['shopee', 'aliexpress'].includes(storeId)) items.push({ title: `${q} Promoção`, price: Math.round(base * 0.45), url: `https://example.com/${storeId}/x`, available: true });
  items.push({ title: `Adesivo ${q}`, price: Math.round(base * 0.05), url: `https://example.com/${storeId}/a`, available: true });
  return { items, searchUrl: ADAPTERS[storeId]?.url(q, 1) };
}

// ---------- busca ----------
async function searchOne(storeId, q, deep) {
  const r = DEMO ? await demoSearch(storeId, q) : await searchStore(storeId, q, { deep });
  const items = cleanResults(r.items, q).map(x => ({ ...x, storeId }));
  return { items, searchUrl: r.searchUrl, raw: r.items.length };
}

async function runSearch(q, { deep = false, stores, onStore } = {}) {
  const ids = (stores?.length ? stores : storesCfg.stores.map(s => s.id))
    .filter(id => ADAPTERS[id] && (deep || !ADAPTERS[id].deepOnly));
  const all = [];
  await Promise.all(ids.map(async (id) => {
    const t0 = Date.now();
    try {
      const r = await searchOne(id, q, deep);
      all.push(...r.items);
      onStore?.({ storeId: id, status: 'ok', items: r.items, raw: r.raw, searchUrl: r.searchUrl, ms: Date.now() - t0 });
    } catch (e) {
      onStore?.({ storeId: id, status: 'error', error: e.message, items: [], searchUrl: ADAPTERS[id].url(q, 1), ms: Date.now() - t0 });
    }
  }));
  return flagOutliers(all);
}

// ---------- monitoramento ----------
async function checkItem(it) {
  if (checking.has(it.id)) return;
  checking.add(it.id); broadcast();
  try {
    const res = (offers[it.id] ??= {});
    const found = [];
    await Promise.all(settings.monitorStores.map(async (sid) => {
      const pin = it.pins?.[sid];
      try {
        if (pin && !DEMO) {
          const r = await fetchPrice({ url: pin, storeId: sid, minPrice: it.minPrice ?? 0, maxPrice: it.maxPrice ?? Infinity });
          found.push({ ...r, url: pin, storeId: sid, pinned: true });
        } else {
          const r = await searchOne(sid, it.query, false);
          found.push(...r.items.filter(x => (!it.minPrice || x.price >= it.minPrice) && (!it.maxPrice || x.price <= it.maxPrice)));
          if (!r.items.length) res[sid] = { ...res[sid], error: r.raw ? 'Nenhum resultado compatível' : 'Nenhum resultado', errorAt: Date.now(), searchUrl: r.searchUrl };
        }
      } catch (e) {
        res[sid] = { ...res[sid], error: e.message, errorAt: Date.now() };
      }
    }));
    const flagged = flagOutliers(found);
    for (const sid of settings.monitorStores) {
      const cands = flagged.filter(x => x.storeId === sid && x.available !== false).sort((a, b) => (a.suspeito - b.suspeito) || (a.price - b.price));
      const best = cands[0];
      if (!best) continue;
      res[sid] = { price: best.price, title: best.title, url: best.url, image: best.image, suspeito: !!best.suspeito, pinned: !!best.pinned,
        official: !!best.official, count: cands.length, updatedAt: Date.now(), error: null };
      record(`${it.id}:${sid}`, best.price);
    }
    const valid = Object.entries(res).filter(([sid, o]) => o.price && !o.error && !o.suspeito && (scoreOf(sid) ?? 0) >= settings.alerts.minScore);
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
  if (!a.enabled) return;
  const avg = avg30(it);
  const hits = [];
  for (const [sid, o] of Object.entries(offers[it.id] ?? {})) {
    if (!o.price || o.error || (o.suspeito && !a.allowSuspicious)) continue;
    const sc = scoreOf(sid);
    if (sc != null && sc < a.minScore) continue;
    const reasons = [];
    if (it.target && o.price <= it.target) reasons.push(`atingiu sua meta de ${brl(it.target)}`);
    if (avg && o.price <= avg * (1 - a.dropPct / 100)) reasons.push(`${Math.round((1 - o.price / avg) * 100)}% abaixo da média de 30 dias (${brl(avg)})`);
    if (!reasons.length) continue;
    const key = `${it.id}:${sid}`, prev = alertState.last[key];
    if (prev && o.price >= prev.price * 0.99 && Date.now() - prev.t < 24 * 3600e3) continue; // já avisado
    alertState.last[key] = { price: o.price, t: Date.now() };
    hits.push({ sid, o, sc, reasons, store: storesCfg.stores.find(s => s.id === sid)?.name ?? sid });
  }
  if (!hits.length) return;
  hits.sort((x, y) => x.o.price - y.o.price);
  const top = hits[0];
  // Uma mensagem por produto, com a melhor oferta em destaque e as outras listadas.
  const entry = { t: Date.now(), itemId: it.id, item: it.name, storeId: top.sid, store: top.store, price: top.o.price, url: top.o.url,
    reasons: top.reasons, score: top.sc, others: hits.length - 1, sent: false };
  const tgc = settings.telegram;
  if (tgc.token && tgc.chatId) {
    const others = hits.slice(1, 4).map(h => `• ${brl(h.o.price)} na ${escHtml(h.store)}${h.o.url ? ` — <a href="${escHtml(h.o.url)}">abrir</a>` : ''}`).join('\n');
    try {
      await sendMessage(tgc.token, tgc.chatId,
        `🔥 <b>Preço baixo!</b>\n<b>${escHtml(it.name)}</b>\n\n💰 <b>${brl(top.o.price)}</b> na ${escHtml(top.store)}${top.sc != null ? ` (confiabilidade ${top.sc}/100)` : ''}\n` +
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

// ---------- comandos do bot ----------
const botHandlers = {
  async precos() {
    if (!watch.items.length) return 'Nenhum produto monitorado. Adicione pela aba Monitorados.';
    return '📊 <b>Melhores preços agora</b>\n\n' + watch.items.map(it => {
      const best = Object.entries(offers[it.id] ?? {}).filter(([sid, o]) => o.price && !o.error && !o.suspeito && (scoreOf(sid) ?? 100) >= settings.alerts.minScore)
        .sort((a, b) => a[1].price - b[1].price)[0];
      const name = storesCfg.stores.find(s => s.id === best?.[0])?.name;
      return `<b>${escHtml(it.name)}</b>\n` + (best ? `${brl(best[1].price)} na ${escHtml(name)}${it.target ? ` · meta ${brl(it.target)}` : ''}\n<a href="${escHtml(best[1].url)}">abrir</a>` : 'sem oferta ainda');
    }).join('\n\n');
  },
  async status() {
    const up = process.uptime(), mem = process.memoryUsage().rss / 1048576;
    return `🖥 <b>SetupSniper</b> v${VERSION.version}${VERSION.commit ? ` (${VERSION.commit})` : ''}\n` +
      `Ligado há ${Math.floor(up / 3600)} h ${Math.floor(up % 3600 / 60)} min · memória ${mem.toFixed(0)} MB\n` +
      `${watch.items.length} produto(s) monitorado(s) · última verificação ${lastRefresh ? new Date(lastRefresh).toLocaleTimeString('pt-BR') : 'ainda não'}\n` +
      `Use /atualizar para baixar a versão mais nova do GitHub.`;
  },
  async atualizar() {
    const r = await selfUpdate();
    if (r.restart) setTimeout(() => process.exit(0), 1500); // o script iniciar.sh sobe de novo
    return r.message;
  },
  async buscar(q) {
    const res = (await runSearch(q, { stores: settings.monitorStores })).filter(r => !r.suspeito && r.available !== false).sort((a, b) => a.price - b.price).slice(0, 6);
    if (!res.length) return `Nada encontrado para "${escHtml(q)}".`;
    return `🔎 <b>${escHtml(q)}</b>\n\n` + res.map(r => {
      const sc = scoreOf(r.storeId), n = storesCfg.stores.find(s => s.id === r.storeId)?.name;
      return `${brl(r.price)} · ${escHtml(n)}${sc != null ? ` (${sc})` : ''}\n<a href="${escHtml(r.url ?? '')}">${escHtml(r.title.slice(0, 70))}</a>`;
    }).join('\n\n');
  },
};

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
async function body(req) { let b = ''; for await (const c of req) { b += c; if (b.length > 1e5) throw new Error('payload grande'); } return b ? JSON.parse(b) : {}; }
const json = (res, code, v) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)); };
const STORE_HOSTS = Object.values(ADAPTERS).map(a => new URL(a.base).hostname.replace(/^(www|pt|lista)\./, ''));
function storeUrl(u) {
  try { const h = new URL(u); return /^https?:$/.test(h.protocol) && STORE_HOSTS.some(d => h.hostname === d || h.hostname.endsWith('.' + d)) ? h.href : null; } catch { return null; }
}
const num = (v) => v === '' || v == null ? null : Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
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
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      let closed = false; req.on('close', () => { closed = true; });
      const send = (o) => !closed && res.write(`data: ${JSON.stringify(o)}\n\n`);
      log(`[busca] "${q}"${deep ? ' (profunda)' : ''}`);
      await runSearch(q, { deep, stores, onStore: (r) => send({ type: 'store', ...r }) });
      send({ type: 'done' }); return res.end();
    }

    if (pathname === '/api/refresh' && req.method === 'POST') { refreshAll(); return json(res, 202, { ok: true }); }

    if (pathname === '/api/watch' && req.method === 'POST') {
      const b = await body(req);
      const query = String(b.query ?? '').trim();
      if (query.length < 2) return json(res, 400, { error: 'Informe o que buscar' });
      const ref = num(b.refPrice);
      const it = { id: newId(), name: String(b.name || query).slice(0, 120), query, target: num(b.target),
        minPrice: num(b.minPrice) ?? (ref ? Math.round(ref * 0.5) : null), maxPrice: num(b.maxPrice) ?? (ref ? Math.round(ref * 2.5) : null),
        pins: b.pin?.storeId && ADAPTERS[b.pin.storeId] && storeUrl(b.pin.url) ? { [b.pin.storeId]: storeUrl(b.pin.url) } : {}, createdAt: Date.now() };
      watch.items.unshift(it);
      await writeJson('watchlist.json', watch);
      checkItem(it).then(() => writeJson('history.json', history));
      return json(res, 201, it);
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
        if (b.pin?.storeId && ADAPTERS[b.pin.storeId]) {
          it.pins ??= {};
          if (!b.pin.url) delete it.pins[b.pin.storeId];
          else if (storeUrl(b.pin.url)) it.pins[b.pin.storeId] = storeUrl(b.pin.url);
          else return json(res, 400, { error: 'O link precisa ser de uma das lojas suportadas' });
        }
        await writeJson('watchlist.json', watch); broadcast(); checkItem(it);
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
      if (Array.isArray(b.monitorStores)) settings.monitorStores = b.monitorStores.filter(id => ADAPTERS[id]);
      if (b.intervalMin) { settings.intervalMin = Math.max(5, Math.min(720, Number(b.intervalMin))); schedule(); }
      await writeJson('settings.json', settings); broadcast();
      return json(res, 200, publicSettings());
    }
    if (pathname === '/api/telegram/test' && req.method === 'POST') {
      const t = settings.telegram;
      if (!t.token) return json(res, 400, { error: 'Salve o token do bot primeiro.' });
      if (!t.chatId) return json(res, 400, { error: 'Envie /start para o seu bot no Telegram para conectar o chat.' });
      try { await sendMessage(t.token, t.chatId, '✅ Teste do <b>SetupSniper</b>: as notificações estão funcionando.'); return json(res, 200, { ok: true }); }
      catch (e) { return json(res, 502, { error: 'Telegram recusou: ' + e.message }); }
    }

    const file = path.join(ROOT, 'public', pathname === '/' ? 'index.html' : pathname);
    if (!file.startsWith(path.join(ROOT, 'public')) || !existsSync(file)) { res.writeHead(404); return res.end('não encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: e.message }); else res.end();
  }
});

let timer = null;
function schedule() { clearInterval(timer); timer = setInterval(refreshAll, (DEMO ? 1 : settings.intervalMin) * 60e3); }

async function refreshReclameAqui() {
  if (DEMO) return;
  for (const s of storesCfg.stores) {
    if (!s.reclameAquiSlug) continue;
    const data = await fetchReclameAqui(s.reclameAquiSlug);
    if (data) raLive[s.id] = { data, at: new Date().toLocaleDateString('pt-BR') };
    await sleep(2000);
  }
  broadcast();
}

server.listen(PORT, HOST, () => {
  console.log(`\n  SetupSniper em http://localhost:${PORT}${DEMO ? '  (MODO DEMO — preços simulados)' : ''}`);
  console.log(`  Monitorando ${watch.items.length} produto(s) a cada ${DEMO ? 1 : settings.intervalMin} min · navegador headless: ${browserAvailable() ? 'sim' : 'não'}${SENHA ? ' · com senha' : ''}\n`);
  refreshReclameAqui();
  refreshAll();
  schedule();
  setInterval(refreshReclameAqui, 24 * 3600e3);
  const t = settings.telegram;
  if (!DEMO && t.token && t.chatId) sendMessage(t.token, t.chatId, `🟢 <b>SetupSniper</b> ligado (v${VERSION.version}). Monitorando ${watch.items.length} produto(s).`).catch(e => log('[telegram] ' + e.message));
  startBot({ getSettings: () => settings, saveChatId: async (id) => { settings.telegram.chatId = id; await writeJson('settings.json', settings); broadcast(); }, handlers: botHandlers, log });
});
