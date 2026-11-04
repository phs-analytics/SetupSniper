// Histórico próprio de preços. Todo preço que o servidor vê vira um ponto numa
// série temporal, gravado em JSONL por mês (<dataDir>/history/2026-11.jsonl), só com módulos do Node.
// Linha: { t (ISO), sig (signatureKey do título), store, seller, pix (centavos), origem, key? (fixado "itemId:storeId") }
// Regras (dedupe, limites do selo "inflado", retenção) em data/history-rules.json, com fonte e data.
// Guia: docs/historico.md. Testes: tests/price-history.test.js (sem rede, relógio injetado, pasta temporária).
import * as fsp from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { productSignature, sameProduct } from './compare.js';

const DIA = 864e5, HORA = 3600e3, MIN = 60e3;
const RULES_FILE = new URL('../data/history-rules.json', import.meta.url);

export function loadHistoryRules() { return JSON.parse(readFileSync(RULES_FILE, 'utf8')); }

// ---------- assinatura em texto ----------
// productSignature() devolve conjuntos; no arquivo vai uma chave estável: "códigos|palavras", em ordem alfabética.
export function signatureKey(input) {
  if (input == null) return null;
  if (typeof input === 'string' && (/^[a-z0-9.\- ]*\|[a-z0-9 ]*$/.test(input) || /^legado:/.test(input))) return input;   // já é chave
  const s = typeof input === 'string' ? productSignature(input) : input;
  if (!s?.codes || !s?.words) return null;
  const k = `${[...s.codes].sort().join(' ')}|${[...s.words].sort().join(' ')}`;
  return k === '|' ? null : k;
}
export function parseSignatureKey(key) {
  const [c = '', w = ''] = String(key).split('|');
  return { codes: new Set(c.split(' ').filter(Boolean)), words: new Set(w.split(' ').filter(Boolean)) };
}

const toMs = (t) => (t instanceof Date ? t.getTime() : typeof t === 'number' ? t : Date.parse(t));
export const monthOf = (t) => new Date(toMs(t)).toISOString().slice(0, 7);   // UTC

// ---------- indicadores (funções puras) ----------
const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);   // centavos inteiros
};
const pct = (x) => Math.round(x * 1000) / 10;   // 0,2369 → 23,7

const COMECANDO = (n, dias) => ({
  estado: 'historico_comecando', texto: 'histórico começando', pontos: n, dias,
  atual: null, min30: null, mediana30: null, min90: null, mediana90: null, menor90: false, inflado: null,
});

// Selo "preço inflado antes da promoção" numa série de uma loja × vendedor (em ordem de tempo).
// precoDe: preço "de" anunciado pela loja (opcional); sem ele, o "de" é o último preço antes da queda.
function inflatedCheck(serie, { now, rules, precoDe, atual }) {
  const R = rules.inflado;
  if (!serie.length) return null;
  const last = serie.at(-1);
  const c = atual ?? last.pix;
  let de, tQueda;
  if (precoDe != null) {
    de = precoDe; tQueda = last.ms;
  } else {
    let j = -1;
    for (let i = serie.length - 1; i >= 0; i--) if (serie[i].pix > c) { j = i; break; }
    if (j < 0 || j === serie.length - 1) return { ativo: false, motivo: 'sem queda' };
    de = serie[j].pix; tQueda = serie[j + 1].ms;
  }
  if (!(de > c)) return { ativo: false, motivo: 'sem queda' };
  // menor preço nos N dias antes da queda (a regra europeia do "menor preço dos 30 dias anteriores")
  const antes = serie.filter((p) => p.ms < tQueda && p.ms >= tQueda - R.janelaDias * DIA).map((p) => p.pix);
  if (!antes.length) return { ativo: false, motivo: 'sem preço antes da queda' };
  const base = Math.min(...antes);
  const altaPct = pct((de - base) / base);
  const quedaRealPct = pct((base - c) / base);
  const recente = now - tQueda <= R.quedaRecenteDias * DIA;
  const ativo = recente && altaPct >= R.altaMinimaPct && quedaRealPct < R.quedaRealMaximaPct;
  return { ativo, de, base, atual: c, altaPct, quedaRealPct, desde: new Date(tQueda).toISOString(), janelaDias: R.janelaDias };
}

