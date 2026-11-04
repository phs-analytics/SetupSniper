// Cupons oficiais das redes de afiliados.
//
// Busca, a cada intervaloHoras (data/coupon-sources.json), os cupons e promoções que as lojas publicam nas redes
// em que a conta do usuário foi aprovada:
//   - Awin Offers API (KaBuM!): promoções e códigos ativos e futuros (src/sources/awin.js → offers()).
//   - Lomadee (Terabyte): campanhas do tipo cupom (src/sources/lomadee.js → coupons()).
//   - Shopee e AliExpress: desligadas, com o motivo no JSON (as APIs integradas não devolvem códigos) [não verificado].
// e normaliza para o modelo de src/discounts.js (centavos inteiros), com origem 'oficial', rede, validade e
// divulgadoEm. Os dados ficam em data/coupons-feed.json (dados do usuário, fora do git).
//
// Regras do projeto: nada é testado, gerado nem aplicado na loja. O cupom oficial começa com verificado: false;
// só o ✅ do usuário (setStatus) muda isso. O total continua com 1 cupom por pedido (src/discounts.js).
import { readFileSync } from 'node:fs';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalUrl, toCents } from './offer.js';
import * as awin from './sources/awin.js';
import * as lomadee from './sources/lomadee.js';
import { couponLabel, regraTexto } from '../public/cupons-oficiais.js';

export { couponLabel, regraTexto };

const ROOT = new URL('../', import.meta.url);
export const COUPON_SOURCES = JSON.parse(readFileSync(new URL('data/coupon-sources.json', ROOT), 'utf8'));
const STORES = JSON.parse(readFileSync(new URL('data/stores.json', ROOT), 'utf8')).stores ?? [];

const iso = (t) => new Date(t).toISOString();
// Datas sem fuso (a Awin manda "2026-11-10T23:59:59.000", em UTC) são lidas como UTC.
export function toIso(s) {
  if (s == null || s === '') return null;
  const str = String(s).trim();
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(str) || !/T\d/.test(str) ? str : str + 'Z';
  const t = Date.parse(withZone);
  return Number.isFinite(t) ? iso(t) : null;
}

// ---------------- regra a partir do texto da oferta ----------------
// As redes mandam o desconto só em texto ("10% OFF em SSDs", "limitado a R$ 50", "acima de R$ 300").
// Lê percentual com teto, valor fixo com mínimo, frete grátis, forma de pagamento e condições.
const MONEY = String.raw`R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)`;
const CAP_BEFORE = /(limitad[oa]s? a|at[eé]|teto(?: de)?|m[aá]xim[oa](?: de)?)\s*$/i;
const MIN_BEFORE = /(acima de|a partir de|compras de|m[ií]nimo(?: de)?)\s*$/i;

export function ruleFromText(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ');
  let percent = null;
  for (const m of t.matchAll(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/g)) {
    const ctx = t.slice(Math.max(0, m.index - 25), m.index + m[0].length + 25);
    if (/cashback|juros|parcela|moedas/i.test(ctx)) continue;
    percent = Number(m[1].replace(',', '.'));
    break;
  }
  let fixed = null;
  for (const m of t.matchAll(new RegExp(MONEY + String.raw`\s*(?:off\b|de desconto|de desc\b|desconto)`, 'gi'))) {
    const before = t.slice(Math.max(0, m.index - 25), m.index);
    if (CAP_BEFORE.test(before) || MIN_BEFORE.test(before)) continue;
    fixed = toCents(m[1]);
    break;
  }
  const cap = t.match(new RegExp(String.raw`(?:limitad[oa]s? a|at[eé]|teto de|m[aá]ximo de)\s*` + MONEY, 'i'));
  const min = t.match(new RegExp(String.raw`(?:acima de|a partir de|compras de|pedido m[ií]nimo de|valor m[ií]nimo de|m[ií]nimo de|m[ií]nimo)\s*` + MONEY, 'i'));
  const conditions = [];
  if (/primeira compra|1[ªa] compra|novos? clientes?|novos? usu[aá]rios?/i.test(t)) conditions.push('first_purchase');
  if (/assinantes?|meli\s*\+|meli plus|\bprime\b/i.test(t)) conditions.push('subscriber');
  if (/(s[oó]|somente|apenas|exclusivo)\s*(no|pelo|para o)?\s*(app\b|aplicativo)/i.test(t)) conditions.push('app_only');
  const pix = /(s[oó]|somente|apenas|exclusivo|pagando|pagamento)\s*(?:somente\s*|apenas\s*)?(no|via|com|pelo|por)\s*pix/i.test(t);
  const card = /(s[oó]|somente|apenas)\s*(no|com|via)\s*cart[aã]o/i.test(t);
  const appliesTo = pix ? ['pix'] : card ? ['card'] : null;
  const minOrder = min ? toCents(min[1]) : null;
  if (percent && percent > 0 && percent < 100) return { type: 'percent', value: percent, maxDiscount: cap ? toCents(cap[1]) : null, minOrder, appliesTo, conditions };
  if (fixed) return { type: 'fixed', value: fixed, maxDiscount: null, minOrder, appliesTo, conditions };
  if (/frete gr[aá]tis/i.test(t)) return { type: 'shipping', value: null, maxDiscount: null, minOrder, appliesTo, conditions };
  return { type: 'unknown', value: null, maxDiscount: null, minOrder, appliesTo, conditions };
}

