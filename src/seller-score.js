// Score de confiança por VENDEDOR, com sinais de risco (Fase 4). Ver docs/score-vendedor.md.
// Funções puras, sem rede e sem dependências. Pesos e limites em data/seller-score.json.
// Linguagem: falamos em "sinais de risco"; o SetupSniper não acusa ninguém.
//
// Formato neutro de entrada do vendedor (todos os campos são opcionais; ausente = null/undefined):
// {
//   store: 'aliexpress' | 'shopee' | 'mercadolivre' | ...,
//   name,                         // só para exibição
//   official: bool,               // loja oficial verificada
//   soldByStore: bool,            // vendido e entregue pela própria loja/plataforma
//   foreign: bool,                // vendedor estrangeiro (CNPJ não se aplica)
//   openedAt: ISO | ageDays: nº,  // data de abertura da loja ou idade em dias
//   sales: nº,                    // vendas do vendedor
//   ratingsCount, ratingAvg,      // nº de avaliações e média 1–5
//   ratingDist: { 1..5: nº },     // distribuição de estrelas (se a página mostrar)
//   percentPositive: 0–100,       // % de avaliações positivas
//   reviews: [{ text, lang, country, date, stars }],  // avaliações visíveis (amostra)
//   nativeReputation: {           // reputação própria da loja
//     level: '5_green'|...|null,  // Mercado Livre (termômetro; null = sem cor, vendedor novo)
//     powerSeller: 'silver'|'gold'|'platinum'|null,  // MercadoLíder
//     badge: 'mall'|'oficial'|'indicado'|'officialStore'|null,  // Shopee / AliExpress
//     percentPositive, ratingsCount, rating  // Amazon (% positivas) / TikTok (nota da loja)
//   },
//   cnpj: { situacao: 'ATIVA'|..., abertura: ISO }   // BrasilAPI, sob demanda
// }

import { readFileSync } from 'node:fs';
import { formatBRL } from './offer.js';

export const DEFAULT_CONFIG = JSON.parse(readFileSync(new URL('../data/seller-score.json', import.meta.url), 'utf8'));

const DAY = 86400000;
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const r1 = v => Math.round(v * 10) / 10;
const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

function toDate(v) {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
const daysBetween = (a, b) => Math.floor((b.getTime() - a.getTime()) / DAY);

// ---------- Matemática (à mão) ----------

// Texto sem acento/pontuação, minúsculo.
export function normalizeText(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Conjunto de n-gramas de caracteres (padrão: 3-gramas), com espaço nas pontas.
export function grams(s, n = 3) {
  const t = ' ' + normalizeText(s) + ' ';
  const g = new Set();
  for (let i = 0; i + n <= t.length; i++) g.add(t.slice(i, i + n));
  return g;
}

export function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i);
}

// Média do Jaccard entre todos os pares de textos; null com menos de 2 textos.
export function meanPairwiseJaccard(texts, n = 3) {
  const sets = texts.filter(t => normalizeText(t)).map(t => grams(t, n));
  if (sets.length < 2) return null;
  let sum = 0, pairs = 0;
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) { sum += jaccard(sets[i], sets[j]); pairs++; }
  return sum / pairs;
}

// Média bayesiana: puxa a média para o prior m quando há poucas avaliações.
export function bayesianAverage(avg, n, m = 3.5, C = 20) {
  if (avg == null || n == null) return null;
  return (C * m + n * avg) / (C + n);
}

// Limite inferior do intervalo de Wilson (0–1).
export function wilsonLowerBound(pos, n, z = 1.96) {
  if (!n || n <= 0 || pos == null) return null;
  const p = pos / n, z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}

// Rajada de avaliações a partir das datas: maior fração num dia (só conta se ≥ 2 no mesmo dia)
// e BST = 1 − dias/janela (Fei 2013). Intensidade = máx. dos dois.
export function burst(dates, janelaDias = 28) {
  const ds = dates.map(toDate).filter(Boolean);
  if (!ds.length) return null;
  const perDay = new Map();
  for (const d of ds) { const k = d.toISOString().slice(0, 10); perDay.set(k, (perDay.get(k) ?? 0) + 1); }
  const days = [...perDay.keys()].sort();
  const spanDays = Math.round((Date.parse(days.at(-1)) - Date.parse(days[0])) / DAY);
  const maxPerDay = Math.max(...perDay.values());
  const maxDayShare = maxPerDay >= 2 ? maxPerDay / ds.length : 0;
  const bst = spanDays < janelaDias ? 1 - spanDays / janelaDias : 0;
  return { n: ds.length, distinctDays: days.length, spanDays, maxPerDay, maxDayShare, bst, intensity: Math.max(maxDayShare, bst) };
}

