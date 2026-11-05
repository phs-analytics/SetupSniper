// Aba Ofertas: todas as ofertas de tecnologia num formato único.
//
// Entradas (uma função por tipo; todas devolvem uma LISTA de ofertas no formato único):
//   fromPost(text, meta, deps)   post de canal, grupo ou encaminhado (async: o link encurtado pode ser resolvido)
//   fromApiItem(offer, deps)     item com desconto das APIs (oferta normalizada de src/offer.js + precoDe em centavos)
//   fromCapture(offer, deps)     oferta enviada pela extensão (página aberta pelo próprio usuário)
//
// Formato único (dinheiro em centavos inteiros):
//   { id, tipo: 'produto'|'cupom'|'desconto', origem: 'telegram'|'api'|'extensao',
//     titulo, sig (signatureKey), categoria, categoriaNome, catNota, tech,
//     loja, url (canônica, limpa) | null, linkOriginal, linkStatus: 'ok'|'a_resolver'|'sem_link',
//     preco, precoDe, pagamento: 'pix'|'avista'|'parcelado'|'cartao'|null, parcelas: { n, valor, semJuros } | null,
//     cupom: { codes, type, value, maxDiscount, minOrder, appliesTo, conditions, origem: 'divulgado',
//              rotulo, detalhe, ... } | null,
//     precoJaComCupom, precoFinal (estimativa com 1 cupom) | null, precoFinalNota,
//     fontes: [{ source, sourceName, sourceUrl, at }], vistoEm, at, ultimaVez, checked, feedback, trust?, seller?, suspeito? }
//
// Regras do projeto: o cupom nunca é testado, gerado nem aplicado; o preço final é sempre uma estimativa
// (src/final-price.js, um cupom por pedido). Rede só por injeção (deps.resolveLink). Prazos, pesos e categorias
// em data/tech-categories.json, com fonte e data. Guia: docs/ofertas.md. Testes: tests/offers.test.js.
import { createHash } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { parsePromo, storeFromUrl, isGenericShortener } from './promo-parser.js';
import { isShortener } from './link-resolver.js';
import { canonicalUrl, toCents, formatBRL } from './offer.js';
import { finalTotals } from './final-price.js';
import { couponDiscount } from './discounts.js';
import { signatureKey, parseSignatureKey } from './price-history.js';
import { sameProduct } from './compare.js';
import { rankGroup } from './ranking.js';
import { normalize } from './extract.js';
import { classifyTech, classifyCoupon, techCategories, TECH_RULES } from './tech-filter.js';
import { filtrarOfertas, precoRef } from '../public/ofertas.js';
import { couponLabel } from '../public/cupons.js';
import { lerPost } from './post-oferta.js';

export { techCategories, filtrarOfertas };

const HORA = 3600e3, DIA = 864e5;
const toMs = (t) => (t == null ? null : t instanceof Date ? t.getTime() : typeof t === 'number' ? t : (Number.isFinite(Date.parse(t)) ? Date.parse(t) : null));
const iso = (ms) => new Date(ms).toISOString();
const clockOf = (now) => (typeof now === 'function' ? now() : Number.isFinite(now) ? now : Date.now());

// ---------------- texto do post ----------------
// Emojis no lugar de números: "R$ 3️⃣4️⃣9️⃣" → "R$ 349", dígitos em negrito matemático "𝟖𝟗" → "89", "🔟" → "10".
// Numeração de lista no começo da linha ("1️⃣ SSD...") vira marcador "• ".
export function normalizarTexto(s) {
  return String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^([ \t]*)(?:[0-9]\uFE0F?\u20E3|🔟)[ \t]+(?=[^\d\s])/gmu, '$1• ')
    .replace(/([0-9])\uFE0F?\u20E3/gu, '$1')
    .replace(/🔟/gu, '10')
    .replace(/[\u{1D7CE}-\u{1D7FF}\uFF10-\uFF19]/gu, (c) => c.normalize('NFKC'));
}

const URL_G = /https?:\/\/[^\s<>"')]+/gi;
const temLink = (l) => /https?:\/\//i.test(l);
const linkDeProduto = (u) => !!(storeFromUrl(u) || isShortener(u) || isGenericShortener(u));
const precisaResolver = (u) => isShortener(u) || isGenericShortener(u);
const limpar = (s) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, '').replace(/\s+/g, ' ').trim();

