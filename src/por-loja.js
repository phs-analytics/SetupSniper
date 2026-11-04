// Modo "Por loja" da busca (Etapa 3b): para cada loja, vários produtos relevantes, só de vendedores bem avaliados.
//
//   - Relevância: nota 0–100 (todos os termos, modelo exato, variante certa; src/extract.js relevanceScore)
//     sobre o que cleanResults já filtrou. Abaixo de minRelevance: oculto, com o motivo.
//   - Filtro "só vendedor bom" (ligado por padrão): nota mínima minScore (70). Abaixo: oculto, com o motivo
//     ("nota 48: cautela — loja aberta há 18 dias"). Sem dados suficientes do vendedor e sem sinal de risco:
//     grupo próprio "Sem dados do vendedor" (não some calado).
//   - O mesmo produto de vendedores diferentes da loja vira um card (productSignature/groupOffers de compare.js).
//   - Ordem: "Melhor escolha" (padrão), menor preço ou maior nota. Em todas, alto risco e suspeitos nunca
//     ficam na frente de ofertas confiáveis (rankGroup de ranking.js vem antes de tudo).
//
// Lógica pura, sem APIs do Node: pode ser servida ao navegador em /lib/por-loja.js como compare.js.
// As regras vêm de data/search-rules.json (o servidor lê e passa em `rules`).
import { groupOffers } from './compare.js';
import { rankGroup, adjustedPrice, RISK_LIMIT } from './ranking.js';
import { relevanceScore } from './extract.js';
import { referencePrice } from './offer.js';

// Espelho de data/search-rules.json (o teste confere que batem).
export const DEFAULT_RULES = Object.freeze({ minScore: 70, resultsPerStore: 10, maxPages: 3, minRelevance: 80, minConfidence: 40, filterOn: true, sort: 'melhor' });
export const SORTS = Object.freeze(['melhor', 'preco', 'nota']);

const int = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };

// Junta as regras do JSON com a preferência do usuário (data/settings.json → porLoja) e as opções da chamada.
// Aceita os nomes da preferência em português (notaMinima, soVendedorBom, produtosPorLoja, ordem).
export function normalizeRules(...layers) {
  const r = { ...DEFAULT_RULES };
  for (const l of layers) {
    if (!l || typeof l !== 'object') continue;
    const v = {
      minScore: l.minScore ?? l.notaMinima, resultsPerStore: l.resultsPerStore ?? l.produtosPorLoja, maxPages: l.maxPages ?? l.paginasMaximas,
      minRelevance: l.minRelevance, minConfidence: l.minConfidence, filterOn: l.filterOn ?? l.soVendedorBom, sort: l.sort ?? l.ordem,
    };
    if (v.minScore != null) r.minScore = int(v.minScore, 0, 100, r.minScore);
    if (v.resultsPerStore != null) r.resultsPerStore = int(v.resultsPerStore, 1, 60, r.resultsPerStore);
    if (v.maxPages != null) r.maxPages = int(v.maxPages, 1, 10, r.maxPages);
    if (v.minRelevance != null) r.minRelevance = int(v.minRelevance, 0, 100, r.minRelevance);
    if (v.minConfidence != null) r.minConfidence = int(v.minConfidence, 0, 100, r.minConfidence);
    if (v.filterOn != null) r.filterOn = v.filterOn !== false && v.filterOn !== 'false' && v.filterOn !== '0';
    if (v.sort != null && SORTS.includes(v.sort)) r.sort = v.sort;
  }
  return r;
}

// Mesmas palavras do carimbo da interface (public/app.js ring()).
export const palavraNota = (s) => (s >= 85 ? 'confiável' : s >= 70 ? 'bom' : s >= 55 ? 'regular' : s >= RISK_LIMIT ? 'cautela' : 'alto risco');