// Heurística de idioma: true = estrangeiro, false = português, null = texto curto demais.
export function isForeignText(text, cfg = DEFAULT_CONFIG) {
  const c = cfg.risco.idiomaEstrangeiro;
  const words = normalizeText(text).split(' ').filter(Boolean);
  if (words.length < c.minPalavras) return null;
  const sw = new Set(c.stopwordsPt);
  const share = words.filter(w => sw.has(w)).length / words.length;
  return share < c.minStopwordsPt;
}

function reviewIsForeign(r, cfg) {
  if (r.lang) return !/^pt/i.test(r.lang);
  if (r.country) return String(r.country).toUpperCase() !== 'BR';
  return r.text ? isForeignText(r.text, cfg) : null;
}

export function tierOf(score, cfg = DEFAULT_CONFIG) {
  const cls = Object.entries(cfg.classes).sort((a, b) => b[1] - a[1]);
  for (const [name, min] of cls) if (score >= min) return name;
  return cls.at(-1)[0];
}

// ---------- Camada vendedor ----------

function ratingInfo(s) {
  const dist = s.ratingDist && typeof s.ratingDist === 'object' ? s.ratingDist : null;
  if (dist) {
    let n = 0, sum = 0;
    for (let k = 1; k <= 5; k++) { const c = num(dist[k]) ?? 0; n += c; sum += k * c; }
    if (n > 0) return { n, avg: sum / n, dist };
  }
  const n = num(s.ratingsCount), avg = num(s.ratingAvg);
  if (n != null && avg != null) return { n, avg, dist: null };
  const stars = (s.reviews ?? []).map(r => num(r.stars)).filter(v => v != null);
  if (stars.length) return { n: stars.length, avg: stars.reduce((a, b) => a + b, 0) / stars.length, dist: null, fromReviews: true };
  return null;
}

function nativeReputationScore(s, cfg) {
  const nr = s.nativeReputation;
  if (!nr || typeof nr !== 'object') return null;
  const tab = cfg.reputacaoNativa[s.store] ?? {};
  if (s.store === 'mercadolivre') {
    const base = nr.level ? tab[nr.level] : tab.semCor;
    if (base == null) return null;
    return clamp(base + (nr.powerSeller ? tab.bonusMercadoLider ?? 0 : 0));
  }
  if (s.store === 'shopee') return nr.badge && tab[nr.badge] != null ? tab[nr.badge] : tab.semSelo ?? null;
  if (s.store === 'aliexpress') return nr.badge && tab[nr.badge] != null ? tab[nr.badge] : null;
  // Genérico: % positivas da loja (Wilson) ou nota da loja (bayesiana).
  const z = cfg.priors.wilsonZ, n = num(nr.ratingsCount);
  if (num(nr.percentPositive) != null && n) return 100 * wilsonLowerBound(Math.round(nr.percentPositive / 100 * n), n, z);
  if (num(nr.rating) != null && n) {
    const { m, C } = cfg.priors.notaBayesiana;
    return clamp((bayesianAverage(nr.rating, n, m, C) - 1) / 4 * 100);
  }
  return null;
}