// Post com vários produtos: um trecho por link de loja (as linhas desde o link anterior até ele).
// Só divide quando pelo menos dois trechos têm preço. Linhas depois do último link (ex.: "Cupom para os dois: X")
// valem para todos os trechos quando eles são da mesma loja.
export function dividirPost(texto) {
  const lines = texto.split('\n');
  const idx = lines.map((l, i) => ([...l.matchAll(URL_G)].some((m) => linkDeProduto(m[0].replace(/[.,;!?]+$/, ''))) ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 2) return [texto];
  const trechos = [];
  let ini = 0;
  for (const i of idx) { trechos.push(lines.slice(ini, i + 1).join('\n')); ini = i + 1; }
  const resto = lines.slice(ini).join('\n').trim();
  const comPreco = trechos.filter((t) => precosDe(t, parsePromo(t)).preco != null);
  if (comPreco.length < 2) return [texto];
  if (resto) {
    const lojas = new Set(trechos.map((t) => parsePromo(t).store));
    if (lojas.size === 1 && parsePromo(resto).coupons.length) return trechos.map((t) => `${t}\n${resto}`);
  }
  return trechos;
}

// ---------------- nome do produto ----------------
const SKIP = /^(pre[cç]o|por\b|de\s*R\$|R\$|cupo(m|ns)|c[oó]digo|use\b|link|compre|frete|parcel|\d+\s*x\b|valor|ou\s+\d|era\b|antes\b|\(de\b)/i;
const HEADER = /^(ofertas?|promo(ç(ão|ões)|s)?|achados?|cupons?|baixou|corre|urgente|imperd[ií]vel|hoje)\b/i;
const PREFIX = /^(oferta|promo(ção)?|achado|baixou|imperd[ií]vel|corre|urgente)\s*[:!\-–]\s*/i;
const CAUDA_PRECO = /\s+(?:[-–—|:]\s*)?(?:(?:de|por|apenas|s[oó]|a partir de)\s+)?(?:R\$\s*\d|\d[\d.]*(?:,\d{2})?\s*reais\b)/i;

export function produtoDe(texto) {
  for (const raw of texto.split('\n')) {
    let l = limpar(raw.replace(URL_G, ' ')).replace(/^[•·*>\-–—\s]+/, '').replace(/^\d{1,2}\s*[.)]\s+/, '');
    if (l.length < 4) continue;
    if (PREFIX.test(l)) l = l.replace(PREFIX, '');
    else if (HEADER.test(l) || /:\s*$/.test(l)) continue;
    if (SKIP.test(l)) continue;
    const corte = l.search(CAUDA_PRECO);
    if (corte > 0) l = l.slice(0, corte);
    l = l.replace(/[\s:\-–—|]+$/, '').trim();
    if (l.length >= 4 && /\p{L}/u.test(l)) return l;
  }
  return null;
}

// ---------------- preços e forma de pagamento ----------------
const MONEY_G = /R\$\s*([\d.]+(?:,\d{1,2})?)/gi;
function valoresDaLinha(l) {
  const out = [...l.matchAll(MONEY_G)].map((m) => toCents(m[1]));
  for (const m of l.matchAll(/(?:^|[^\d,.$])(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?![\d])/g)) out.push(toCents(m[1]));
  for (const m of l.matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?\s*reais\b/gi)) out.push(toCents(`${m[1]},${m[2] ?? '00'}`));
  return out.filter(Number.isInteger);
}
function formaNaLinha(l) {
  if (/\bpix\b/i.test(l)) return 'pix';
  if (/[àa]\s+vista|\bboleto\b/i.test(l)) return 'avista';
  return null;
}