// points: [{ t, pix, store?, seller? }]. Opções: now (ms), atual (preço atual em centavos), precoDe, rules.
export function computeIndicators(points, { now = Date.now(), atual, precoDe, rules = loadHistoryRules() } = {}) {
  const [j30, j90] = rules.janelasDias ?? [30, 90];
  const pts = (points ?? []).map((p) => ({ ...p, ms: toMs(p.t) }))
    .filter((p) => Number.isInteger(p.pix) && p.pix > 0 && Number.isFinite(p.ms) && p.ms <= now && p.ms >= now - j90 * DIA)
    .sort((a, b) => a.ms - b.ms);
  const dias = pts.length ? Math.round(((pts.at(-1).ms - pts[0].ms) / DIA) * 10) / 10 : 0;
  const C = rules.historicoComecando;
  if (pts.length < C.minPontos || dias < C.minDias) return COMECANDO(pts.length, dias);

  const p30 = pts.filter((p) => p.ms >= now - j30 * DIA).map((p) => p.pix);
  const p90 = pts.map((p) => p.pix);
  const recentes = pts.filter((p) => p.ms >= now - (rules.atualHoras ?? 24) * HORA).map((p) => p.pix);
  const cur = atual ?? (recentes.length ? Math.min(...recentes) : pts.at(-1).pix);
  const min90 = Math.min(...p90);

  // o selo olha a série da loja × vendedor do ponto mais recente (misturar lojas inventaria "altas")
  const last = pts.at(-1);
  const serie = pts.filter((p) => p.store === last.store && (p.seller ?? null) === (last.seller ?? null));
  const inflado = inflatedCheck(serie, { now, rules, precoDe, atual }) ?? { ativo: false };

  return {
    estado: 'ok', texto: null, pontos: pts.length, dias, atual: cur,
    min30: p30.length ? Math.min(...p30) : null, mediana30: median(p30),
    min90, mediana90: median(p90),
    menor90: cur <= min90,
    inflado,
  };
}

// ---------- Keepa (opcional, só Amazon) ----------
// [não verificado] formato conferido só pela documentação pública; teste com fixture.
const KEEPA_EPOCH_MIN = 21564000;   // minutos entre 1970-01-01 e 2011-01-01
export const keepaConfigured = (env = process.env) => !!env.KEEPA_API_KEY;

export function keepaToPoints(product, { store = 'amazon' } = {}) {
  const sig = signatureKey(product?.title ?? '');
  if (!sig) return [];
  const out = [];
  const series = [[0, 'Amazon'], [1, 'Marketplace (novo)']];   // csv[0] AMAZON, csv[1] NEW
  for (const [idx, seller] of series) {
    const csv = product.csv?.[idx];
    if (!Array.isArray(csv)) continue;
    for (let i = 0; i + 1 < csv.length; i += 2) {
      const min = csv[i], pix = csv[i + 1];
      if (!Number.isInteger(pix) || pix <= 0 || !Number.isFinite(min)) continue;   // -1 = sem estoque
      out.push({ t: new Date((min + KEEPA_EPOCH_MIN) * MIN).toISOString(), sig, store, seller, pix, origem: 'keepa', fonte: 'Keepa' });
    }
  }
  return out.sort((a, b) => a.t.localeCompare(b.t));
}