// Calcula todos os sinais do vendedor. Valor null = sem dado; 'naoSeAplica' lista os que não entram.
export function sellerSignals(seller = {}, { now = new Date(), cfg = DEFAULT_CONFIG } = {}) {
  const s = seller ?? {};
  now = toDate(now) ?? new Date();
  const store = s.store ?? null;
  const official = !!(s.official || s.soldByStore);
  const naoSeAplica = new Set(cfg.naoSeAplica[store] ?? []);
  if (s.foreign) naoSeAplica.add('cnpj');
  // Vendedor = plataforma/loja oficial: sinais de loja nova não se aplicam.
  if (official) for (const k of ['lojaNova', 'poucasVendas', 'cnpjRecente']) naoSeAplica.add(k);

  const opened = toDate(s.openedAt);
  const ageDays = num(s.ageDays) ?? (opened ? Math.max(0, daysBetween(opened, now)) : null);
  const sales = num(s.sales);
  const rating = ratingInfo(s);
  const pr = cfg.priors;

  // Sinais positivos (0–100)
  const positive = {};
  positive.nota = rating ? clamp((bayesianAverage(rating.avg, rating.n, pr.notaBayesiana.m, pr.notaBayesiana.C) - 1) / 4 * 100) : null;
  const pct = num(s.percentPositive) ?? num(s.nativeReputation?.percentPositive);
  const nPos = rating?.n ?? num(s.ratingsCount) ?? num(s.nativeReputation?.ratingsCount);
  positive.positivas = pct != null && nPos ? 100 * wilsonLowerBound(Math.round(pct / 100 * nPos), nPos, pr.wilsonZ) : null;
  positive.vendas = sales != null ? clamp(Math.log10(Math.max(1, sales)) / Math.log10(pr.vendasParaCem) * 100) : null;
  positive.idade = ageDays != null ? clamp(100 * Math.sqrt(ageDays / pr.diasIdadeParaCem)) : null;
  positive.reputacao = nativeReputationScore(s, cfg);

  const cnpjAbertura = toDate(s.cnpj?.abertura);
  const cnpjDias = cnpjAbertura ? Math.max(0, daysBetween(cnpjAbertura, now)) : null;
  const cnpjSit = s.cnpj?.situacao ? String(s.cnpj.situacao).toUpperCase() : null;
  const cnpjNaoAtivo = cnpjSit != null && cnpjSit !== 'ATIVA';
  if (cnpjSit == null) positive.cnpj = null;
  else if (cnpjNaoAtivo) positive.cnpj = 0;
  else positive.cnpj = cnpjDias == null ? 40 : cnpjDias >= 730 ? 100 : 40 + 60 * cnpjDias / 730;

  // Sinais de risco: intensidade 0–1 (null = sem dado)
  const rc = cfg.risco;
  const reviews = Array.isArray(s.reviews) ? s.reviews : [];
  const risk = {};
  risk.lojaNova = ageDays == null ? null : ageDays < rc.lojaNova.dias ? (rc.lojaNova.dias - ageDays) / rc.lojaNova.dias : 0;
  risk.poucasVendas = sales == null ? null : sales < rc.poucasVendas.vendas ? (rc.poucasVendas.vendas - sales) / rc.poucasVendas.vendas : 0;

  // Rajada: só com amostra que cubra boa parte da base (loja grande recebe várias por dia, e é normal).
  const dated = reviews.filter(r => toDate(r.date));
  const bursts = dated.length >= rc.rajada.minAvaliacoes ? burst(dated.map(r => r.date), rc.rajada.janelaDias) : null;
  const base = rating && !rating.fromReviews ? rating.n : num(s.ratingsCount);
  if (!bursts) risk.rajada = null;
  else if (base && dated.length / base < rc.rajada.minFracaoDaBase) risk.rajada = 0;
  else risk.rajada = bursts.intensity;

  // Notas só extremas com pouca base (a distribuição em J normal não é penalizada).
  const dist = rating?.dist ?? (rating?.avg === 5 ? { 5: rating.n } : null)
    ?? (reviews.some(r => num(r.stars) != null) ? reviews.reduce((d, r) => { const k = num(r.stars); if (k) d[k] = (d[k] ?? 0) + 1; return d; }, {}) : null);
  let share5 = null, nDist = 0;
  if (dist) {
    for (let k = 1; k <= 5; k++) nDist += num(dist[k]) ?? 0;
    const low = (num(dist[1]) ?? 0) + (num(dist[2]) ?? 0) + (num(dist[3]) ?? 0);
    share5 = nDist ? (num(dist[5]) ?? 0) / nDist : null;
    risk.notasExtremas = !nDist ? null : low > 0 ? 0 : share5 * (1 - Math.min(nDist, rc.notasExtremas.baseCheia) / rc.notasExtremas.baseCheia);
  } else risk.notasExtremas = null;

  const langs = reviews.map(r => reviewIsForeign(r, cfg)).filter(v => v != null);
  const foreign = langs.filter(Boolean).length;
  risk.idiomaEstrangeiro = langs.length >= rc.idiomaEstrangeiro.minAvaliacoes ? foreign / langs.length : null;

  const texts = reviews.map(r => r.text).filter(t => normalizeText(t));
  const sim = texts.length >= rc.similaridade.minAvaliacoes ? meanPairwiseJaccard(texts, rc.similaridade.ngrama) : null;
  risk.similaridade = sim == null ? null : clamp((sim - rc.similaridade.limiar) / rc.similaridade.faixa * 100) / 100;

  risk.cnpjRecente = cnpjDias == null || cnpjNaoAtivo ? null : cnpjDias < rc.cnpjRecente.dias ? (rc.cnpjRecente.dias - cnpjDias) / rc.cnpjRecente.dias : 0;

  for (const k of naoSeAplica) { if (k in positive) delete positive[k]; if (k in risk) delete risk[k]; }

  const level = s.nativeReputation?.level ?? null;
  return {
    store, official, naoSeAplica: [...naoSeAplica],
    ageDays, sales, rating: rating ? { n: rating.n, avg: r1(rating.avg) } : null,
    share5, nDist,
    reviews: { total: reviews.length, comData: dated.length, comTexto: texts.length, idiomaConhecido: langs.length, estrangeiras: foreign, burst: bursts, similaridade: sim },
    cnpj: cnpjSit == null ? null : { situacao: cnpjSit, dias: cnpjDias },
    positive, risk,
    bloqueio: {
      cnpjNaoAtivo: cfg.travas.bloqueio.cnpjNaoAtivo && cnpjNaoAtivo,
      termometro: !!level && (cfg.travas.bloqueio.mlTermometro ?? []).includes(level),
      level,
    },
  };
}