// { preco, precoDe, pagamento, parcelas } a partir do trecho e do que o promo-parser já leu
export function precosDe(texto, p = parsePromo(texto)) {
  const t = texto.replace(/[ \t]+/g, ' ');
  let preco = p.announcedPrice ?? null;
  let precoDe = p.oldPrice ?? null;
  let pagamento = null;
  // parcelas: "10x de R$ 99,90 sem juros"
  let parcelas = null;
  const mp = t.match(/(\d{1,2})\s*x\s*(?:de\s*)?R\$\s*([\d.]+(?:,\d{1,2})?)([^\n]*)/i);
  if (mp) {
    const n = Number(mp[1]), valor = toCents(mp[2]);
    if (n >= 2 && n <= 48 && valor) parcelas = { n, valor, semJuros: /sem juros/i.test(mp[3]) ? true : /com juros/i.test(mp[3]) ? false : null };
  }
  // "349 reais" (sem R$)
  if (preco == null) {
    const mr = t.match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?\s*reais\b/i);
    if (mr) preco = toCents(`${mr[1]},${mr[2] ?? '00'}`);
  }
  // só parcelado: o preço é o total das parcelas
  if (preco == null && parcelas) { preco = parcelas.n * parcelas.valor; pagamento = 'parcelado'; }
  // forma de pagamento: a linha do preço anunciado (ou a seguinte, se ela não tiver outro valor)
  if (preco != null && !pagamento) {
    const lines = t.split('\n');
    const i = lines.findIndex((l) => valoresDaLinha(l).includes(preco));
    if (i >= 0) {
      pagamento = formaNaLinha(lines[i]);
      if (!pagamento && lines[i + 1] != null && !valoresDaLinha(lines[i + 1]).length) pagamento = formaNaLinha(lines[i + 1]);
    }
  }
  // preço "de" sem "por": "(de R$ 3.299)", "era R$ 3.299" (nunca "acima de R$", "mínimo de R$" nem "10x de R$")
  if (precoDe == null && preco != null) {
    for (const m of t.matchAll(/(?:\bde|\bera|\bantes)\s*:?\s*R\$\s*([\d.]+(?:,\d{1,2})?)/gi)) {
      const antes = t.slice(Math.max(0, m.index - 14), m.index);
      if (/(acima|partir|m[ií]nimo|compras|\d\s*x)\s*$/i.test(antes)) continue;
      const v = toCents(m[1]);
      if (v && v > preco) { precoDe = v; break; }
    }
  }
  if (precoDe != null && preco != null && precoDe <= preco) precoDe = null;
  return { preco, precoDe, pagamento, parcelas };
}

// ---------------- cupom ----------------
export function rotuloCupom(c) {
  if (c.status === 'confirmed_by_user' || c.verificado === true) return 'cupom divulgado, funcionou para você';
  return 'cupom divulgado, não verificado';
}
const up = (s) => String(s).toUpperCase();

function cupomDoPost(codes, p, { loja, fonte, now }) {
  if (!codes.length) return null;
  const regra = p.rules.find((r) => r.type !== 'shipping') ?? p.rules.find((r) => r.type === 'shipping') ?? null;
  return {
    codes: [...codes], type: regra?.type ?? 'unknown', value: regra?.value ?? null, maxDiscount: regra?.maxDiscount ?? null,
    minOrder: regra?.minOrder ?? null, appliesTo: p.appliesTo ?? null, conditions: p.conditions ?? [],
    store: loja, origem: 'divulgado', status: 'unverified', verificado: false,
    source: fonte.source ?? null, sourceName: fonte.sourceName ?? null, sourceUrl: fonte.sourceUrl ?? null, seenAt: iso(now),
  };
}
function rotular(c, now) {
  if (!c) return c;
  return { ...c, rotulo: rotuloCupom(c), detalhe: couponLabel({ ...c, divulgadoEm: c.divulgadoEm ?? c.seenAt }, { now }) };
}

// Preço final estimado com UM cupom (src/final-price.js). Nunca aplica nada na loja.
// → { precoFinal, nota }. Sem cupom: o preço do post como está.
export function estimarPrecoFinal(o, { now = Date.now(), profile = {}, finalCtx = {} } = {}) {
  const c = o.cupom;
  if (!c?.codes?.length) return { precoFinal: o.preco ?? null, nota: null };
  if (o.preco == null) return { precoFinal: null, nota: null };
  if (o.precoJaComCupom) return { precoFinal: o.preco, nota: 'o post diz que o preço já é com cupom' };
  if (!c.type || c.type === 'unknown') return { precoFinal: null, nota: 'regra do cupom não informada: confira na loja' };
  if (!o.loja) return { precoFinal: null, nota: 'loja a confirmar: o link ainda não foi resolvido' };
  if (c.startsAt && toMs(c.startsAt) > now) return { precoFinal: null, nota: 'o cupom ainda não começou' };
  const method = o.pagamento === 'parcelado' || o.pagamento === 'cartao' ? 'card' : 'pix';
  const p = o.parcelas;
  const offer = {
    store: o.loja, canonicalUrl: o.url ?? null, seller: o.seller ?? null,
    price: method === 'pix' ? { pix: o.preco, card: null, installments: null }
      : { pix: null, card: o.preco, installments: p ? { n: p.n, value: p.valor, interestFree: p.semJuros } : null },
    shipping: { cost: null, origin: null, freeAbove: null },
  };
  // Cupom divulgado vale pela janela do post (já filtrada pela validade da oferta), então não leva expiresAt aqui.
  const cupom = { ...c, store: o.loja, productUrl: null, seller: null, expiresAt: null, status: c.status === 'expired' ? 'unverified' : c.status };
  const tot = finalTotals(offer, [cupom], profile, { ...finalCtx, now, stacking: 1 })[method];
  if (tot && (tot.couponDiscount > 0 || tot.coupons.some((x) => x.freeShipping))) {
    const notas = tot.notes.filter((n) => n !== 'frete não informado' && !/Pix não informado|cartão não informado/.test(n));
    return { precoFinal: tot.total, nota: ['estimativa sem frete', ...notas].join(' · ') };
  }
  const motivo = couponDiscount(cupom, o.preco, method, { profile }).notes?.[0];
  return { precoFinal: null, nota: motivo ? `o cupom não entra neste preço: ${motivo}` : 'o cupom não entra neste preço' };
}