export async function fetchKeepa(asin, { fetchImpl = globalThis.fetch, apiKey = process.env.KEEPA_API_KEY, domain } = {}) {
  if (!apiKey) throw new Error('KEEPA_API_KEY não configurada');
  if (!/^[A-Z0-9]{10}$/i.test(String(asin))) throw new Error('ASIN inválido');
  const dom = domain ?? loadHistoryRules().keepa?.dominioBR ?? 12;
  const url = `https://api.keepa.com/product?key=${encodeURIComponent(apiKey)}&domain=${dom}&asin=${encodeURIComponent(asin)}`;
  let res;
  try { res = await fetchImpl(url); } catch (e) { throw new Error(`Keepa: falha de rede (${e?.code ?? 'erro'})`); }
  if (!res.ok) throw new Error(`Keepa respondeu HTTP ${res.status}`);   // nunca inclui a URL (tem a chave)
  const data = await res.json();
  const product = data?.products?.[0];
  if (!product) throw new Error('Keepa: produto não encontrado');
  return { fonte: 'Keepa', asin: String(asin), title: product.title ?? null, points: keepaToPoints(product) };
}

// ---------- gravação e leitura ----------
const ORIGENS_PADRAO = ['busca', 'fixado', 'extensao', 'api', 'telegram', 'keepa'];