// Vale só em parte da loja? (texto "selecionados"/"participantes" ou link para uma categoria)
const GENERIC_PATHS = new Set(['', 'hotsite', 'cupons', 'cupom', 'promocao', 'promocoes', 'ofertas', 'black-friday', 'blackfriday', 'campanha', 'campanhas']);
function partOfStore(text, url) {
  if (/selecionad|participantes|categorias? (espec|selec)/i.test(text)) return true;
  if (!url) return false;
  try { return !GENERIC_PATHS.has(new URL(url).pathname.split('/').filter(Boolean)[0] ?? ''); } catch { return false; }
}

const httpsOrNull = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);
const cleanCode = (s) => String(s ?? '').trim().replace(/\s+/g, '').toUpperCase();

// Monta o cupom no formato de src/discounts.js, a partir dos campos comuns das redes.
function build({ id, rede, loja, codigo, titulo, descricao, termos, inicio, fim, divulgadoEm, url, affiliateUrl, exclusivo, promocao }, lidoEm) {
  const code = cleanCode(codigo);
  if (!promocao && !code) return null;    // cupom sem código visível (programa não aprovado): fica de fora
  const text = [titulo, descricao, termos].filter(Boolean).join('\n');
  const rule = ruleFromText(text);
  const pageUrl = url ? canonicalUrl(url) : null;
  const conditions = [...rule.conditions];
  if (partOfStore(text, pageUrl)) conditions.push('selected_items');
  const divulgado = toIso(divulgadoEm) ?? lidoEm;
  return {
    id, origem: 'oficial', rede, kind: promocao ? 'promocao' : 'cupom',
    store: loja, seller: null, productUrl: null,
    codes: promocao ? [] : [code],
    type: rule.type, value: rule.value, maxDiscount: rule.maxDiscount, minOrder: rule.minOrder, appliesTo: rule.appliesTo, conditions,
    title: titulo ?? null, description: descricao ?? null, terms: termos || null,
    pageUrl, affiliateUrl: httpsOrNull(affiliateUrl),
    exclusivo: exclusivo === true, regraDoTexto: true, announcedPrice: null, inferred: false,
    source: 'official_api', sourceName: rede, sourceUrl: pageUrl,
    startsAt: toIso(inicio), expiresAt: toIso(fim),
    divulgadoEm: divulgado, lidoEm, seenAt: divulgado,
    status: 'unverified', verificado: false,
  };
}

// Awin: aceita o item cru da Offers API ({ promotionId, voucher: { code } ... }) ou o de awin.offers() ({ id, codigo ... }).
export function normalizeAwin(p, { loja, lidoEm }) {
  if (!p) return null;
  const raw = 'promotionId' in p;
  const tipo = raw ? (p.type === 'voucher' ? 'cupom' : 'promocao') : p.tipo;
  return build({
    id: `awin-${raw ? p.promotionId : p.id}`, rede: 'Awin', loja,
    codigo: raw ? p.voucher?.code : p.codigo,
    titulo: raw ? p.title : p.titulo, descricao: raw ? p.description : p.descricao, termos: raw ? p.terms : p.termos,
    inicio: raw ? p.startDate : p.inicio, fim: raw ? p.endDate : p.fim,
    divulgadoEm: raw ? p.dateAdded : p.adicionadoEm,
    url: p.url, affiliateUrl: raw ? p.urlTracking : p.affiliateUrl,
    exclusivo: raw ? p.voucher?.exclusive : p.exclusivo,
    promocao: tipo !== 'cupom',
  }, lidoEm);
}