// ---------------- montagem ----------------
const ORIGEM_FONTE = { telegram: 'telegram_channel', api: 'official_api', extensao: 'browser_capture' };

function montar(base, { now, deps = {}, textoCupom = '' }) {
  const rules = deps.rules ?? TECH_RULES;
  const cls = base.tipo !== 'produto' ? classifyCoupon(base.titulo ?? textoCupom, base.loja, rules) : classifyTech(base.titulo, rules);
  const cupom = rotular(base.cupom, now);
  const o = {
    id: null, tipo: base.tipo, origem: base.origem,
    titulo: base.titulo ?? null, sig: base.titulo && base.tipo === 'produto' ? signatureKey(base.titulo) : null,
    categoria: cls.categoria, categoriaNome: cls.nome, catNota: cls.nota, tech: cls.tech,
    loja: base.loja ?? null, url: base.url ?? null, linkOriginal: base.linkOriginal ?? null, linkStatus: base.linkStatus ?? (base.url ? 'ok' : 'sem_link'),
    preco: base.preco ?? null, precoDe: base.precoDe ?? null, pagamento: base.pagamento ?? null, parcelas: base.parcelas ?? null,
    cupom, cupomNoAnuncio: !!base.cupomNoAnuncio, precoJaComCupom: !!base.precoJaComCupom, precoFinal: null, precoFinalNota: null,
    fontes: [base.fonte], vistoEm: 1, at: iso(now), ultimaVez: iso(now), checked: null, feedback: null,
    ...(base.trust ? { trust: base.trust } : {}), ...(base.seller ? { seller: base.seller } : {}), ...(base.suspeito ? { suspeito: true } : {}),
  };
  const est = estimarPrecoFinal(o, { now, profile: deps.profile, finalCtx: deps.finalCtx });
  o.precoFinal = est.precoFinal;
  o.precoFinalNota = est.nota;
  o.id = createHash('sha1').update([o.origem, base.fonte?.sourceUrl ?? base.fonte?.sourceName ?? '', base.parte ?? 0, o.titulo ?? '', o.loja ?? '', o.preco ?? '', (cupom?.codes ?? []).join(',')].join('|')).digest('hex').slice(0, 16);
  return o;
}

const fonteDe = (meta, origem, now) => ({
  source: meta?.source ?? ORIGEM_FONTE[origem], sourceName: meta?.sourceName ?? null,
  sourceUrl: meta?.sourceUrl ?? null, at: iso(toMs(meta?.at) ?? now),
});

// ---------------- entradas ----------------
// meta: { source: 'telegram_channel'|'telegram_group'|'telegram_forward', sourceName: '@canal', sourceUrl, at }
// deps: { resolveLink(url) → { canonicalUrl, store } (opcional; sem ele, o link encurtado fica "a resolver"),
//         activeStores, profile, finalCtx, rules, now }
export async function fromPost(text, meta = {}, deps = {}) {
  const now = toMs(meta.at) ?? clockOf(deps.now);
  const texto = normalizarTexto(text);
  const out = [];
  const trechos = dividirPost(texto);
  for (const [parte, trecho] of trechos.entries()) {
    const o = await ofertaDoTrecho(trecho, { parte, meta, deps, now });
    if (o) out.push(o);
  }
  return out;
}