export function createPriceHistory({ dir, now = Date.now, fs = fsp, rules = loadHistoryRules(), onError = (e) => console.error('[histórico]', e?.message ?? e) } = {}) {
  if (!dir) throw new Error('createPriceHistory: informe dir (pasta de dados)');
  const histDir = path.join(dir, 'history');
  const ORIGENS = new Set(rules.gravacao?.origens ?? ORIGENS_PADRAO);
  const JANELA = (rules.gravacao?.janelaDedupeMin ?? 60) * MIN;
  const cache = new Map();          // "2026-11" -> { points: [...], newline: bool }
  const lastSeen = new Map();       // "sig|store|seller|key" -> { ms, pix }
  const indexed = new Set();        // meses já lidos para o dedupe
  let queue = Promise.resolve();
  let dirReady = false;

  const fileOf = (m) => path.join(histDir, `${m}.jsonl`);
  const tupla = (p) => `${p.sig}|${p.store}|${p.seller ?? ''}|${p.key ?? ''}`;
  const enqueue = (fn) => {
    const r = queue.then(fn);
    queue = r.catch(() => {});
    return r;
  };
  const safe = (fallback) => (e) => { try { onError(e); } catch (x) { return Promise.reject(x); } return fallback; };

  async function ensureDir() {
    if (!dirReady) { await fs.mkdir(histDir, { recursive: true }); dirReady = true; }
  }

  async function loadMonth(m) {
    if (cache.has(m)) return cache.get(m);
    let raw = '';
    try { raw = await fs.readFile(fileOf(m), 'utf8'); } catch (e) { if (e?.code !== 'ENOENT') throw e; }
    const points = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try { const p = JSON.parse(line); if (p && Number.isInteger(p.pix) && p.t) points.push(p); } catch { /* linha corrompida: ignora */ }
    }
    const entry = { points, newline: raw === '' || raw.endsWith('\n') };
    cache.set(m, entry);
    return entry;
  }

  async function indexMonth(m) {
    if (indexed.has(m)) return;
    indexed.add(m);
    const { points } = await loadMonth(m);
    for (const p of points) {
      const k = tupla(p), ms = toMs(p.t), cur = lastSeen.get(k);
      if (!cur || ms >= cur.ms) lastSeen.set(k, { ms, pix: p.pix });
    }
  }

  function normalizePoint(p) {
    if (!p || typeof p !== 'object') return null;
    const sig = signatureKey(p.sig ?? p.title);
    const ms = p.t == null ? now() : toMs(p.t);
    if (!sig || !p.store || typeof p.store !== 'string' || !Number.isInteger(p.pix) || p.pix <= 0 || !ORIGENS.has(p.origem) || !Number.isFinite(ms)) return null;
    const o = { t: new Date(ms).toISOString(), sig, store: p.store, seller: p.seller ?? null, pix: p.pix, origem: p.origem };
    if (p.key != null) o.key = String(p.key);
    if (p.fonte) o.fonte = String(p.fonte);
    if (p.diario) o.diario = true;
    return o;
  }

  // grava pontos já normalizados, agrupados por mês, com um append por arquivo
  async function appendPoints(list) {
    if (!list.length) return;
    await ensureDir();
    const byMonth = new Map();
    for (const p of list) { const m = monthOf(p.t); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m).push(p); }
    for (const [m, ps] of byMonth) {
      const entry = await loadMonth(m);
      const text = (entry.newline ? '' : '\n') + ps.map((p) => JSON.stringify(p)).join('\n') + '\n';
      await fs.appendFile(fileOf(m), text, 'utf8');
      entry.newline = true;
      entry.points.push(...ps);
    }
  }

  async function doRecord(points) {
    await indexMonth(monthOf(now()));
    const keep = [];
    for (const raw of points) {
      const p = normalizePoint(raw);
      if (!p) continue;
      const ms = toMs(p.t), k = tupla(p), last = lastSeen.get(k);
      if (last && last.pix === p.pix && Math.abs(ms - last.ms) < JANELA) continue;
      if (!last || ms >= last.ms) lastSeen.set(k, { ms, pix: p.pix });
      keep.push(p);
    }
    await appendPoints(keep);
    return keep.length;
  }

  // Devolve true se o ponto foi gravado, false se foi ignorado (inválido ou repetido na mesma hora). Nunca rejeita.
  const record = (point) => enqueue(() => doRecord([point])).then((n) => n === 1, safe(false));
  // Devolve quantos pontos foram gravados.
  const recordMany = (points) => enqueue(() => doRecord(Array.isArray(points) ? points : [])).catch(safe(0));

  function matcher({ sig, title, store, seller, key }) {
    const sk = sig != null ? signatureKey(sig) : null;
    const fuzzy = sk == null && title ? productSignature(title) : null;
    const fuzzyCache = new Map();
    return (p) => {
      if (store != null ? p.store !== store : (p.store === '__best' && key == null)) return false;
      if (seller !== undefined && (p.seller ?? null) !== (seller ?? null)) return false;
      if (key != null && p.key !== key) return false;
      if (sk != null && p.sig !== sk) return false;
      if (fuzzy) {
        if (!fuzzyCache.has(p.sig)) fuzzyCache.set(p.sig, sameProduct(fuzzy, parseSignatureKey(p.sig)));
        if (!fuzzyCache.get(p.sig)) return false;
      }
      return true;
    };
  }

  // series({ sig | title | key, store?, seller?, days = 90 }) → pontos em ordem de tempo
  async function series(q = {}) {
    await queue;
    const end = now(), start = end - (q.days ?? 90) * DIA;
    const months = [];
    for (let d = new Date(Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth(), 1)); d.getTime() <= end; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.toISOString().slice(0, 7));
    const ok = matcher(q), out = [];
    for (const m of months) {
      const { points } = await loadMonth(m);
      for (const p of points) { const ms = toMs(p.t); if (ms >= start && ms <= end && ok(p)) out.push(p); }
    }
    return out.sort((a, b) => toMs(a.t) - toMs(b.t)).map((p) => ({ ...p }));
  }

  // indicators(consulta | pontos, { atual?, precoDe? })
  async function indicators(input, opts = {}) {
    const days = Math.max(...(rules.janelasDias ?? [30, 90]));
    const pts = Array.isArray(input) ? input : await series({ days, ...input });
    return computeIndicators(pts, { now: now(), rules, ...opts });
  }

  // Migração do data/history.json antigo: { "itemId:storeId": [{t (ms), price}], "itemId:__best": [...], __schema: 2 }.
  // Todos os pontos entram (sem dedupe), com origem 'fixado' e a chave preservada. Idempotente por um marcador.
  async function migrateLegacy(historyJson, watchItems = []) {
    return enqueue(async () => {
      const marker = path.join(histDir, '.migrado-history-json');
      try { await fs.readFile(marker, 'utf8'); return { migrados: 0, jaMigrado: true }; } catch (e) { if (e?.code !== 'ENOENT') throw e; }
      const emCentavos = historyJson?.__schema === 2;
      const items = new Map((watchItems ?? []).map((it) => [String(it.id), it]));
      const list = [];
      for (const [k, arr] of Object.entries(historyJson ?? {})) {
        if (k.startsWith('__') || !Array.isArray(arr)) continue;
        const i = k.lastIndexOf(':');
        if (i <= 0) continue;
        const itemId = k.slice(0, i), store = k.slice(i + 1);
        const it = items.get(itemId);
        const sig = signatureKey(it?.name ?? '') ?? signatureKey(it?.query ?? '') ?? `legado:${itemId}`;
        for (const e of arr) {
          const pix = emCentavos ? e?.price : Math.round(Number(e?.price) * 100);
          const ms = toMs(e?.t);
          if (!Number.isInteger(pix) || pix <= 0 || !Number.isFinite(ms)) continue;
          list.push({ t: new Date(ms).toISOString(), sig, store, seller: null, pix, origem: 'fixado', key: k });
        }
      }
      list.sort((a, b) => a.t.localeCompare(b.t));
      await appendPoints(list);
      for (const p of list) {
        const kk = tupla(p), ms = toMs(p.t), cur = lastSeen.get(kk);
        if (!cur || ms >= cur.ms) lastSeen.set(kk, { ms, pix: p.pix });
      }
      await ensureDir();
      await fs.writeFile(marker, JSON.stringify({ t: new Date(now()).toISOString(), pontos: list.length }) + '\n', 'utf8');
      return { migrados: list.length, jaMigrado: false };
    });
  }

  // Retenção: pontos com mais de olderThanDays dias viram 1 por dia (o menor do dia, no fuso de Brasília),
  // por produto × loja × vendedor × fixado. Reescreve só os meses afetados (arquivo temporário + rename).
  async function compact({ olderThanDays = rules.retencao?.compactarAposDias ?? 180 } = {}) {
    return enqueue(async () => {
      const cutoff = now() - olderThanDays * DIA;
      const fuso = (rules.retencao?.fusoHorasDia ?? -3) * HORA;
      let files = [];
      try { files = (await fs.readdir(histDir)).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)); } catch (e) { if (e?.code !== 'ENOENT') throw e; }
      let antes = 0, depois = 0;
      for (const f of files.sort()) {
        const m = f.slice(0, 7);
        cache.delete(m);
        const { points } = await loadMonth(m);
        antes += points.length;
        const recentes = [], dias = new Map();
        for (const p of points) {
          const ms = toMs(p.t);
          if (ms >= cutoff) { recentes.push(p); continue; }
          const dia = new Date(ms + fuso).toISOString().slice(0, 10);
          const k = `${tupla(p)}|${dia}`, cur = dias.get(k);
          if (!cur || p.pix < cur.pix || (p.pix === cur.pix && ms < toMs(cur.t))) dias.set(k, p);
        }
        const velhos = [...dias.values()].map((p) => ({ ...p, diario: true }));
        const novo = [...velhos, ...recentes].sort((a, b) => toMs(a.t) - toMs(b.t));
        depois += novo.length;
        const mudou = novo.length !== points.length || points.some((p) => toMs(p.t) < cutoff && !p.diario);
        if (mudou) {
          const tmp = fileOf(m) + '.tmp';
          await fs.writeFile(tmp, novo.map((p) => JSON.stringify(p)).join('\n') + (novo.length ? '\n' : ''), 'utf8');
          await fs.rename(tmp, fileOf(m));
        }
        cache.set(m, { points: novo, newline: true });
      }
      return { antes, depois };
    });
  }

  const flush = () => queue;

  return { record, recordMany, series, indicators, migrateLegacy, compact, flush, dir: histDir };
}