// Lomadee: item de lomadee.coupons(). PersonalCoupon = código exclusivo do afiliado.
export function normalizeLomadee(c, { loja, lidoEm }) {
  if (!c) return null;
  return build({
    id: `lomadee-${c.id}`, rede: 'Lomadee', loja, codigo: c.codigo,
    titulo: c.nome, descricao: c.descricao, termos: null, inicio: c.inicio, fim: c.fim, divulgadoEm: c.criadoEm,
    url: c.url, affiliateUrl: c.affiliateUrl, exclusivo: c.tipo === 'PersonalCoupon', promocao: false,
  }, lidoEm);
}

// ---------------- funções puras: expiração e deduplicação ----------------
// Separa a lista ativa do histórico. Vencido (expiresAt passou) ou marcado ❌ (status 'expired') → histórico.
// Cupom futuro (startsAt adiante) continua na lista ativa, com o rótulo "começa em".
export function splitActive(coupons, now = Date.now()) {
  const ativos = [], historico = [];
  for (const c of coupons ?? []) {
    if (!c) continue;
    if (c.status === 'expired') historico.push({ ...c, motivoHistorico: 'marcado como não funcionou' });
    else if (c.expiresAt && Date.parse(c.expiresAt) <= now) historico.push({ ...c, motivoHistorico: 'venceu' });
    else ativos.push(c);
  }
  return { ativos, historico };
}

const dupKey = (store, code) => `${store}|${cleanCode(code)}`;
const confirmed = (c) => c?.status === 'confirmed_by_user' || c?.verificado === true;

// Junta os oficiais com os divulgados (Telegram, posts colados, cadastro manual), sem duplicar loja + código.
// Se o mesmo código vier das duas origens, fica o oficial (com "tambemDivulgadoPor"); o ✅ dado ao divulgado passa
// para o oficial. Divulgado com vários códigos ("X OU Y") perde só os que já são oficiais.
export function mergeCoupons(oficiais = [], divulgados = []) {
  const index = new Map();
  const ofs = [];
  for (const c0 of oficiais) {
    const codes = c0.codes ?? [];
    if (codes.length && codes.every(code => index.has(dupKey(c0.store, code)))) continue;   // mesmo código por duas redes
    const c = { ...c0, origem: 'oficial', verificado: confirmed(c0) };
    for (const code of codes) if (!index.has(dupKey(c.store, code))) index.set(dupKey(c.store, code), c);
    ofs.push(c);
  }
  const out = [];
  for (const d of divulgados) {
    const codes = d.codes ?? [];
    const hits = [...new Set(codes.map(code => index.get(dupKey(d.store, code))).filter(Boolean))];
    for (const h of hits) {
      h.tambemDivulgadoPor = [...(h.tambemDivulgadoPor ?? []), { sourceName: d.sourceName ?? null, seenAt: d.seenAt ?? null }];
      if (d.status === 'confirmed_by_user' && h.status !== 'expired') { h.verificado = true; h.status = 'confirmed_by_user'; }
    }
    const rest = codes.filter(code => !index.has(dupKey(d.store, code)));
    if (codes.length && !rest.length) continue;
    out.push({ ...d, codes: rest, origem: 'divulgado', verificado: d.status === 'confirmed_by_user' });
  }
  return [...ofs, ...out];
}

// ---------------- provedores (uma entrada por rede) ----------------
const defined = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k, v]) => v != null && !k.startsWith('_')));
const storeAffiliate = (loja, rede) => defined(STORES.find(s => s.id === loja)?.afiliado?.[rede]);