const TERMOMETRO = { '1_red': 'vermelho', '2_orange': 'laranja' };

function riskReason(key, sig) {
  const rv = sig.reviews;
  switch (key) {
    case 'lojaNova': return `Loja aberta há ${plural(sig.ageDays, 'dia', 'dias')}`;
    case 'poucasVendas': return sig.sales === 0 ? 'Nenhuma venda registrada' : `Só ${plural(sig.sales, 'venda', 'vendas')}`;
    case 'rajada': {
      const b = rv.burst;
      return `${b.n} avaliações publicadas em ${plural(b.distinctDays, 'dia', 'dias')}`;
    }
    case 'notasExtremas': return `Só notas 5★, com apenas ${plural(sig.nDist, 'avaliação', 'avaliações')}`;
    case 'idiomaEstrangeiro': return `${rv.estrangeiras} de ${rv.idiomaConhecido} avaliações em idioma estrangeiro`;
    case 'similaridade': return 'Avaliações com textos muito parecidos entre si';
    case 'cnpjRecente': return `CNPJ aberto há ${plural(sig.cnpj.dias, 'dia', 'dias')}`;
    default: return key;
  }
}

const NOMES = { nota: 'nota do vendedor', positivas: '% de avaliações positivas', vendas: 'nº de vendas', idade: 'idade da loja', reputacao: 'reputação na loja', cnpj: 'CNPJ', lojaNova: 'idade da loja', poucasVendas: 'nº de vendas', rajada: 'datas das avaliações', notasExtremas: 'distribuição de notas', idiomaEstrangeiro: 'idioma das avaliações', similaridade: 'textos das avaliações', cnpjRecente: 'data do CNPJ' };