async function ofertaDoTrecho(trecho, { parte, meta, deps, now }) {
  const r = lerPost(trecho);   // tipo, nome, preço, cupom e loja (src/post-oferta.js)
  if (!r) return null;
  const link = r.link;
  let loja = r.loja;
  let url = null, linkStatus = link ? 'ok' : 'sem_link';
  if (link && (precisaResolver(link) || !storeFromUrl(link))) {
    linkStatus = 'a_resolver';
    if (typeof deps.resolveLink === 'function') {
      try {
        const res = await deps.resolveLink(link);
        const u = res?.canonicalUrl ?? (res?.finalUrl ? canonicalUrl(res.finalUrl) : null);
        if (u && !precisaResolver(u)) { url = u; loja = res.store ?? storeFromUrl(u) ?? loja; linkStatus = 'ok'; }
      } catch { /* fica "a resolver" */ }
    }
  } else if (link) url = canonicalUrl(link);
  if (loja === 'tiktokshop') return null;   // desligada (docs/tiktok-shop.md)
  if (loja && Array.isArray(deps.activeStores) && !deps.activeStores.includes(loja)) return null;
  if (!loja && !link) return null;          // sem loja nem link: conversa
  if (!loja && !precisaResolver(link)) return null;   // link de uma loja fora das acompanhadas

  const p = parsePromo(trecho);
  const fonte = fonteDe(meta, 'telegram', now);
  const cupom = cupomDoPost(r.codes, p, { loja, fonte, now });
  const jaComCupom = !!cupom && /pre[cç]o\s+(?:final\s+)?com\s+(?:o\s+)?cupom|com\s+(?:o\s+)?cupom\s*[:\-–]?\s*R\$/i.test(trecho);
  return montar({
    tipo: r.tipo, origem: 'telegram', titulo: r.titulo, loja, url, linkOriginal: link, linkStatus,
    preco: r.preco, precoDe: r.precoDe, pagamento: r.pagamento, parcelas: r.parcelas,
    cupom, cupomNoAnuncio: r.cupomNoAnuncio, precoJaComCupom: jaComCupom, fonte, parte,
  }, { now, deps, textoCupom: trecho.replace(URL_G, ' ') });
}

// Oferta normalizada (src/offer.js) → oferta da aba. precoDe em centavos inteiros: offer.precoDe ou offer.oldPrice.
function fromNormalized(offer, { origem, exigirDesconto, deps }) {
  if (!offer?.title) return [];
  const now = clockOf(deps.now);
  const pr = offer.price ?? {};
  const inst = pr.installments ?? null;
  const preco = pr.pix ?? pr.card ?? (inst ? inst.n * inst.value : null);
  if (!Number.isInteger(preco)) return [];
  const de = [offer.precoDe, offer.oldPrice, pr.precoDe, pr.old].find(Number.isInteger) ?? null;
  if (exigirDesconto && !(de > preco)) return [];
  const loja = offer.store ?? offer.storeId ?? null;
  if (Array.isArray(deps.activeStores) && loja && !deps.activeStores.includes(loja)) return [];
  const url = offer.canonicalUrl ?? (offer.url ? canonicalUrl(offer.url) : null);
  const at = toMs(offer.fetchedAt ?? offer.capturedAt) ?? now;
  const fonteNome = deps.sourceName ?? (origem === 'extensao' ? 'seu navegador' : 'API oficial');
  return [montar({
    tipo: 'produto', origem, titulo: offer.title, loja, url, linkOriginal: null, linkStatus: url ? 'ok' : 'sem_link',
    preco, precoDe: de > preco ? de : null, pagamento: pr.pix != null ? 'pix' : pr.card != null ? 'cartao' : inst ? 'parcelado' : null,
    parcelas: inst ? { n: inst.n, valor: inst.value, semJuros: inst.interestFree ?? null } : null,
    cupom: null, fonte: { source: ORIGEM_FONTE[origem], sourceName: fonteNome, sourceUrl: null, at: iso(at) },
    trust: offer.trust ?? null, seller: offer.seller ?? null, suspeito: !!offer.suspeito, parte: url ?? offer.title,
  }, { now: at, deps })];
}
export const fromApiItem = (offer, deps = {}) => fromNormalized(offer, { origem: 'api', exigirDesconto: deps.exigirDesconto !== false, deps });
export const fromCapture = (offer, deps = {}) => fromNormalized(offer, { origem: 'extensao', exigirDesconto: deps.exigirDesconto === true, deps });