const RISK_TRAVAS = ['T1', 'T2', 'T3'];   // risco alto, risco moderado, bloqueio (CNPJ/termômetro): travas de RISCO
// Motivos que não explicam uma nota baixa: avisos gerais e pontos POSITIVOS de src/seller-score.js.
const SEM_MOTIVO = /^(Sem nota da plataforma|Loja oficial ou vendido pela própria loja|Sinais de risco do vendedor limitam|Entrega pela plataforma)|^[\d.]+ vendas$|^Loja aberta há \d+ ano\(s\)$/;
const minuscula = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// "nota 48: cautela — loja aberta há 18 dias"
export function motivoNota(trust, minScore = DEFAULT_RULES.minScore) {
  const principal = (trust?.reasons ?? []).find(r => !SEM_MOTIVO.test(r));
  return `nota ${trust.score}: ${palavraNota(trust.score)} — ${principal ? minuscula(principal) : `abaixo da nota mínima ${minScore}`}`;
}

// Situação do vendedor de uma oferta frente ao filtro:
//   { status: 'aprovado' | 'oculto' | 'semDados', tipo?: 'nota' | 'suspeito', motivo }
// Usa offer.trust (finalScore de src/seller-score.js) e offer.suspeito (flagOutliers de src/extract.js).
export function avaliarVendedor(offer, { minScore = DEFAULT_RULES.minScore, minConfidence = DEFAULT_RULES.minConfidence } = {}) {
  const t = offer?.trust;
  const temNota = t && typeof t.score === 'number';
  if (offer?.suspeito) return { status: 'oculto', tipo: 'suspeito', motivo: `preço suspeito: muito abaixo das outras ofertas${temNota ? ` (nota ${t.score}, estimativa)` : ''}` };
  if (!temNota) return { status: 'semDados', motivo: 'sem nota do vendedor' };
  const risco = (t.travas ?? []).some(x => RISK_TRAVAS.includes(x)) || t.score < RISK_LIMIT;
  if (!risco && t.confidence != null && t.confidence < minConfidence) {
    return { status: 'semDados', motivo: `nota ${t.score} (estimativa): poucos dados do vendedor` };
  }
  if (t.score >= minScore) return { status: 'aprovado', motivo: null };
  return { status: 'oculto', tipo: 'nota', motivo: motivoNota(t, minScore) };
}

// Para Fixados, alertas e Ofertas: o vendedor passa no filtro "só vendedor bom"?
// Sem dados do vendedor ou preço suspeito = não aprovado.
export function vendedorAprovado(offer, minScore = DEFAULT_RULES.minScore) {
  return avaliarVendedor(offer, { minScore }).status === 'aprovado';
}

// Alerta de Fixado: com "alertas só de vendedor bom" ligado (padrão), segura o alerta de vendedor abaixo da nota
// mínima ou sem dados, e diz o motivo (vai para o log). Desligado (alertasSoVendedorBom === false), não filtra.
export function motivoSemAlerta(offer, porLojaPrefs = {}, minScore = DEFAULT_RULES.minScore) {
  if (porLojaPrefs?.alertasSoVendedorBom === false || !offer) return null;
  const a = avaliarVendedor(offer, { minScore });
  return a.status === 'aprovado' ? null : (a.motivo ?? 'vendedor abaixo da nota mínima');
}

const defaultRef = (o) => o?.totals?.pix?.total ?? referencePrice(o);
const defaultScore = (o) => o?.trust?.score ?? null;

// Comparador de ofertas para cada ordem. O grupo de risco (rankGroup) vem SEMPRE antes do critério escolhido.
export function compararPor(sort, { refOf = defaultRef, scoreOf = defaultScore } = {}) {
  const key = (o) => ({ price: refOf(o), score: scoreOf(o), suspeito: !!o.suspeito, available: o.available });
  const ajust = (k) => adjustedPrice(k.price ?? Infinity, k.score);
  return (a, b) => {
    const ka = key(a), kb = key(b);
    const g = rankGroup(ka) - rankGroup(kb);
    if (g) return g;
    const pa = ka.price ?? Infinity, pb = kb.price ?? Infinity;
    if (sort === 'preco') return pa - pb || ajust(ka) - ajust(kb);
    if (sort === 'nota') return (kb.score ?? -1) - (ka.score ?? -1) || pa - pb;
    return ajust(ka) - ajust(kb) || pa - pb;
  };
}