// Score do vendedor: V = clamp(Vbase − R), com confiança separada da nota.
export function sellerScore(sellerData, cfg = DEFAULT_CONFIG, { now = new Date() } = {}) {
  cfg ??= DEFAULT_CONFIG;
  const sig = sellerData && sellerData.positive && sellerData.risk ? sellerData : sellerSignals(sellerData, { now, cfg });
  const ausente = cfg.priors.valorAusente;

  // Vbase: sinal ausente entra como valorAusente (abaixo do neutro); não redistribui o peso.
  let sum = 0, wsum = 0, wPresent = 0;
  const missing = [];
  for (const [k, w] of Object.entries(cfg.pesosVendedor)) {
    if (!(k in sig.positive)) continue;           // não se aplica
    const v = sig.positive[k];
    wsum += w;
    if (v == null) { sum += w * ausente; missing.push(k); } else { sum += w * v; wPresent += w; }
  }
  const vbase = wsum ? sum / wsum : ausente;

  // R: soma dos pontos de risco
  let R = 0;
  const riskPoints = {};
  const reasons = [];
  for (const [k, c] of Object.entries(cfg.risco)) {
    if (!(k in sig.risk)) continue;
    const it = sig.risk[k];
    if (it == null) { missing.push(k); continue; }
    const max = c.pontosPorLoja?.[sig.store] ?? c.pontos;
    const pts = it * max;
    riskPoints[k] = r1(pts);
    R += pts;
    if (pts >= 0.5) reasons.push(riskReason(k, sig));
  }
  R = clamp(R);
  if (sig.bloqueio.cnpjNaoAtivo) reasons.push(`CNPJ com situação ${sig.cnpj.situacao}`);
  if (sig.bloqueio.termometro) reasons.push(`Termômetro do Mercado Livre ${TERMOMETRO[sig.bloqueio.level] ?? sig.bloqueio.level}`);

  let V = clamp(vbase - R);
  if (sig.official) { V = Math.max(V, cfg.oficialOuPlataforma.vendedorMinimo); reasons.unshift('Loja oficial ou vendido pela própria loja'); }

  // Confiança: cobertura dos sinais positivos + volume de avaliações
  const cc = cfg.confianca;
  const cobertura = wsum ? wPresent / wsum : 0;
  const nAval = sig.rating?.n ?? 0;
  const volume = Math.min(1, Math.log10(1 + nAval) / Math.log10(cc.avaliacoesParaCem));
  let confidence = 100 * (cc.pesoCobertura * cobertura + cc.pesoVolume * volume);
  if (sig.official) confidence = Math.max(confidence, cfg.oficialOuPlataforma.confiancaMinima ?? 0);
  confidence = Math.round(clamp(confidence));
  if (confidence < cc.alta) reasons.push(confidence < cc.media ? 'Poucos dados do vendedor: confiança baixa' : 'Poucos dados do vendedor');

  // Pontos positivos, se não houver sinais de risco relevantes
  if (R < 5 && !sig.official) {
    if (sig.sales >= 1000) reasons.push(`${sig.sales.toLocaleString('pt-BR')} vendas`);
    if (sig.ageDays >= 365) reasons.push(`Loja aberta há ${Math.floor(sig.ageDays / 365)} ano(s)`);
  }

  const capped = applyCaps(V, { R, confidence, bloqueio: sig.bloqueio }, cfg);
  const score = Math.round(capped.score);
  return {
    score, confidence, tier: tierOf(score, cfg), risk: r1(R), reasons,
    missing: [...new Set(missing.map(k => NOMES[k] ?? k))],
    travas: capped.travas,
    parts: { vbase: r1(vbase), riskPoints, cobertura: r1(cobertura * 100) / 100, volume: r1(volume * 100) / 100 },
    signals: sig,
  };
}

// Travas T1–T4: o vendedor de alto risco limita a nota, não importa a plataforma.
function applyCaps(score, { R, confidence, bloqueio }, cfg) {
  const t = cfg.travas, travas = [];
  let cap = 100;
  if (R >= t.riscoAlto.R) { cap = Math.min(cap, t.riscoAlto.notaMaxima); travas.push('T1'); }
  else if (R >= t.riscoModerado.R) { cap = Math.min(cap, t.riscoModerado.notaMaxima); travas.push('T2'); }
  if (bloqueio?.cnpjNaoAtivo || bloqueio?.termometro) { cap = Math.min(cap, t.bloqueio.notaMaxima); travas.push('T3'); }
  if (confidence < t.confiancaBaixa.confianca) { cap = Math.min(cap, t.confiancaBaixa.notaMaxima); travas.push('T4'); }
  return { score: Math.min(score, cap), travas };
}

// ---------- Camada oferta ----------

const GENERICAS = new Set(['produto', 'item', 'oferta', 'promocao', 'novo', 'original', 'top', 'barato', 'kit', 'peca', 'pecas', 'de', 'para', 'com', 'o', 'a', 'e']);