// ---------------- duplicadas, validade, enriquecimento e ordem (funções puras) ----------------
export function chaveDuplicada(o) {
  if (o.tipo === 'cupom' && o.cupom?.codes?.length) return `cupom|${o.loja ?? ''}|${[...o.cupom.codes].map(up).sort().join(',')}`;
  if (o.tipo !== 'produto') return `${o.tipo}|${o.loja ?? ''}|${normalize(o.titulo ?? '')}`;
  return `${o.sig ?? normalize(o.titulo ?? '')}|${o.loja ?? o.linkOriginal ?? ''}|${o.preco ?? ''}`;
}
// Mesma oferta: chave igual, ou mesma loja e preço com assinaturas do mesmo produto (sameProduct de src/compare.js),
// para juntar o mesmo produto escrito de jeitos diferentes em cada canal.
export function mesmaOferta(a, b) {
  if (chaveDuplicada(a) === chaveDuplicada(b)) return true;
  if (a.tipo !== 'produto' || b.tipo !== 'produto' || !a.sig || !b.sig || !a.loja || a.loja !== b.loja) return false;
  if (!Number.isInteger(a.preco) || a.preco !== b.preco) return false;
  return sameProduct(parseSignatureKey(a.sig), parseSignatureKey(b.sig));
}
const nomeFonte = (f) => f?.sourceName ?? f?.source ?? '?';

// Junta uma oferta repetida a uma existente (devolve uma cópia): fontes, "visto em N", última vez vista,
// cupom do post mais completo, link resolvido no lugar do "a resolver".
export function juntarOfertas(e, o) {
  const r = { ...e, fontes: [...(e.fontes ?? [])] };
  for (const f of o.fontes ?? []) {
    if (!r.fontes.some((x) => nomeFonte(x) === nomeFonte(f) && (x.sourceUrl ?? null) === (f.sourceUrl ?? null))) r.fontes.push(f);
  }
  r.fontes = r.fontes.slice(-20);
  r.vistoEm = new Set(r.fontes.map(nomeFonte)).size;
  if ((toMs(o.ultimaVez) ?? 0) > (toMs(r.ultimaVez) ?? 0)) r.ultimaVez = o.ultimaVez;
  if (o.cupom && !r.cupom) {
    r.cupom = { ...o.cupom, ...(r.cupom?.status === 'confirmed_by_user' ? { status: 'confirmed_by_user', verificado: true } : {}) };
    r.cupom.rotulo = rotuloCupom(r.cupom);
    r.precoFinal = o.precoFinal; r.precoFinalNota = o.precoFinalNota; r.precoJaComCupom = o.precoJaComCupom;
  }
  if (!r.url && o.url) { r.url = o.url; r.linkStatus = 'ok'; r.loja = r.loja ?? o.loja; }
  if (!r.trust && o.trust) r.trust = o.trust;
  return r;
}

// Validade: { status: 'ativa'|'pode_ter_acabado', motivoStatus }
export function estadoOferta(o, now = Date.now(), R = TECH_RULES.ofertas) {
  if (o.feedback?.voto === 'no') return { status: 'pode_ter_acabado', motivoStatus: 'você marcou que não funcionou' };
  const ck = o.checked;
  if (ck?.disponivel === false) return { status: 'pode_ter_acabado', motivoStatus: 'a conferência não achou o produto disponível' };
  if (Number.isInteger(ck?.preco) && Number.isInteger(o.preco) && ck.preco !== o.preco) {
    return { status: 'pode_ter_acabado', motivoStatus: `a conferência achou ${formatBRL(ck.preco).replace(/\u00a0/g, ' ')} na loja` };
  }
  if (o.cupom?.expiresAt && toMs(o.cupom.expiresAt) <= now) return { status: 'pode_ter_acabado', motivoStatus: 'o cupom venceu' };
  const visto = Math.max(toMs(o.ultimaVez ?? o.at) ?? 0, ck && ck.preco === o.preco ? toMs(ck.at) ?? 0 : 0);
  if (now - visto > R.validadeHoras * HORA) return { status: 'pode_ter_acabado', motivoStatus: `divulgada há mais de ${R.validadeHoras} h` };
  return { status: 'ativa', motivoStatus: null };
}

const scoreDe = (v) => (typeof v === 'number' ? v : typeof v?.score === 'number' ? v.score : null);