// Agrupa o mesmo produto (vendedores diferentes) e ordena cards e vendedores na ordem pedida.
// Retorna [{ titulo, melhor, outros, min, max, vendedores, relevancia }].
export function agruparNaLoja(offers, { sort = 'melhor', refOf = defaultRef, scoreOf = defaultScore } = {}) {
  const cmp = compararPor(sort, { refOf, scoreOf });
  return groupOffers(offers, { refOf, scoreOf })
    .map((g) => {
      const ofertas = [...g.offers].sort(cmp);
      return { titulo: g.title, melhor: ofertas[0], outros: ofertas.slice(1), min: g.min, max: g.max, vendedores: ofertas.length,
        relevancia: Math.max(...ofertas.map(o => o.relevancia ?? 0)) };
    })
    .sort((a, b) => cmp(a.melhor, b.melhor));
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
// "8 produtos · 3 ocultos pela nota · 2 sem dados do vendedor"
export function resumoLoja(c) {
  const partes = [plural(c.produtos, 'produto', 'produtos')];
  if (c.ocultosNota) partes.push(`${c.ocultosNota} ${c.ocultosNota === 1 ? 'oculto' : 'ocultos'} pela nota`);
  if (c.semDados) partes.push(`${c.semDados} sem dados do vendedor`);
  if (c.ocultosRelevancia) partes.push(`${c.ocultosRelevancia} de outro modelo ou variante`);
  return partes.join(' · ');
}

// Uma loja: offers já limpas (cleanResults) e com trust. Retorna a visão da loja.
export function porLojaUma(storeId, offers, query, opts = {}) {
  const r = normalizeRules(opts.rules, opts);
  const refOf = opts.refOf ?? defaultRef, scoreOf = opts.scoreOf ?? defaultScore;
  const visiveis = [], semDados = [], ocultos = [];
  for (const o of offers) {
    if (!o?.title) continue;
    const rel = relevanceScore(o.title, query);
    const oferta = { ...o, relevancia: rel.score };
    if (rel.score < r.minRelevance) { ocultos.push({ oferta, motivo: `relevância ${rel.score}: ${rel.motivo}`, tipo: 'relevancia' }); continue; }
    if (!r.filterOn) { visiveis.push(oferta); continue; }
    const av = avaliarVendedor(oferta, r);
    if (av.status === 'aprovado') visiveis.push(oferta);
    else if (av.status === 'semDados') semDados.push({ ...oferta, motivoSemDados: av.motivo });
    else ocultos.push({ oferta, motivo: av.motivo, tipo: av.tipo });
  }
  const todos = agruparNaLoja(visiveis, { sort: r.sort, refOf, scoreOf });
  const grupos = todos.slice(0, r.resultsPerStore);
  const semDadosGrupos = agruparNaLoja(semDados, { sort: r.sort, refOf, scoreOf }).slice(0, r.resultsPerStore);
  // ocultos: pela nota primeiro (da maior para a menor), depois os de outro modelo/variante
  const peso = (x) => (x.tipo === 'relevancia' ? 1 : 0);
  ocultos.sort((a, b) => peso(a) - peso(b) || (scoreOf(b.oferta) ?? -1) - (scoreOf(a.oferta) ?? -1));
  const contagem = {
    produtos: grupos.length,
    ofertas: grupos.reduce((n, g) => n + 1 + g.outros.length, 0),
    ocultos: ocultos.length,
    ocultosNota: ocultos.filter(x => x.tipo !== 'relevancia').length,
    ocultosRelevancia: ocultos.filter(x => x.tipo === 'relevancia').length,
    semDados: semDados.length,
    alemDoLimite: Math.max(0, todos.length - grupos.length),
    total: offers.length,
  };
  return { storeId, grupos, ocultos, semDados: semDadosGrupos, contagem, resumo: resumoLoja(contagem),
    regras: { minScore: r.minScore, filterOn: r.filterOn, sort: r.sort, resultsPerStore: r.resultsPerStore } };
}

// Todas as lojas. offers: ofertas de várias lojas (storeId ou store). Lojas na ordem em que aparecem,
// ou na ordem de opts.storeOrder (ids). opts: { rules, minScore, sort, filterOn, resultsPerStore, refOf, scoreOf, storeOrder }.
export function porLoja(offers, query, opts = {}) {
  const porId = new Map();
  for (const id of opts.storeOrder ?? []) porId.set(id, []);
  for (const o of offers ?? []) {
    const id = o?.storeId ?? o?.store;
    if (!id) continue;
    if (!porId.has(id)) porId.set(id, []);
    porId.get(id).push(o);
  }
  return [...porId].map(([id, list]) => porLojaUma(id, list, query, opts));
}

// Quantos produtos com vendedor bom uma lista já tem (para decidir se vale buscar mais uma página).
export function produtosBons(offers, query, opts = {}) {
  return porLojaUma('x', offers, query, { ...opts, resultsPerStore: 60 }).contagem.produtos;
}

// ---------- mais páginas quando faltar ----------
// Chama search(storeId, q, { page }) página a página até ter `needed` produtos bons (contar(items) ≥ needed)
// ou chegar a maxPages. Para também quando a loja não tem mais páginas, em erro, em bloqueio e na pausa após
// bloqueio (Etapa 1: searchStore devolve `pausa` ou lança erro com e.blocked/e.pausa): nunca insiste.
//   search: injetável (o servidor passa searchStore com browserFallback; os testes, uma função falsa).
//   contar(items): quantos produtos bons há nos itens acumulados (padrão: nº de itens).
// Se a PRIMEIRA página der erro, o erro sobe (o servidor já trata "bloqueado"/"erro" por loja).
// Retorna { items, pages: [nºs lidos], page (última), hasMore, parou, error?, pausa?, trace, searchUrl, source }.
//   parou: 'completo' | 'limite' | 'fim' | 'erro' | 'bloqueio' | 'pausa'
export async function buscarAteCompletar(storeId, q, { search, maxPages = DEFAULT_RULES.maxPages, needed = null, contar = (items) => items.length, startPage = 1, opts = {} } = {}) {
  if (typeof search !== 'function') throw new Error('buscarAteCompletar: falta a função search');
  const items = [], pages = [], trace = [];
  let parou = 'limite', hasMore = false, searchUrl = null, source = null, error = null, pausa = null;
  for (let page = startPage; page < startPage + maxPages; page++) {
    let r;
    try { r = await search(storeId, q, { ...opts, page }); }
    catch (e) {
      if (!pages.length) throw e;
      error = e.message; pausa = e.pausa ?? null;
      parou = e.pausa ? 'pausa' : e.blocked ? 'bloqueio' : 'erro';
      hasMore = false;
      break;
    }
    pages.push(page);
    searchUrl ??= r?.searchUrl ?? null;
    source ??= r?.source ?? null;
    if (Array.isArray(r?.trace)) trace.push(...r.trace.map(t => ({ ...t, page })));
    const got = Array.isArray(r?.items) ? r.items : [];
    items.push(...got);
    hasMore = !!r?.hasMore && got.length > 0;
    if (needed != null && contar(items) >= needed) { parou = 'completo'; break; }
    if (r?.pausa) { pausa = r.pausa; parou = 'pausa'; hasMore = false; break; }
    if (r?.blocked) { parou = 'bloqueio'; hasMore = false; break; }
    if (!hasMore) { parou = 'fim'; break; }
  }
  return { items, pages, page: pages.at(-1) ?? startPage, hasMore, parou, trace, searchUrl, source,
    ...(error ? { error } : {}), ...(pausa ? { pausa } : {}) };
}