// Risco da oferta: O = base (+ fulfillment) − penalidades. ctx: { cfg, now, median (centavos), price, listing: { publishedAt, photos }, fulfillment }
export function offerRisk(offer = {}, ctx = {}) {
  const cfg = ctx.cfg ?? DEFAULT_CONFIG;
  const c = cfg.oferta;
  const now = toDate(ctx.now) ?? new Date();
  const reasons = [], missing = [];
  let score = c.base, risk = 0;

  const fulfillment = ctx.fulfillment ?? offer?.fulfillment ?? null;
  if (fulfillment) { score += c.bonusFulfillment; reasons.push('Entrega pela plataforma (fulfillment)'); }

  // Preço muito abaixo da mediana: usa offer.suspeito (extract.js) ou a mediana do contexto.
  const p = offer?.price;
  const price = num(ctx.price) ?? (p ? p.pix ?? p.card ?? null : null);
  const median = num(ctx.median);
  const abaixo = median && price ? price < median * c.precoImplausivel.fracaoDaMediana : false;
  if (offer?.suspeito || abaixo) {
    score -= c.precoImplausivel.penalidade; risk += c.precoImplausivel.penalidade;
    reasons.push(median && price ? `Preço ${formatBRL(price)} muito abaixo da mediana (${formatBRL(median)})` : 'Preço muito abaixo das outras lojas');
  }

  // Título genérico: poucas palavras úteis e nenhum modelo/número.
  const title = offer?.title ? normalizeText(offer.title) : '';
  if (!title) missing.push('título');
  else {
    const words = title.split(' ').filter(w => w.length > 1 && !GENERICAS.has(w));
    if (words.length < c.tituloGenerico.minPalavras && !/\d/.test(title)) {
      score -= c.tituloGenerico.penalidade; risk += c.tituloGenerico.penalidade;
      reasons.push('Título do anúncio genérico');
    }
  }

  const listing = ctx.listing ?? offer?.listing ?? {};
  const pub = toDate(listing.publishedAt);
  if (pub) {
    const dias = Math.max(0, daysBetween(pub, now));
    if (dias < c.anuncioRecente.dias) {
      score -= c.anuncioRecente.penalidade; risk += c.anuncioRecente.penalidade;
      reasons.push(`Anúncio publicado há ${plural(dias, 'dia', 'dias')}`);
    }
  }
  const photos = num(listing.photos);
  if (photos != null && photos < c.poucasFotos.minFotos) {
    score -= c.poucasFotos.penalidade; risk += c.poucasFotos.penalidade;
    reasons.push(photos === 0 ? 'Anúncio sem fotos' : `Só ${plural(photos, 'foto', 'fotos')} no anúncio`);
  }

  return { score: Math.round(clamp(score)), risk, suspeito: !!(offer?.suspeito || abaixo), reasons, missing };
}

// ---------- Nota final (3 camadas + travas) ----------

const isResult = o => o && typeof o.score === 'number' && Array.isArray(o.reasons);

// input: { platformScore (0–100, de computeReliability), seller (dados neutros ou resultado de sellerScore),
//          offer (oferta ou resultado de offerRisk) }. opts: { now, ...ctx de offerRisk }
export function finalScore({ platformScore = null, seller = null, offer = null } = {}, cfg = DEFAULT_CONFIG, opts = {}) {
  cfg ??= DEFAULT_CONFIG;
  const now = opts.now ?? new Date();
  const s = isResult(seller) && 'confidence' in seller ? seller : sellerScore(seller ?? {}, cfg, { now });
  const o = isResult(offer) && 'suspeito' in offer ? offer : offerRisk(offer ?? {}, { ...opts, cfg, now });
  const P = num(platformScore);
  const w = cfg.camadas;

  // Vendedor entra sem as travas (V puro); as travas valem sobre a nota final.
  const V = s.signals?.official ? Math.max(clamp(s.parts.vbase - s.risk), cfg.oficialOuPlataforma.vendedorMinimo) : clamp((s.parts?.vbase ?? s.score) - s.risk);
  const bruto = w.plataforma * (P ?? cfg.priors.valorAusente) + w.vendedor * V + w.oferta * o.score;

  const capped = applyCaps(bruto, { R: s.risk, confidence: s.confidence, bloqueio: s.signals?.bloqueio }, cfg);
  const score = Math.round(capped.score);
  const reasons = [...s.reasons, ...o.reasons];
  if (P == null) reasons.push('Sem nota da plataforma');
  if (capped.travas.includes('T1') || capped.travas.includes('T2') || capped.travas.includes('T3')) {
    reasons.push('Sinais de risco do vendedor limitam a nota, mesmo com a plataforma bem avaliada');
  }
  return {
    score: Math.min(score, 100), tier: tierOf(score, cfg), confidence: s.confidence, reasons,
    travas: capped.travas, bruto: r1(bruto),
    layers: { platform: P, seller: Math.round(V), offer: o.score },
    missing: [...s.missing, ...o.missing, ...(P == null ? ['nota da plataforma'] : [])],
  };
}