// Enriquecimento por injeção: deps.historico(sig, o) → indicadores de computeIndicators (src/price-history.js);
// deps.confianca(o) → nota 0–100 (ou { score }); deps.comparativoUrl(sig, o) → link "ver nas outras lojas".
export function enrichOffer(o, deps = {}, { rules = TECH_RULES } = {}) {
  const R = rules.ofertas;
  const ref = precoRef(o);
  const historico = o.sig && typeof deps.historico === 'function' ? (deps.historico(o.sig, o) ?? null) : null;
  const confianca = Math.round(scoreDe(typeof deps.confianca === 'function' ? deps.confianca(o) : null) ?? scoreDe(o.trust) ?? NaN);
  const comparativoUrl = o.sig && typeof deps.comparativoUrl === 'function' ? deps.comparativoUrl(o.sig, o) ?? null : null;
  const hOk = historico?.estado === 'ok';
  let base = null;
  if (hOk && Number.isInteger(historico.mediana90)) base = historico.mediana90;
  else if (Number.isInteger(o.precoDe) && !historico?.inflado?.ativo) base = o.precoDe;
  else if (Number.isInteger(o.preco) && Number.isInteger(o.precoFinal) && o.precoFinal < o.preco) base = o.preco;
  const desconto = base && ref != null ? Math.max(0, (base - ref) / base) : 0;
  const suspeito = !!o.suspeito || (hOk && ref != null && Number.isInteger(historico.mediana90) && ref < historico.mediana90 * (1 - R.suspeitoAbaixoDaMedianaPct / 100));
  const nota = Number.isFinite(confianca) ? confianca : null;
  return {
    ...o, historico, comparativoUrl,
    confianca: nota,
    menor90: hOk && ref != null && Number.isInteger(historico.min90) && ref <= historico.min90,
    descontoPct: Math.round(desconto * 1000) / 10,
    suspeito,
    risco: suspeito || (nota != null && nota < 40),
    valor: desconto * ((nota ?? R.confiancaPadrao) / 100),
  };
}

// Ordem. Em todas, alto risco e suspeitos ficam depois (rankGroup de src/ranking.js); sem preço, por último
// (o cupom de loja não tem preço, mas fica junto das ofertas). 'melhor' = desconto sobre o histórico × confiança.
const semPrecoDeProduto = (o) => o.tipo === 'cupom' || o.tipo === 'desconto';
export function ordenarOfertas(list, ordem = 'melhor') {
  const k = (o) => {
    const ref = precoRef(o);
    return {
      g: rankGroup({ price: ref ?? (semPrecoDeProduto(o) ? 0 : null), score: o.confianca ?? null, suspeito: !!o.suspeito }),
      acabou: o.status === 'pode_ter_acabado' ? 1 : 0, ref: ref ?? Infinity, valor: o.valor ?? 0, t: toMs(o.ultimaVez ?? o.at) ?? 0, cupom: semPrecoDeProduto(o) ? 1 : 0,
    };
  };
  const cmp = {
    melhor: (a, b) => a.acabou - b.acabou || b.valor - a.valor || a.cupom - b.cupom || a.ref - b.ref || b.t - a.t,
    preco: (a, b) => a.acabou - b.acabou || a.cupom - b.cupom || a.ref - b.ref || b.t - a.t,
    recentes: (a, b) => b.t - a.t || a.acabou - b.acabou,
  }[ordem] ?? null;
  const f = cmp ?? ((a, b) => a.acabou - b.acabou || b.valor - a.valor || a.ref - b.ref);
  return list.map((o) => ({ o, k: k(o) })).sort((a, b) => a.k.g - b.k.g || f(a.k, b.k)).map((x) => x.o);
}