export const DEFAULT_PROVIDERS = {
  awin: {
    configured: awin.configured, missing: awin.missing, normalize: normalizeAwin,
    async fetchCoupons({ cfg, rede, ...o }) {
      const out = [];
      for (const status of rede?.consultas ?? ['active', 'upcoming']) out.push(...await awin.offers({ ...cfg, ...o, status }));
      return out;
    },
  },
  lomadee: {
    configured: lomadee.configured, missing: lomadee.missing, normalize: normalizeLomadee,
    fetchCoupons: ({ cfg, rede, ...o }) => lomadee.coupons({ ...cfg, ...o }),
  },
};

const defaultFile = () => path.join(process.env.DATA_DIR || fileURLToPath(new URL('data', ROOT)), 'coupons-feed.json');
const STATUSES = ['unverified', 'confirmed_by_user', 'expired'];
const emptyDb = () => ({ versao: 1, atualizadoEm: null, redes: {}, cupons: [], historico: [], marcas: {} });

// createCouponFeed({ sources, fetchImpl, now, sleep, providers, file })
//   sources   data/coupon-sources.json já lido (padrão: COUPON_SOURCES)
//   fetchImpl fetch (injetável nos testes); now: () => ms; sleep: (ms) => Promise (limite de chamadas)
//   providers { [rede]: { configured(), missing(), fetchCoupons({ loja, cfg, rede, fetchImpl, now, sleep }), normalize(raw, { loja, lidoEm }) } }
//   file      caminho de data/coupons-feed.json (padrão: DATA_DIR ou data/)
export function createCouponFeed({ sources = COUPON_SOURCES, fetchImpl = fetch, now = Date.now, sleep, providers = DEFAULT_PROVIDERS, file = defaultFile() } = {}) {
  let db = emptyDb();
  let running = null;
  let writing = Promise.resolve();
  const intervalMs = Number(sources.intervaloHoras?.valor ?? 6) * 3600e3;
  const histDays = Number(sources.historicoDias?.valor ?? 30);
  const histMax = Number(sources.historicoMaximo?.valor ?? 300);

  const mark = (c) => {
    const m = db.marcas[c.id];
    return m ? { ...c, status: m.status, verificado: m.status === 'confirmed_by_user' } : c;
  };
  const split = () => splitActive(db.cupons.map(mark), now());
  const uniqueById = (list) => { const seen = new Set(); return list.filter(c => !seen.has(c.id) && seen.add(c.id)); };

  function save() {
    const data = JSON.stringify(db, null, 1);
    writing = writing.catch(() => {}).then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, data);
      await rename(tmp, file);
    });
    return writing;
  }

  async function load() {
    try {
      const j = JSON.parse(await readFile(file, 'utf8'));
      db = { ...emptyDb(), ...j, marcas: j.marcas ?? {} };
    } catch (e) {
      if (e.code !== 'ENOENT') db = emptyDb();   // arquivo corrompido: recomeça (os cupons voltam na próxima consulta)
    }
    return state();
  }

  const due = () => !db.atualizadoEm || now() - Date.parse(db.atualizadoEm) >= intervalMs;
  const proximaEm = () => (db.atualizadoEm ? iso(Date.parse(db.atualizadoEm) + intervalMs) : null);

  async function doRefresh() {
    const t = now();
    const lidoEm = iso(t);
    const redes = {};
    const cupons = [];
    const saiu = [];
    for (const [id, rede] of Object.entries(sources.redes ?? {})) {
      const prev = db.cupons.filter(c => c.id.startsWith(id + '-'));
      const prov = providers[id];
      let motivo = null;
      if (!rede.ativa) motivo = rede.motivo ?? 'rede desligada em data/coupon-sources.json';
      else if (!prov) motivo = 'sem integração no SetupSniper';
      else if (!prov.configured()) motivo = `falta ${prov.missing().join(', ')} no .env`;
      if (motivo) { redes[id] = { ok: false, pulada: true, motivo, nome: rede.nome ?? id }; cupons.push(...prev); continue; }
      try {
        const list = [];
        for (const loja of rede.lojas ?? []) {
          const raws = await prov.fetchCoupons({ loja, cfg: storeAffiliate(loja, id), rede, fetchImpl, now, ...(sleep ? { sleep } : {}) });
          for (const r of raws ?? []) { const c = prov.normalize(r, { loja, lidoEm }); if (c) list.push(c); }
        }
        const fresh = uniqueById(list);
        const ids = new Set(fresh.map(c => c.id));
        for (const c of prev) if (!ids.has(c.id) && !(c.expiresAt && Date.parse(c.expiresAt) <= t)) saiu.push({ ...c, motivoHistorico: 'saiu da rede', removidoEm: lidoEm });
        cupons.push(...fresh);
        redes[id] = { ok: true, em: lidoEm, n: fresh.length, nome: rede.nome ?? id };
      } catch (e) {
        redes[id] = { ok: false, em: lidoEm, erro: String(e?.message ?? e), nome: rede.nome ?? id };
        cupons.push(...prev);
      }
    }
    // vencidos saem da lista e entram no histórico (as marcas ✅/❌ ficam guardadas à parte)
    const { ativos, historico } = splitActive(cupons, t);
    const vencidos = historico.filter(c => c.motivoHistorico === 'venceu');
    const keep = new Set(ativos.map(c => c.id).concat(historico.filter(c => c.motivoHistorico !== 'venceu').map(c => c.id)));
    db.cupons = cupons.filter(c => keep.has(c.id));
    const limite = t - histDays * 864e5;
    db.historico = uniqueById([...saiu, ...vencidos, ...db.historico])
      .filter(c => !keep.has(c.id))
      .filter(c => Date.parse(c.removidoEm ?? c.expiresAt ?? c.lidoEm ?? 0) >= limite)
      .slice(0, histMax);
    const vivos = new Set(db.cupons.map(c => c.id).concat(db.historico.map(c => c.id)));
    db.marcas = Object.fromEntries(Object.entries(db.marcas).filter(([k]) => vivos.has(k)));
    db.atualizadoEm = lidoEm;
    db.redes = redes;
    await save();
    const s = split();
    return { ok: true, atualizadoEm: lidoEm, proximaEm: proximaEm(), redes, ativos: s.ativos.length, historico: s.historico.length + db.historico.length };
  }

  // Consulta as redes. Antes do intervalo, não chama nada (a menos que force). Duas chamadas ao mesmo tempo
  // compartilham a mesma consulta.
  function refresh({ force = false } = {}) {
    if (running) return running;
    if (!force && !due()) return Promise.resolve({ skipped: true, atualizadoEm: db.atualizadoEm, proximaEm: proximaEm() });
    running = doRefresh().finally(() => { running = null; });
    return running;
  }

  const active = () => split().ativos;
  const history = () => { const s = split(); return uniqueById([...s.historico, ...db.historico.map(mark)]); };

  // ✅ (confirmed_by_user), ❌ (expired) ou volta para não verificado. Nunca toca na loja.
  function setStatus(id, status) {
    if (!STATUSES.includes(status)) throw new Error(`status inválido: ${status}`);
    const c = db.cupons.find(x => x.id === id) ?? db.historico.find(x => x.id === id);
    if (!c) throw new Error('cupom oficial não encontrado');
    db.marcas[id] = { status, em: iso(now()) };
    save().catch(() => {});
    return mark(c);
  }
  const isOfficialId = (id) => db.cupons.some(x => x.id === id) || db.historico.some(x => x.id === id);

  function state() {
    const s = split();
    return {
      atualizadoEm: db.atualizadoEm, proximaEm: proximaEm(), intervaloHoras: intervalMs / 3600e3,
      redes: db.redes, ativos: s.ativos, historico: uniqueById([...s.historico, ...db.historico.map(mark)]),
    };
  }

  // Agendamento: confere a cada checkEveryMs se já deu o intervalo (guardado no arquivo, então reiniciar o
  // servidor não faz consultas extras). Devolve stop().
  function start({ onUpdate = () => {}, onError = () => {}, checkEveryMs = 10 * 60e3, setIntervalImpl = setInterval, clearIntervalImpl = clearInterval } = {}) {
    const tick = () => { if (due()) refresh().then(r => { if (!r.skipped) onUpdate(r); }, onError); };
    tick();
    const h = setIntervalImpl(tick, checkEveryMs);
    h?.unref?.();
    return () => clearIntervalImpl(h);
  }

  return { load, refresh, due, active, history, state, setStatus, isOfficialId, start, intervalMs, file, flush: () => writing };
}