// ---------------- armazenamento (data/offers.json, fora do git) ----------------
// createOffersStore({ file, now, rules, fs }) → { load, add, list, get, markChecked, feedback, flush, resumo, size }
export function createOffersStore({ file, now = Date.now, rules = TECH_RULES, fs = fsp, onError = (e) => console.error('[ofertas]', e?.message ?? e) } = {}) {
  if (!file) throw new Error('createOffersStore: informe o arquivo (data/offers.json)');
  const R = rules.ofertas;
  const clock = () => clockOf(now);
  let ofertas = [];
  let dirty = false;

  function prune() {
    const lim = clock() - R.guardarDias * DIA;
    const antes = ofertas.length;
    ofertas = ofertas.filter((o) => (toMs(o.ultimaVez ?? o.at) ?? 0) >= lim);
    if (ofertas.length > R.maxOfertas) ofertas = ofertas.sort((a, b) => toMs(b.ultimaVez) - toMs(a.ultimaVez)).slice(0, R.maxOfertas);
    if (ofertas.length !== antes) dirty = true;
  }

  async function load() {
    try {
      const j = JSON.parse(await fs.readFile(file, 'utf8'));
      // cupons das redes de afiliados foram retirados: ofertas antigas deles saem ao carregar
      ofertas = Array.isArray(j?.ofertas) ? j.ofertas.filter((o) => o && o.id && o.origem !== 'cupom_oficial') : [];
    } catch (e) {
      if (e?.code !== 'ENOENT') onError(e);
      ofertas = [];
    }
    prune();
    return ofertas.length;
  }

  // Junta ofertas novas. Mesma chave (assinatura + loja + preço) dentro da janela → um card só.
  // → { novas: [ofertas novas], repetidas: [ofertas existentes atualizadas] }
  function add(lista) {
    const novas = [], repetidas = [];
    const janela = R.janelaDuplicadaHoras * HORA;
    for (const o of lista ?? []) {
      if (!o?.id) continue;
      const t = toMs(o.ultimaVez ?? o.at) ?? clock();
      const i = ofertas.findIndex((e) => e.id === o.id || (mesmaOferta(e, o) && Math.abs(t - (toMs(e.ultimaVez ?? e.at) ?? 0)) <= janela));
      if (i >= 0) { ofertas[i] = juntarOfertas(ofertas[i], o); repetidas.push(ofertas[i]); }
      else { ofertas.push(o); novas.push(o); }
      dirty = true;
    }
    prune();
    return { novas, repetidas };
  }

  // Lista para a aba: validade + enriquecimento + ordem + filtros (os mesmos de public/ofertas.js).
  function list({ filtros = null, ordem = 'melhor', deps = {} } = {}) {
    prune();
    const t = clock();
    const itens = ofertas.map((o) => enrichOffer({ ...o, ...estadoOferta(o, t, R) }, deps, { rules }));
    const ord = ordenarOfertas(itens, ordem);
    return filtros ? filtrarOfertas(ord, filtros) : ord;
  }

  const get = (id) => ofertas.find((o) => o.id === id) ?? null;

  // Resultado de uma conferência na loja (Fixar, busca ou extensão): { preco (centavos), disponivel, at }.
  function markChecked(id, { preco = null, disponivel = null, at = clock() } = {}) {
    const i = ofertas.findIndex((o) => o.id === id);
    if (i < 0) return null;
    ofertas[i] = { ...ofertas[i], checked: { at: iso(toMs(at) ?? clock()), preco: Number.isInteger(preco) ? preco : null, disponivel: disponivel == null ? null : !!disponivel } };
    dirty = true;
    return ofertas[i];
  }

  // ✅ / ❌ do usuário. Só muda o rótulo local: o cupom não é testado na loja.
  function feedback(id, voto) {
    if (!['ok', 'no'].includes(voto)) throw new Error('voto deve ser "ok" ou "no"');
    const i = ofertas.findIndex((o) => o.id === id);
    if (i < 0) return null;
    const o = { ...ofertas[i], feedback: { voto, at: iso(clock()) } };
    if (o.cupom) {
      o.cupom = { ...o.cupom, status: voto === 'ok' ? 'confirmed_by_user' : 'expired', verificado: voto === 'ok' };
      o.cupom.rotulo = voto === 'no' ? 'cupom não funcionou para você' : rotuloCupom(o.cupom);
    }
    ofertas[i] = o;
    dirty = true;
    return o;
  }

  async function flush() {
    if (!dirty) return false;
    dirty = false;
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify({ versao: 1, salvoEm: iso(clock()), ofertas }));
      await fs.rename(tmp, file);
      return true;
    } catch (e) { dirty = true; onError(e); return false; }
  }

  function resumo() {
    const t = clock();
    const tech = ofertas.filter((o) => o.tech);
    return {
      total: ofertas.length, tech: tech.length, outros: ofertas.length - tech.length,
      comCupom: tech.filter((o) => o.cupom?.codes?.length).length,
      ativas: tech.filter((o) => estadoOferta(o, t, R).status === 'ativa').length,
    };
  }

  return { load, add, list, get, markChecked, feedback, flush, resumo, size: () => ofertas.length };
}
