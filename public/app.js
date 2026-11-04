import { groupOffers, sellerLabel } from '/lib/compare.js';
import { sparklineSvg, historyBadges } from '/historico.js';
import { porLoja } from '/lib/por-loja.js';
import { renderPorLoja } from '/por-loja.js';
import { couponCard } from '/cupons-oficiais.js';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
// Dinheiro chega do servidor em CENTAVOS inteiros; só é formatado aqui.
const brl = (c) => c == null || !Number.isFinite(c) ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const refKind = () => (S?.settings?.priceReference === 'card' ? 'card' : 'pix');
// Preço de referência de uma oferta: o TOTAL FINAL (cupom, frete e impostos) no Pix por padrão;
// sem totais, o preço da página (Pix ou, sem Pix, o crédito)
function refOf(o) {
  const t = o?.totals?.[refKind()]?.total; if (t != null) return t;
  const p = o?.price; if (!p || typeof p !== 'object') return null;
  const parcelado = p.installments ? p.installments.n * p.installments.value : null;
  return refKind() === 'card' ? (p.card ?? p.pix ?? parcelado) : (p.pix ?? p.card ?? parcelado);
}
// "no Pix R$ 1.849,90 · cartão R$ 2.176,46 · 10x R$ 217,65 sem juros"
function priceDetail(o) {
  const p = o?.price; if (!p) return '';
  const parts = [];
  const same = p.pix != null && p.pix === p.card;
  if (same) parts.push('mesmo preço no Pix e no cartão');
  else {
    if (refKind() === 'pix' && p.card != null && p.pix != null) parts.push(`cartão ${brl(p.card)}`);
    if (refKind() === 'card' && p.pix != null && p.card != null) parts.push(`Pix ${brl(p.pix)}`);
    if (p.pix == null && p.card != null) parts.push('Pix não informado');
  }
  if (p.installments) parts.push(`${p.installments.n}x ${brl(p.installments.value)}${p.installments.interestFree ? ' sem juros' : ''}`);
  return parts.join(' · ');
}
// Blocos "Total Pix" e "Total Crédito" lado a lado, com o cálculo detalhado (Fase 3)
function totalsHtml(o, { compact = false } = {}) {
  const t = o?.totals; if (!t || (!t.pix && !t.card)) return '';
  const linha = (rot, a, b, cls = '') => `<tr class="${cls}"><td>${rot}</td><td>${a}</td><td>${b}</td></tr>`;
  const v = (x) => (x == null ? '—' : brl(x));
  const neg = (x) => (x ? '− ' + brl(x) : '—');
  const add = (x, nulo = '—') => (x == null ? nulo : x === 0 ? 'R$ 0,00' : '+ ' + brl(x));
  const P = t.pix ?? {}, C = t.card ?? {};
  const best = t.cheaper;
  const box = (k, rot, x, extra = '') => x?.total == null ? '' :
    `<div class="tot ${best === k ? 'best' : ''}" title="${esc([...(x.notes ?? [])].join(' · ') || 'Total com cupom, frete e impostos')}"><span>${rot}${x.complete ? '' : ' <i class="est">estimativa</i>'}</span><b>${brl(x.total)}</b>${extra}</div>`;
  const parc = C.installments ? `<small>${C.installments.n}x ${brl(C.installments.value)}${C.installments.interestFree ? ' sem juros' : ' com juros'}</small>` : '';
  const cupons = (P.coupons?.length ? P.coupons : C.coupons ?? []).map(c => c.code).join(', ');
  const uf = S?.settings?.cep ? '' : ' (informe o CEP)';
  const tabela = `<table class="calc">
    <tr><th></th><th>Pix</th><th>Crédito</th></tr>
    ${linha('Produto', v(P.product), v(C.product))}
    ${(P.coupons?.length || C.coupons?.length) ? linha(`Cupom ${esc(cupons)}`, neg(P.couponDiscount), neg(C.couponDiscount)) : ''}
    ${linha('Frete', add(P.shipping, 'não informado'), add(C.shipping, 'não informado'))}
    ${P.taxStatus === 'ok' || C.taxStatus === 'ok' ? linha('Imposto de importação', add(P.importTax), add(C.importTax)) : ''}
    ${P.taxStatus === 'ok' || C.taxStatus === 'ok' ? linha(`ICMS${P.icmsRate ? ' ' + Math.round(P.icmsRate * 100) + '%' : uf}`, add(P.icms), add(C.icms)) : ''}
    ${linha('<b>Total</b>', '<b>' + v(P.total) + '</b>', '<b>' + v(C.total) + '</b>', 'sum')}
    ${C.totalWithInterest && C.totalWithInterest !== C.total ? linha('Parcelado com juros', '', v(C.totalWithInterest)) : ''}
  </table>`;
  const fontes = [...(P.coupons ?? []), ...(C.coupons ?? [])].filter((c, i, a) => a.findIndex(x => x.code === c.code) === i)
    .map(c => `<div class="cfonte">🎟️ <b>${esc(c.code)}</b>: ${c.status === 'confirmed_by_user' ? 'funcionou para você' : `divulgado por ${esc(c.sourceName ?? 'fonte desconhecida')}${c.seenAt ? ' em ' + new Date(c.seenAt).toLocaleString('pt-BR') : ''}, não verificado`}${c.inferred ? ' · regra inferida pelo preço anunciado' : ''}${(c.notes ?? []).length ? ' · ' + esc(c.notes.join(' · ')) : ''}</div>`).join('');
  const notas = [...new Set([...(P.notes ?? []), ...(C.notes ?? [])])];
  return `<div class="totals ${compact ? 'compact' : ''}">${box('pix', 'Total Pix', P)}${box('card', 'Total Crédito', C, parc)}</div>
    ${best ? `<div class="economia">${best === 'pix' ? 'Pix' : 'Crédito'} economiza ${brl(t.saving)}</div>` : ''}
    <details class="breakdown"><summary>ver cálculo</summary>${tabela}${fontes}${notas.length ? `<div class="cnotas">${esc(notas.join(' · '))}</div>` : ''}</details>`;
}
const refLabel = (o) => { const p = o?.price; if (!p) return ''; if (p.pix != null && p.pix === p.card) return ''; return refKind() === 'pix' ? (p.pix != null ? 'no Pix' : 'no cartão') : (p.card != null ? 'no cartão' : 'no Pix'); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const scoreColor = (s) => s >= 85 ? 'var(--good)' : s >= 70 ? 'var(--ok)' : s >= 55 ? 'var(--warn)' : 'var(--bad)';
const ago = (t) => { if (!t) return 'nunca'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`; };
const lget = (k, d) => { try { const v = localStorage.getItem('radar.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lset = (k, v) => { try { localStorage.setItem('radar.' + k, JSON.stringify(v)); } catch {} };

let S = null;                                   // estado do servidor (SSE)
const ui = { view: lget('view', 'compare'), sort: lget('ordem', 'balance'), min: lget('min', 0), hideSus: lget('hideSus', true), deep: lget('deep', false), stores: lget('stores', null), shown: 40 };
const search = { q: '', es: null, status: {}, results: [], running: false, more: [], loadingMore: false };

const store = (id) => S?.stores.find(s => s.id === id) ?? { id, name: id, color: '#666' };
const scoreOf = (id) => store(id).reliability?.score ?? null;
// Nota final da oferta (plataforma + vendedor + sinais da oferta), calculada no servidor (src/seller-score.js).
// Sem nota do vendedor, vale a nota da plataforma.
const trustOf = (o) => o?.trust?.score ?? scoreOf(o?.storeId ?? o?.store);
const adjusted = (p, sc) => p * (1 + (100 - (sc ?? 50)) / 400);

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2800); }

// Score de confiabilidade desenhado como carimbo
// Score de confiabilidade desenhado como carimbo.
// É uma nota calculada pelo SetupSniper, não uma certificação: as palavras evitam sugerir selo oficial.
function ring(score, sm = true, estimado = true, trust = null) {
  const rot = ((score ?? 7) * 37) % 24 - 12;
  if (score == null) return `<div class="stamp ${sm ? 'sm' : ''} na" style="--r:${rot}deg" title="Comparador: sem nota"><b>—</b><span>comparador</span></div>`;
  const word = score >= 85 ? 'confiável' : score >= 70 ? 'bom' : score >= 55 ? 'regular' : score >= 40 ? 'cautela' : 'alto risco';
  const conf = trust?.confidence != null ? ` Confiança nos dados do vendedor: ${Math.round(trust.confidence * 100)}%.` : '';
  const motivos = (trust?.reasons ?? []).length ? `\nMotivos: ${trust.reasons.slice(0, 5).join('; ')}.` : '';
  const tip = esc(`Nota de confiança ${score}/100${trust?.tier ? ` (${trust.tier})` : ''} calculada pelo SetupSniper${estimado ? ' a partir de dados estimados' : ''}.${conf} Não é uma certificação nem um dado oficial do Reclame Aqui ou da loja.${motivos}`);
  return `<div class="stamp ${sm ? 'sm' : ''}" style="--c:${scoreColor(score)};--r:${rot}deg" title="${tip}"><b>${score}</b><span>${word}</span></div>`;
}
// Código de barras decorativo gerado a partir de um texto (sempre igual para o mesmo texto)
function barcode(seed) {
  let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  let x = 0, bars = '';
  for (let i = 0; i < 38; i++) { h = (h * 1103515245 + 12345) >>> 0; const w = 1 + (h >>> 16) % 3; bars += `<rect x="${x}" y="0" width="${w}" height="22"/>`; x += w + 1 + ((h >>> 8) % 2); }
  return `<svg class="barcode" viewBox="0 0 ${x} 22" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
}
const licenseNo = (seed) => { let h = 0; for (const c of String(seed)) h = (h * 33 + c.charCodeAt(0)) >>> 0; return String(h % 10000).padStart(4, '0'); };
function sparkline(hist) {
  if (!hist || hist.length < 2) return '<span class="nolink" style="font-size:12px">sem histórico</span>';
  const w = 160, h = 36, ps = hist.map(x => x.price), mn = Math.min(...ps), mx = Math.max(...ps), r = mx - mn || 1;
  const pts = ps.map((p, i) => [(i / (ps.length - 1)) * w, h - 4 - ((p - mn) / r) * (h - 8)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const c = ps.at(-1) <= ps[0] ? 'var(--good)' : 'var(--bad)';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="De ${brl(ps[0])} para ${brl(ps.at(-1))}"><path d="${d} L ${w} ${h} L 0 ${h} Z" fill="${c}" opacity=".08"/><path class="l" d="${d}" stroke="${c}" vector-effect="non-scaling-stroke"/></svg>`;
}

// ================= ABAS =================
function showTab() {
  const tab = (location.hash.slice(1) || 'busca');
  const valid = tab === 'monitorados' ? 'fixados' : ['busca', 'fixados', 'promos', 'cupons', 'lojas', 'alertas'].includes(tab) ? tab : 'busca';
  $$('.tab').forEach(t => t.hidden = t.id !== 'tab-' + valid);
  $$('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === valid));
  if (valid === 'promos' && !promo.loaded) loadPromos(true);
}
addEventListener('hashchange', showTab);

// ================= BUSCA =================
function storeFilterIds() {
  const all = S.stores.filter(s => ui.deep || !s.deepOnly).map(s => s.id);
  return ui.stores ? all.filter(id => ui.stores.includes(id) || (store(id).deepOnly && !ui.stores.includes('!' + id))) : all;
}
function renderStoreFilter() {
  const sel = new Set(storeFilterIds());
  $('#store-filter').innerHTML = S.stores.filter(s => ui.deep || !s.deepOnly).map(s =>
    `<button type="button" class="fchip ${sel.has(s.id) ? 'on' : ''}" data-store="${s.id}" aria-pressed="${sel.has(s.id)}"><i style="background:${s.color}"></i>${esc(s.name)}${s.deepOnly ? ' <small>profunda</small>' : ''}</button>`).join('');
  $('#deep-hint').textContent = S.browser ? 'mais páginas por loja + navegador' : 'mais páginas por loja';
}
$('#store-filter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-store]'); if (!b) return;
  const cur = new Set(storeFilterIds()), id = b.dataset.store;
  cur.has(id) ? cur.delete(id) : cur.add(id);
  if (!cur.size) return toast('Deixe pelo menos uma loja selecionada');
  ui.stores = [...cur, ...S.stores.filter(s => s.deepOnly && !cur.has(s.id)).map(s => '!' + s.id)];
  lset('stores', ui.stores); renderStoreFilter();
});
$('#deep').checked = ui.deep;
$('#deep').onchange = (e) => { ui.deep = e.target.checked; lset('deep', ui.deep); renderStoreFilter(); };

function startSearch(q) {
  q = q.trim(); if (q.length < 2) return toast('Digite pelo menos 2 letras');
  search.es?.close();
  search.more.forEach(x => x.close());
  Object.assign(search, { q, status: {}, results: [], running: true, more: [], loadingMore: false, seen: new Set() });
  ui.shown = 40;
  const ids = storeFilterIds();
  for (const id of ids) search.status[id] = { state: 'loading' };
  if (location.hash !== '#busca') location.hash = 'busca';
  renderSearch();
  const es = new EventSource(`/api/search?q=${encodeURIComponent(q)}&deep=${ui.deep ? 1 : 0}&stores=${ids.join(',')}${ui.view === 'porloja' ? '&modo=porloja' : ''}`);
  search.es = es;
  es.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'store') {
      search.status[m.storeId] = { state: m.status, n: m.items.length, error: m.error, blocked: m.blocked, reason: m.reason, approx: m.approx, url: m.searchUrl, ms: m.ms, page: m.page ?? 1, hasMore: !!m.hasMore, fromCaptures: !!m.fromCaptures, capturedAt: m.capturedAt, blockedNote: m.blockedNote };
      addResults(m.items);
    } else if (m.type === 'done') { search.running = false; es.close(); }
    renderSearch();
  };
  es.onerror = () => { if (search.running) { search.running = false; es.close(); toast('A busca foi interrompida'); renderSearch(); } };
}
$('#search').onsubmit = (e) => { e.preventDefault(); startSearch($('#q').value); };

// Sem repetir a mesma oferta quando a loja devolve o produto de novo numa página seguinte
function addResults(items) {
  for (const it of items) {
    const k = `${it.storeId}|${it.url ?? it.title}`;
    if (search.seen.has(k)) continue;
    search.seen.add(k); search.results.push(it);
  }
}

// Scroll infinito: quando a lista na tela acaba, pede a próxima página das lojas que ainda têm mais.
function loadMore() {
  if (!search.q || search.running || search.loadingMore) return;
  const byPage = {};
  for (const [id, st] of Object.entries(search.status)) if (st.state === 'ok' && st.hasMore) (byPage[st.page + 1] ??= []).push(id);
  const pages = Object.entries(byPage);
  if (!pages.length) return;
  search.loadingMore = true; renderSearch();
  let open = pages.length;
  const q = search.q;
  for (const [page, ids] of pages) {
    for (const id of ids) search.status[id].loadingMore = true;
    const es = new EventSource(`/api/search?q=${encodeURIComponent(q)}&deep=${ui.deep ? 1 : 0}&page=${page}&stores=${ids.join(',')}`);
    search.more.push(es);
    const finish = () => { es.close(); if (--open === 0) search.loadingMore = false; renderSearch(); };
    es.onmessage = (ev) => {
      if (search.q !== q) return es.close();
      const m = JSON.parse(ev.data);
      if (m.type === 'store') {
        const st = search.status[m.storeId] ?? {};
        // Erro numa página seguinte não apaga o que já veio: só para de pedir mais daquela loja.
        Object.assign(st, { loadingMore: false, hasMore: m.status === 'ok' && !!m.hasMore, page: m.page ?? Number(page), n: (st.n ?? 0) + m.items.length });
        addResults(m.items);
        renderSearch();
      } else if (m.type === 'done') finish();
    };
    es.onerror = () => { for (const id of ids) Object.assign(search.status[id], { loadingMore: false, hasMore: false }); finish(); };
  }
}
const moreObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  if (!entries.some(e => e.isIntersecting)) return;
  if (search.localMore) { ui.shown += 40; renderSearch(); }
  else loadMore();
}, { rootMargin: '600px 0px' }) : null;

function flagged(list) {   // mesmo critério do servidor (src/extract.js flagOutliers)
  const ps = list.map(refOf).filter(v => v != null).sort((a, b) => a - b);
  if (ps.length < 5) return list.map(r => ({ ...r, suspeito: false }));
  const med = ps[Math.floor(ps.length / 2)];
  return list.filter(r => refOf(r) == null || refOf(r) >= med * 0.25).map(r => ({ ...r, suspeito: refOf(r) != null && refOf(r) < med * 0.55 }));
}
function sortList(list, priceOf = (o) => refOf(o) ?? Infinity) {
  const key = { price: (o) => priceOf(o), score: (o) => -(trustOf(o.offer ?? o) ?? -1), balance: (o) => adjusted(priceOf(o), trustOf(o.offer ?? o)) }[ui.sort] ?? ((o) => priceOf(o));
  // Em qualquer ordem, "Alto risco" (nota < 40) e preço suspeito ficam depois das ofertas confiáveis,
  // e sem preço/indisponível por último (mesma regra de src/ranking.js no servidor).
  const group = (o) => { const p = priceOf(o), sc = trustOf(o.offer ?? o);
    return p == null || p === Infinity || o.available === false || o.status === 'unavailable' ? 2 : o.suspeito || (sc != null && sc < 40) ? 1 : 0; };
  return list.sort((a, b) => group(a) - group(b) || key(a) - key(b) || priceOf(a) - priceOf(b));
}

function renderSearch() {
  const has = !!search.q;
  $('#empty').hidden = has;
  $('#progress').hidden = $('#results-tools').hidden = !has;
  if (!has) { $('#results').innerHTML = ''; $('#results-summary').textContent = ''; return; }

  $('#progress').innerHTML = Object.entries(search.status).map(([id, s]) => {
    const n = store(id).name;
    if (s.state === 'loading') return `<span class="pchip loading">${esc(n)}</span>`;
    if (s.state === 'ok' && s.n && s.fromCaptures) return `<span class="pchip ok" title="${esc(`A loja recusou o servidor (${s.blockedNote ?? 'bloqueio'}). Estes preços foram vistos por você no navegador.`)}"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(n)} <b>${s.n}</b> · visto por você ${ago(s.capturedAt)} · abrir na loja para atualizar ↗</a></span>`;
    if (s.state === 'ok' && s.n) return `<span class="pchip ok${s.loadingMore ? ' loading' : ''}" title="${s.approx ? 'Nenhum título tinha todos os termos: mostrando os parecidos' : ''}">${esc(n)} <b>${s.n}</b>${s.approx ? ' ≈' : ''}${s.hasMore ? '+' : ''}</span>`;
    if (s.state === 'ok') return `<span class="pchip none" title="${esc(s.reason ?? '')}"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(n)}: ${s.reason && /mostrou \d/.test(s.reason) ? 'nada parecido' : 'sem resultados'} ↗</a></span>`;
    return `<span class="pchip err" title="${esc(errHelp(s))}"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(n)}: ${esc(s.blocked ? 'bloqueado · abrir na loja' : shortErr(s.error))} ↗</a></span>`;
  }).join('');

  let list = flagged(search.results);
  const total = list.length, sus = list.filter(r => r.suspeito).length;
  if (ui.hideSus) list = list.filter(r => !r.suspeito);
  // Ofertas sem preço legível ou sem estoque vão para o fim, mas continuam visíveis.
  list = sortList(list).sort((a, b) => (refOf(a) == null || a.available === false) - (refOf(b) == null || b.available === false));
  const eligible = list.filter(r => (trustOf(r) ?? 100) >= ui.min && refOf(r) != null && r.available !== false);
  const cheapest = [...eligible].sort((a, b) => refOf(a) - refOf(b))[0];
  // Destaque: em "Melhor escolha", a 1ª oferta confiável da lista (preço + confiança); em "Menor preço", a mais barata.
  const best = ui.sort === 'price' ? cheapest : eligible.find(r => !r.suspeito && (trustOf(r) ?? 100) >= 40) ?? cheapest;
  const storesN = new Set(list.map(r => r.storeId)).size;
  const prices = list.map(refOf).filter(v => v != null).sort((a, b) => a - b);
  const med = prices[Math.floor(prices.length / 2)];
  $('#results-summary').innerHTML = total
    ? `<b>${list.length}</b> ofertas de <b>${storesN}</b> lojas para “${esc(search.q)}” · menor <b>${brl(cheapest ? refOf(cheapest) : null)}</b>${refKind() === 'pix' ? ' (Pix)' : ' (cartão)'} · mediana <b>${brl(med)}</b>${sus ? ` · ${sus} suspeita(s) ${ui.hideSus ? 'ocultas' : 'marcadas'}` : ''}${search.running ? ' · buscando…' : ''}`
    : search.running ? 'Buscando nas lojas…' : `Nenhuma oferta encontrada para “${esc(search.q)}”. Tente termos mais simples (ex.: marca + modelo) ou ative a busca profunda.`;

  search.view = list;
  if (ui.view === 'compare') { renderCompare(list, best); return; }
  if (ui.view === 'porloja') { renderPorLojaView(); return; }
  search.localMore = list.length > ui.shown;
  $('#results').innerHTML = list.slice(0, ui.shown).map((r, i) => {
    const s = store(r.storeId), sc = trustOf(r), below = sc != null && sc < ui.min;
    const tags = [
      r === best ? `<span class="sticker lime">${ui.sort === 'price' || best === cheapest ? 'MELHOR PREÇO.' : 'MELHOR ESCOLHA.'}</span>` : '',
      r.suspeito ? '<span class="tag warn" title="Muito abaixo da mediana: pode ser golpe, usado ou outro produto">Suspeito</span>' : '',
      r.approx ? '<span class="tag info" title="O título não tem todos os termos da busca: confira se é o produto certo">Parecido</span>' : '',
      r.seller?.official ? '<span class="tag info">Oficial</span>' : '',
      r.captured ? `<span class="tag info" title="A loja recusou o servidor; este preço veio da página que você abriu">visto por você ${ago(r.capturedAt)}</span>` : '',
      s.agregador ? '<span class="tag info">Comparador</span>' : '',
    ].join('');
    const rp = refOf(r);
    const diff = cheapest && r !== cheapest && rp != null && rp > refOf(cheapest) ? `<div class="diff">+${brl(rp - refOf(cheapest))} que o menor</div>` : '';
    // "Preço não encontrado nesta página" (falha de leitura) é diferente de "Indisponível" (sem estoque)
    const priceHtml = rp == null
      ? `<span class="tag err" title="A loja mostrou o produto, mas o preço não foi lido da página">Preço não encontrado nesta página</span>`
      : r.available === false
        ? `<div class="price" style="opacity:.5">${brl(rp)}</div><span class="tag out">Indisponível</span>`
        : r.totals ? `${totalsHtml(r)}${diff}` : `<div class="price">${brl(rp)} <small class="reflbl">${refLabel(r)}</small></div><div class="pdetail">${priceDetail(r)}</div>${diff}`;
    return `<div class="res ${r === best ? 'top1' : ''} ${below ? 'dim' : ''}">
      ${r.image ? `<img class="thumb" src="${esc(r.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'thumb',textContent:'${esc(s.name[0])}'}))">` : `<div class="thumb" style="background:${s.color}">${esc(s.name[0])}</div>`}
      <div class="info">${/^https?:\/\//i.test(r.url ?? '') ? `<a class="title" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" title="${esc(r.title)}">${esc(r.title)}</a>` : `<div class="title" title="${esc(r.title)}">${esc(r.title)}</div>`}
        <div class="meta"><span class="sdot" style="background:${s.color}"></span>${esc(s.name)} ${tags}</div>
        <div class="code">${barcode(r.url ?? r.title)}<span>SN-${esc(r.storeId.slice(0, 3).toUpperCase())}-${licenseNo(r.url ?? r.title)}</span></div></div>
      <div class="rscore">${ring(sc, true, s.estimado !== false, r.trust)}</div>
      <div class="price">${priceHtml}</div>
      <div class="actions">
        ${pinnedItem(r) ? `<a class="btn small pinned-btn" href="#fixados" title="Já está nos fixados">✓ Fixado</a>` : `<button type="button" class="btn small" data-watch="${i}">📌 Fixar</button>`}
        ${storeLink(linkOf(r), s, search.status[r.storeId]?.url)}
      </div></div>`;
  }).join('') + moreFooter(list);
  search.view = list;
  const sentinel = $('#more-sentinel');
  if (sentinel && moreObserver) { moreObserver.disconnect(); moreObserver.observe(sentinel); }
}
// "Ver na loja" abre a URL canônica limpa. Só com a opção "links de afiliado" ligada (aba Lojas) usa o link
// rastreado que a API oficial devolveu, e o botão avisa isso.
const linkOf = (o) => (S.settings?.affiliateLinks && /^https?:\/\//i.test(o?.affiliateUrl ?? '') ? { url: o.affiliateUrl, affiliate: true } : o?.url);
// Botão que leva direto à página do produto na loja (ou, sem link direto, à busca da loja)
function storeLink(url, s, fallbackUrl) {
  const affiliate = !!url?.affiliate; if (affiliate) url = url.url;
  const safe = (u) => /^https?:\/\//i.test(u ?? '') ? u : null;
  const u = safe(url), f = safe(fallbackUrl);
  const hex = (s.color ?? '#ff5a1f').replace('#', ''), [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  const ink = (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111' : '#fff';   // texto legível sobre a cor da loja
  if (u) return `<a class="btn small shop" href="${esc(u)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" style="--sc:${s.color};--ink:${ink}" aria-label="Ver produto na ${esc(s.name)}">${s.agregador ? 'Ver ofertas' : 'Ver na loja'} ↗</a>${affiliate ? '<small class="tag warn" title="Este botão usa o link de afiliado da rede (opção ligada na aba Lojas). O preço é o mesmo; a rede registra a visita.">link de afiliado</small>' : ''}`;
  if (f) return `<a class="btn small" href="${esc(f)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" title="Sem link direto: abre a busca da loja">Buscar na loja ↗</a>`;
  return '';
}
// Rodapé da lista: carrega mais sozinho ao chegar perto (o botão fica para quem preferir tocar)
function moreFooter(list) {
  const remote = Object.values(search.status).some(s => s.state === 'ok' && s.hasMore);
  if (list.length > ui.shown) return `<div class="more" id="more-sentinel"><button type="button" class="btn" id="more">Mostrar mais ${list.length - ui.shown}</button></div>`;
  if (search.loadingMore) return `<div class="more" id="more-sentinel"><span class="muted">Buscando mais produtos nas lojas…</span></div>`;
  if (remote && !search.running) return `<div class="more" id="more-sentinel"><button type="button" class="btn" id="more-remote">Buscar mais produtos nas lojas</button></div>`;
  return list.length && !search.running ? '<div class="more"><span class="muted">Fim dos resultados.</span></div>' : '';
}
// Explicação do erro, no toque/mouse
function errHelp(s) {
  if (s.blocked) return `A loja recusou o acesso automático (${s.error}). O SetupSniper não tenta burlar a proteção. Toque para abrir a busca na loja. Dicas: rode o servidor em casa (internet residencial), ative a busca profunda se o PC tiver o navegador headless, ou fixe o link do produto.`;
  return s.error ?? '';
}
const shortErr = (e = '') => /bloqueio/.test(e) ? 'bloqueado' : /Playwright/.test(e) ? 'precisa navegador' : /abort|timeout/i.test(e) ? 'sem resposta' : e.length > 22 ? e.slice(0, 20) + '…' : e;

$('#results').addEventListener('click', (e) => {
  if (e.target.id === 'more') { ui.shown += 40; return renderSearch(); }
  const cw = e.target.closest('[data-cwatch]');
  if (cw) {
    const r = search.cmpIndex[Number(cw.dataset.cwatch)];
    return openWatchDialog({ name: r.title.slice(0, 80), query: search.q, refPrice: refOf(r), pin: r.url && !store(r.storeId).agregador ? { storeId: r.storeId, url: r.url } : null });
  }
  if (e.target.id === 'more-remote') return loadMore();
  const b = e.target.closest('[data-watch]'); if (!b) return;
  const r = search.view[Number(b.dataset.watch)];
  openWatchDialog({ name: r.title.slice(0, 80), query: search.q, refPrice: refOf(r), pin: r.url && !store(r.storeId).agregador ? { storeId: r.storeId, url: r.url } : null });
});
for (const b of $$('#sort button')) {
  b.classList.toggle('on', b.dataset.sort === ui.sort);
  b.onclick = () => { ui.sort = b.dataset.sort; lset('ordem', ui.sort); $$('#sort button').forEach(x => x.classList.toggle('on', x === b)); renderSearch(); renderWatch(); };
}
$('#min').value = ui.min; $('#min-val').textContent = ui.min;
$('#min').oninput = (e) => { ui.min = Number(e.target.value); $('#min-val').textContent = ui.min; lset('min', ui.min); renderSearch(); };
$('#hide-sus').checked = ui.hideSus;
$('#hide-sus').onchange = (e) => { ui.hideSus = e.target.checked; lset('hideSus', ui.hideSus); renderSearch(); };

// ================= MONITORADOS =================
const dlg = $('#watch-dlg'); let editing = null;
function openWatchDialog(v, item = null) {
  editing = { item, pin: v.pin, refPrice: v.refPrice };
  $('#watch-title').textContent = item ? 'Editar produto fixado' : 'Fixar produto';
  $('#w-submit').textContent = item ? 'Salvar' : '📌 Fixar';
  $('#w-alerts').checked = v.alerts !== false;
  $('#w-name').value = v.name ?? ''; $('#w-query').value = v.query ?? '';
  // Os campos mostram reais; o servidor guarda centavos.
  const reais = (c, casas = 2) => (c == null ? '' : (c / 100).toFixed(casas));
  $('#w-target').value = v.target != null ? reais(v.target) : (v.refPrice ? reais(Math.floor(v.refPrice * 0.95)) : '');
  $('#w-min').value = v.minPrice != null ? reais(v.minPrice, 0) : (v.refPrice ? reais(v.refPrice * 0.5, 0) : '');
  $('#w-max').value = v.maxPrice != null ? reais(v.maxPrice, 0) : (v.refPrice ? reais(v.refPrice * 2.5, 0) : '');
  $('#w-pin-note').hidden = !v.pin;
  if (v.pin) $('#w-pin-note').textContent = `Na ${store(v.pin.storeId).name}, o servidor vai acompanhar exatamente esta oferta. Nas outras lojas, usa o termo de busca.`;
  dlg.showModal();
}
$('#w-cancel').onclick = () => dlg.close();
$('#watch-form').onsubmit = async (e) => {
  e.preventDefault();
  // "1.234,56", "1234,56", "1234.56" ou "1200" → centavos (mesma regra do parseBRL do servidor)
  const cents = (v) => {
    let t = String(v).trim().replace(/[^\d.,]/g, '');
    if (!t) return '';
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = parseFloat(t);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : '';
  };
  const body = { name: $('#w-name').value, query: $('#w-query').value, target: cents($('#w-target').value), minPrice: cents($('#w-min').value), maxPrice: cents($('#w-max').value), alerts: $('#w-alerts').checked };
  try {
    if (editing.item) await api(`/api/watch/${editing.item.id}`, { method: 'PATCH', body });
    else await api('/api/watch', { method: 'POST', body: { ...body, pin: editing.pin, refPrice: editing.refPrice } });
    dlg.close();
    const tgOk = S.settings.telegram.configured && S.settings.telegram.chatId;
    toast(editing.item ? 'Produto atualizado' : !body.alerts ? '📌 Fixado (sem alertas)' : tgOk ? '📌 Fixado! Você recebe alerta no Telegram quando o preço cair' : '📌 Fixado! Configure o Telegram na aba Alertas para receber avisos');
  } catch (err) { toast(err.message); }
};
$('#add-watch').onclick = () => openWatchDialog({ query: search.q, name: search.q });
$('#refresh').onclick = async () => { await api('/api/refresh', { method: 'POST' }); toast('Verificando todos os produtos…'); };

function renderWatch() {
  $('#count-mon').textContent = S.items.length;
  $('#interval-txt').textContent = S.demo ? 1 : S.settings.intervalMin;
  if (!S.items.length) {
    $('#watch').innerHTML = `<div class="empty"><h2>Nenhum produto fixado</h2><p class="muted">Faça uma busca e toque em <b>📌 Fixar</b> numa oferta, use o botão acima ou envie <code>/fixar ryzen 5 7600 meta 1200</code> para o seu bot no Telegram.</p></div>`;
    return;
  }
  $('#watch').innerHTML = S.items.map(it => {
    const offers = it.offers.map(o => ({ ...o, sc: o.offer?.trust?.score ?? scoreOf(o.storeId) }));
    const valid = offers.filter(o => o.status === 'ok' && o.price != null && !o.suspeito && (o.sc ?? 100) >= S.settings.alerts.minScore);
    const best = [...valid].sort((a, b) => a.price - b.price)[0];
    const hit = best && it.target && best.price <= it.target;
    const rows = sortList([...offers], (o) => o.price ?? Infinity).sort((a, b) => (a.status === 'ok' ? 0 : 1) - (b.status === 'ok' ? 0 : 1)).map(o => {
      const s = store(o.storeId);
      let priceCell;
      // Cada loja termina com um estado explícito (server.js checkItem): nada some em silêncio.
      if (o.status === 'ok') priceCell = `${o.offer?.totals ? totalsHtml(o.offer, { compact: true }) : `<div class="price">${brl(o.price)} <small class="reflbl">${refLabel(o.offer)}</small></div><div class="pdetail">${priceDetail(o.offer)}</div>`}<div class="diff ${o === best ? 'isbest' : ''}">${o === best ? 'menor preço' : best ? '+' + brl(o.price - best.price) : ''}${o.suspeito ? ' <span class="tag warn">Suspeito</span>' : ''}</div>`;
      else if (o.status === 'stale') priceCell = `<div class="price" style="opacity:.6">${brl(o.price)} <small class="reflbl">${refLabel(o.offer)}</small></div><div class="pdetail"><span class="tag warn" title="${esc(o.message)}">visto por você ${ago(o.capturedAt)}</span> a loja recusou o servidor; não entra nos alertas</div>${/^https?:\/\//i.test(o.url ?? '') ? `<a class="btn small" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">Abrir na loja para atualizar ↗</a>` : ''}`;
      else if (o.status === 'error') priceCell = `<span class="tag err" title="${esc(o.message)}">⚠ ${esc(shortErr(o.message))}</span>`;
      else if (o.status === 'unavailable') priceCell = `<span class="tag out" title="${esc(o.message)}">Indisponível</span>`;
      else if (o.status === 'price_not_found') priceCell = `<span class="tag err" title="O produto foi encontrado, mas o preço não foi lido da página">Preço não encontrado nesta página</span>`;
      else if (o.status === 'out_of_range') priceCell = `<span class="tag warn" title="${esc(o.message)}">Fora da faixa: ${brl(refOf(o.offer))}</span><div class="pdetail">ajuste a faixa em Editar se for o produto certo</div>`;
      else if (o.status) priceCell = `<span class="nolink" title="${esc(o.message)}">${esc(o.message)}</span>`;
      else priceCell = `<span class="nolink">${it.checking ? 'buscando…' : 'aguardando a primeira verificação'}</span>`;
      return `<div class="row ${o === best ? 'top1' : ''}">
        <div class="store"><div class="chip" style="background:${s.color}">${esc(s.name[0])}</div>
          <div style="min-width:0"><div class="n">${esc(s.name)} ${o.pin ? '<span class="tag info" title="Acompanhando um link fixo">📌</span>' : ''}</div>
          ${o.status === 'ok' && o.offer ? `<div class="sv">${esc(sellerLabel({ storeId: o.storeId, seller: o.offer.seller }))}</div>` : ''}
          <div class="t" title="${esc(o.title)}">${esc(o.title ?? '')}${o.capturedAt && (o.status === 'stale' || o.lastError) ? ' · visto por você ' + ago(o.capturedAt) : o.updatedAt ? ' · ' + ago(o.updatedAt) : ''}</div></div></div>
        <div class="pcell">${priceCell}</div>
        <div class="score">${ring(o.sc, false, s.estimado !== false, o.offer?.trust)}<div class="tier">${o.offer?.trust?.tier ?? s.reliability?.tier ?? ''}</div></div>
        <div class="spk">${sparkline(o.history)}</div>
        <div class="actions">${storeLink(linkOf({ url: o.url, affiliateUrl: o.offer?.affiliateUrl }), s, o.searchUrl)}</div>
        ${o.status === 'ok' && o.others?.length ? `<details class="others"><summary>Outros ${o.others.length} vendedor(es) na ${esc(s.name)}</summary>${o.others.map(x => `
          <div class="orow"><span class="owho">${esc(sellerLabel({ storeId: o.storeId, seller: x.seller }))}</span>
            <span class="osc" title="${esc((x.trust?.reasons ?? []).join('; '))}">${x.trust?.score != null ? `<b style="color:${scoreColor(x.trust.score)}">${x.trust.score}</b> ${esc(x.trust.tier ?? '')}` : 'sem nota'}</span>
            <span class="opr"><b>${brl(x.price)}</b>${best && x.price > best.price ? ` <small>+${brl(x.price - best.price)}</small>` : ''}${x.suspeito ? ' <span class="tag warn">Suspeito</span>' : ''}</span>
            ${/^https?:\/\//i.test(x.url ?? '') ? `<a class="btn small" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Ver ↗</a>` : ''}</div>`).join('')}</details>` : ''}
      </div>`;
    }).join('');
    return `<article class="product ${it.alerts === false ? 'muted-card' : ''}">
      <div class="product-head">
        <div style="min-width:0"><div class="lic">Nº DE LICENÇA <b>${licenseNo(it.id)}</b></div><h2>${esc(it.name)}</h2>
          <div class="watch-meta"><span>busca: <b>${esc(it.query)}</b></span>${it.target ? `<span>meta: <b>${brl(it.target)}</b></span>` : '<span>sem meta</span>'}${it.minPrice || it.maxPrice ? `<span>faixa: <b>${brl(it.minPrice)}–${brl(it.maxPrice)}</b></span>` : ''}</div></div>
        <div class="best">${best ? `<div class="p" style="${hit ? 'color:var(--good)' : ''}">${brl(best.price)}</div><div class="s">na ${esc(store(best.storeId).name)}${hit ? ' · <b style="color:var(--good)">meta atingida</b>' : ''}</div>` : `<div class="s">${it.checking ? 'Buscando…' : 'Sem oferta válida ainda'}</div>`}
          <div class="head-actions">
            <button type="button" class="btn small bell ${it.alerts === false ? '' : 'on'}" data-bell="${it.id}" aria-pressed="${it.alerts !== false}" title="${it.alerts === false ? 'Alertas desligados para este produto' : 'Alertas ligados para este produto'}">${it.alerts === false ? '🔕 Alertas off' : '🔔 Alertas on'}</button>
            <button type="button" class="btn small" data-check="${it.id}" ${it.checking ? 'disabled' : ''}>${it.checking ? 'Verificando…' : 'Verificar'}</button>
            <button type="button" class="btn small" data-edit="${it.id}">Editar</button>
            <button type="button" class="btn small danger" data-del="${it.id}">Desafixar</button>
          </div></div>
      </div>
      <div class="hist-row">${it.hist ? `${it.hist.points?.length > 1 ? sparklineSvg(it.hist.points, { label: 'Menor preço por dia, todas as lojas' }) : ''} ${historyBadges(it.hist.ind, { fonte: it.hist.fonte })}` : '<span class="hist-vazio">histórico começando</span>'}</div>
      <div class="rows">${rows}</div>
    </article>`;
  }).join('');
}
$('#watch').addEventListener('click', async (e) => {
  const c = e.target.closest('[data-check]'), ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]'), bell = e.target.closest('[data-bell]');
  try {
    if (bell) { const it = S.items.find(x => x.id === bell.dataset.bell); await api(`/api/watch/${it.id}`, { method: 'PATCH', body: { alerts: it.alerts === false } }); toast(it.alerts === false ? '🔔 Alertas ligados' : '🔕 Alertas desligados para este produto'); }
    if (c) await api(`/api/watch/${c.dataset.check}/check`, { method: 'POST' });
    if (ed) { const it = S.items.find(x => x.id === ed.dataset.edit); openWatchDialog(it, it); }
    if (del) {
      if (!del.classList.contains('armed')) { del.classList.add('armed'); del.textContent = 'Confirmar'; setTimeout(() => { del.classList.remove('armed'); del.textContent = 'Desafixar'; }, 3500); return; }
      await api(`/api/watch/${del.dataset.del}`, { method: 'DELETE' }); toast('Produto desafixado');
    }
  } catch (err) { toast(err.message); }
});

// ================= LOJAS =================
function renderStores() {
  const labels = { reclameAqui: 'Reclame Aqui', rating: 'Avaliação', vendas: 'Vendas', reviews: 'Reviews' };
  const fmt = (n) => n >= 1e6 ? (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : n;
  const list = [...S.stores].sort((a, b) => (b.reliability?.score ?? -1) - (a.reliability?.score ?? -1));
  $('#stores').innerHTML = list.map(s => {
    const r = s.reliability, ra = s.reclameAqui ?? {};
    if (!r) return `<div class="scard"><div class="scard-head"><div class="chip" style="background:${s.color}">${esc(s.name[0])}</div><div class="n">${esc(s.name)}<div class="tier muted">Comparador de preços</div></div>${ring(null, false)}</div>${s.observacao ? `<div class="note">${esc(s.observacao)}</div>` : ''}</div>`;
    return `<div class="scard">
      <div class="scard-head"><div class="chip" style="background:${s.color}">${esc(s.name[0])}</div><div class="n">${esc(s.name)}<div class="tier muted">${r.tier}</div></div>${ring(r.score, false, s.estimado !== false)}</div>
      <div class="bars">${Object.entries(r.parts).map(([k, v]) => `<div class="bar"><span>${labels[k]} <small style="color:var(--dim)">${Math.round(r.weights[k] * 100)}%</small></span><div class="track"><div class="fill" style="width:${v ?? 0}%;background:${scoreColor(v ?? 0)}"></div></div><b>${v ?? '—'}</b></div>`).join('')}</div>
      <div class="facts"><span>RA nota${s.estimado !== false ? ' (est.)' : ''} <b>${ra.nota?.toFixed(1) ?? '—'}</b></span><span>Solução <b>${ra.solucao != null ? Math.round(ra.solucao) + '%' : '—'}</b></span><span>Voltaria <b>${ra.voltaria != null ? Math.round(ra.voltaria) + '%' : '—'}</b></span>${ra.ra1000 ? '<span><b style="color:var(--good)">RA1000</b></span>' : ''}<span>★ <b>${s.rating?.media ?? '—'}</b> (${fmt(s.rating?.avaliacoes ?? 0)})</span><span>~<b>${fmt(s.vendas ?? 0)}</b> vendas</span></div>
      ${s.observacao ? `<div class="note">${esc(s.observacao)}</div>` : ''}
      <div class="src">Fonte: ${esc(s.raFonte)} · ${esc(s.atualizadoEm)}</div></div>`;
  }).join('');
}

// ================= ALERTAS =================
let alertsFormFilled = false;
function renderAlerts() {
  const t = S.settings.telegram, a = S.settings.alerts;
  const status = !t.configured ? ['warn', 'Não configurado'] : !t.chatId ? ['warn', 'Aguardando /start'] : ['good', 'Conectado'];
  $('#tg-status').className = 'tag ' + status[0]; $('#tg-status').textContent = status[1];
  $('#tg-dot').hidden = t.configured && !!t.chatId;
  $('#tg-token').placeholder = t.configured ? `Token salvo (${t.tokenHint}) — cole outro para trocar` : '123456789:AA…';
  $('#tg-remove').hidden = !t.configured;
  if (!alertsFormFilled || !document.activeElement?.closest('#tab-alertas')) {
    $('#al-enabled').checked = a.enabled; $('#al-drop').value = a.dropPct; $('#al-score').value = a.minScore;
    $('#al-sus').checked = a.allowSuspicious; $('#al-interval').value = S.settings.intervalMin;
    $('#al-ref').value = refKind();
    const mon = new Set(S.settings.monitorStores);
    $('#mon-stores').innerHTML = S.stores.filter(s => !s.deepOnly).map(s => `<button type="button" class="fchip ${mon.has(s.id) ? 'on' : ''}" data-mon="${s.id}" aria-pressed="${mon.has(s.id)}"><i style="background:${s.color}"></i>${esc(s.name)}</button>`).join('');
    alertsFormFilled = true;
  }
  $('#alert-log').innerHTML = S.alerts.length ? S.alerts.map(x => `<div class="alog">
      <span class="sdot" style="background:${store(x.storeId).color}"></span>
      <div><b>${esc(x.item)}</b> · ${esc(x.store)}<div class="r">${esc(x.reasons.join(' · '))} · ${ago(x.t)} · ${x.sent ? 'enviado no Telegram' : x.error ? 'falha: ' + esc(x.error) : 'Telegram não configurado'}</div></div>
      <a class="p" href="${esc(/^https?:\/\//i.test(x.url ?? '') ? x.url : '#')}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${brl(x.price)}</a></div>`).join('')
    : '<p class="muted">Nenhum alerta ainda. Quando um produto fixado atingir a meta ou cair abaixo da média, ele aparece aqui.</p>';
}
$('#mon-stores').addEventListener('click', (e) => { const b = e.target.closest('[data-mon]'); if (b) { b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); } });
$('#tg-save').onclick = async () => {
  const token = $('#tg-token').value.trim(); if (!token) return toast('Cole o token do @BotFather');
  try { await api('/api/settings', { method: 'POST', body: { telegram: { token } } }); $('#tg-token').value = ''; toast('Token salvo. Agora envie /start para o seu bot'); } catch (e) { toast(e.message); }
};
$('#tg-remove').onclick = async () => { try { await api('/api/settings', { method: 'POST', body: { telegram: { token: '' } } }); toast('Bot desconectado'); } catch (e) { toast(e.message); } };
$('#tg-test').onclick = async () => { try { await api('/api/telegram/test', { method: 'POST' }); toast('Mensagem enviada. Confira o Telegram'); } catch (e) { toast(e.message); } };
$('#al-save').onclick = async () => {
  try {
    await api('/api/settings', { method: 'POST', body: {
      alerts: { enabled: $('#al-enabled').checked, dropPct: $('#al-drop').value, minScore: $('#al-score').value, allowSuspicious: $('#al-sus').checked },
      intervalMin: $('#al-interval').value, priceReference: $('#al-ref').value, monitorStores: $$('#mon-stores .fchip.on').map(b => b.dataset.mon) } });
    alertsFormFilled = false; toast('Regras salvas');
  } catch (e) { toast(e.message); }
};

// ================= GERAL =================
function renderStatus() {
  $('#live').className = 'live ' + (S.refreshing ? 'busy' : 'on');
  $('#live-text').textContent = S.refreshing ? 'Verificando…' : `Ao vivo · ${ago(S.lastRefresh)}`;
  $('#demo-banner').hidden = !S.demo;
}
let first = true;
function bestOf(it) {
  return it.offers.filter(o => o.status === 'ok' && o.price != null && !o.suspeito && (o.offer?.trust?.score ?? scoreOf(o.storeId) ?? 100) >= S.settings.alerts.minScore).sort((a, b) => a.price - b.price)[0];
}
function pinnedItem(r) {
  return S.items.find(it => (r.url && Object.values(it.pins ?? {}).includes(r.url)));
}
function renderPinned() {
  const el = $('#pinned-strip');
  el.hidden = !S.items.length;
  if (!S.items.length) return;
  el.innerHTML = `<div class="pinned-head"><b>📌 Fixados</b><a href="#fixados">ver todos →</a></div><div class="pinned-row">` + S.items.map(it => {
    const b = bestOf(it), hit = b && it.target && b.price <= it.target;
    return `<a class="pcard ${hit ? 'hit' : ''}" href="#fixados" title="${esc(it.name)}" style="--band:${b ? store(b.storeId).color : '#888'}">
      <span class="pc-no">Nº${licenseNo(it.id)}</span>
      <span class="pc-name">${it.alerts === false ? '🔕' : '🔔'} ${esc(it.name)}</span>
      <span class="pc-price">${b ? brl(b.price) : it.checking ? 'buscando…' : '—'}</span>
      <span class="pc-meta">${b ? esc(store(b.storeId).name) : ''}${it.target ? ` · meta ${brl(it.target)}` : ''}${hit ? ' · <b>atingida</b>' : ''}</span></a>`;
  }).join('') + `</div>`;
}
$('#pl-nota').onchange = (e) => savePorLoja({ notaMinima: Number(e.target.value) });
$('#pl-n').onchange = (e) => savePorLoja({ produtosPorLoja: Number(e.target.value) });
$('#pl-alerta').onchange = (e) => savePorLoja({ alertasSoVendedorBom: e.target.checked });
$('#aff-on').onchange = async (e) => {
  try { await api('/api/settings', { method: 'POST', body: { affiliateLinks: e.target.checked } }); toast(e.target.checked ? 'Ver na loja vai usar o link de afiliado, com aviso' : 'Ver na loja volta a abrir a página limpa'); }
  catch (err) { toast(err.message); e.target.checked = !e.target.checked; }
};
function render() {
  if (!S) return;
  $('#aff-on').checked = !!S.settings?.affiliateLinks;
  if (!document.activeElement?.closest('#pl-panel')) { const pl = S.settings?.porLoja ?? {}; $('#pl-nota').value = pl.notaMinima ?? 70; $('#pl-n').value = pl.produtosPorLoja ?? 10; $('#pl-alerta').checked = pl.alertasSoVendedorBom !== false; }
  renderStatus(); renderWatch(); renderPinned(); renderCoupons(); if (search.q && !search.running) renderSearch(); renderStores(); renderAlerts(); renderPromos(); renderMl();
  // Promoções novas chegaram e a pessoa está no topo da aba: atualiza a lista sozinha
  const nPromo = S.channels?.promos ?? 0;
  if (nPromo !== ui.lastPromos) { const was = ui.lastPromos; ui.lastPromos = nPromo; if (was != null && promo.loaded && promo.offset <= 30 && !$('#tab-promos').hidden) loadPromos(true); }
  if (first) { renderStoreFilter(); renderSearch(); first = false;
    const sugg = [...new Set([...S.items.map(i => i.query), 'RTX 4060', 'SSD 2TB NVMe', 'Ryzen 5 7600'])].slice(0, 6);
    $('#suggest').innerHTML = sugg.map(q => `<button type="button" class="fchip on" data-q="${esc(q)}">${esc(q)}</button>`).join('');
  }
}
$('#suggest').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) { $('#q').value = b.dataset.q; startSearch(b.dataset.q); } });

function connect() {
  const es = new EventSource('/api/stream');
  es.onmessage = (e) => { S = JSON.parse(e.data); render(); };
  es.onerror = () => { $('#live').className = 'live'; $('#live-text').textContent = 'Reconectando…'; };
}
setInterval(() => S && renderStatus(), 30000);
showTab();
connect();

// ================= CUPONS E TOTAIS (Fases 2 e 3) =================
const brlInput = (v) => {   // "1.234,56" → centavos (mesma regra do servidor)
  let t = String(v ?? '').trim().replace(/[^\d.,]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};
let cfgFilled = false;
function renderCoupons() {
  const list = S.coupons ?? [];
  const ativos = list.filter(c => c.status !== 'expired' && (!c.expiresAt || Date.parse(c.expiresAt) > Date.now()));
  $('#count-cup').textContent = ativos.length;
  const feed = S.couponFeed;
  $('#coupon-feed-status').innerHTML = feed ? `Cupons oficiais das redes de afiliados: ${feed.atualizadoEm ? `última leitura ${ago(Date.parse(feed.atualizadoEm))}` : 'ainda não lidos'} · ${Object.entries(feed.redes ?? {}).map(([k, r]) => `${esc(k)}: ${r.ok ? `${r.n ?? 0} cupom(ns)` : r.pulada ? 'desligada' : esc(r.erro ?? r.motivo ?? 'sem credencial')}`).join(' · ') || 'nenhuma rede configurada (veja docs/credenciais.md)'}` : '';
  $('#coupon-list').innerHTML = list.length ? list.map(c => couponCard(c, { now: Date.now(), lojaNome: store(c.store).name, cor: store(c.store).color })).join('') +
    (feed?.historico?.length ? `<details class="pmore"><summary>Histórico de cupons oficiais (${feed.historico.length})</summary>${feed.historico.map(c => couponCard(c, { now: Date.now(), lojaNome: store(c.store).name, cor: store(c.store).color })).join('')}</details>` : '')
    : '<p class="muted">Nenhum cupom ainda. Cole um post acima, encaminhe um para o bot do Telegram ou configure a Awin/Lomadee para receber cupons oficiais.</p>';
  if (!$('#c-store').options.length) $('#c-store').innerHTML = S.stores.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  if (!cfgFilled || !document.activeElement?.closest('#tab-cupons')) {
    const st = S.settings;
    $('#cfg-cep').value = st.cep ? st.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';
    $('#cfg-fx').value = st.fx?.usdBrl ? String(st.fx.usdBrl).replace('.', ',') : '';
    $('#cfg-ptax').checked = st.fx?.mode === 'ptax';
    $('#cfg-fx').disabled = st.fx?.mode === 'ptax';
    $('#cfg-fx-info').textContent = st.fx?.usdBrl ? `Cotação usada: R$ ${String(st.fx.usdBrl).replace('.', ',')}${st.fx.mode === 'ptax' ? ` (PTAX ${st.fx.updatedAt ?? ''})` : ' (manual)'}` : 'Sem cotação: os importados mostram "informe a cotação".';
    const bought = new Set(st.profile?.boughtAt ?? []), subs = new Set(st.profile?.subscriptions ?? []);
    $('#cfg-bought').innerHTML = S.stores.map(s => `<button type="button" class="fchip ${bought.has(s.id) ? 'on' : ''}" data-bought="${s.id}" aria-pressed="${bought.has(s.id)}"><i style="background:${s.color}"></i>${esc(s.name)}</button>`).join('');
    $$('#cfg-subs [data-sub]').forEach(b => { b.classList.toggle('on', subs.has(b.dataset.sub)); b.setAttribute('aria-pressed', subs.has(b.dataset.sub)); });
    $('#cfg-channels').value = (st.channels ?? []).join('\n');
    cfgFilled = true;
  }
}
$('#cfg-bought').addEventListener('click', (e) => { const b = e.target.closest('[data-bought]'); if (b) { b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); } });
$('#cfg-subs').addEventListener('click', (e) => { const b = e.target.closest('[data-sub]'); if (b) { b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); } });
$('#cfg-ptax').onchange = (e) => { $('#cfg-fx').disabled = e.target.checked; };
$('#cfg-save').onclick = async () => {
  try {
    await api('/api/settings', { method: 'POST', body: {
      cep: $('#cfg-cep').value,
      fx: { mode: $('#cfg-ptax').checked ? 'ptax' : 'manual', usdBrl: $('#cfg-fx').value },
      profile: { boughtAt: $$('#cfg-bought .fchip.on').map(b => b.dataset.bought), subscriptions: $$('#cfg-subs .fchip.on').map(b => b.dataset.sub) },
      channels: $('#cfg-channels').value.split(/\s+/).map(x => x.trim()).filter(Boolean),
    } });
    cfgFilled = false; toast('Ajustes salvos. Os totais são recalculados na próxima busca ou verificação.');
  } catch (e) { toast(e.message); }
};
$('#promo-go').onclick = async () => {
  const text = $('#promo-text').value.trim(); if (!text) return toast('Cole o post de promoção');
  const out = $('#promo-out'); out.hidden = false; out.innerHTML = '<span class="muted">Abrindo o link e lendo o preço…</span>';
  try {
    const r = await api('/api/promo', { method: 'POST', body: { text } });
    // r.text é HTML gerado pelo servidor só com texto escapado (o mesmo enviado ao Telegram)
    out.innerHTML = `<div class="promo-msg">${r.text.replace(/\n/g, '<br>')}</div>${r.offer?.totals ? totalsHtml(r.offer) : ''}
      <div class="pc-actions">${r.offer?.title ? '<button type="button" class="btn small" id="promo-fix">📌 Fixar</button>' : ''}${r.offer?.url ? storeLink(r.offer.url, store(r.offer.store)) : ''}</div>`;
    const fx = $('#promo-fix');
    if (fx) fx.onclick = () => openWatchDialog({ name: r.offer.title.slice(0, 80), query: r.offer.title.split(/\s+/).slice(0, 6).join(' '), refPrice: refOf(r.offer), pin: r.offer.url ? { storeId: r.offer.store, url: r.offer.url } : null });
  } catch (e) { out.innerHTML = `<span class="tag err">${esc(e.message)}</span>`; }
};
$('#coupon-list').addEventListener('click', async (e) => {
  const cp = e.target.closest('[data-ccopy]');
  if (cp) { try { await navigator.clipboard.writeText(cp.dataset.ccopy); toast(`Cupom ${cp.dataset.ccopy} copiado: cole no carrinho da loja`); } catch { prompt('Copie o cupom:', cp.dataset.ccopy); } return; }
  const ok = e.target.closest('[data-cok]'), no = e.target.closest('[data-cno]'), del = e.target.closest('[data-cdel]');
  try {
    if (ok) { await api(`/api/coupons/${ok.dataset.cok}`, { method: 'PATCH', body: { status: 'confirmed_by_user' } }); toast('Anotado: o cupom funcionou'); }
    if (no) { await api(`/api/coupons/${no.dataset.cno}`, { method: 'PATCH', body: { status: 'expired' } }); toast('Cupom marcado como expirado'); }
    if (del) { await api(`/api/coupons/${del.dataset.cdel}`, { method: 'DELETE' }); toast('Cupom apagado'); }
  } catch (err) { toast(err.message); }
});
$('#coupon-form').onsubmit = async (e) => {
  e.preventDefault();
  const type = $('#c-type').value;
  try {
    await api('/api/coupons', { method: 'POST', body: {
      store: $('#c-store').value, codes: $('#c-codes').value, type,
      value: type === 'percent' ? Number(String($('#c-value').value).replace(',', '.')) : brlInput($('#c-value').value),
      minOrder: brlInput($('#c-min').value), maxDiscount: brlInput($('#c-max').value),
      appliesTo: $('#c-applies').value ? [$('#c-applies').value] : null,
      expiresAt: $('#c-expires').value || null, productUrl: $('#c-url').value || null,
    } });
    e.target.reset(); toast('Cupom salvo');
  } catch (err) { toast(err.message); }
};

// ================= PROMOÇÕES DOS CANAIS (scroll infinito) =================
const promo = { items: [], offset: 0, hasMore: true, loading: false, loaded: false, total: 0, seq: 0 };
async function loadPromos(reset = false) {
  if (promo.loading && !reset) return;
  if (reset) Object.assign(promo, { items: [], offset: 0, hasMore: true, loaded: true });
  if (!promo.hasMore) return;
  const seq = ++promo.seq;
  promo.loading = true; renderPromos();
  const qs = new URLSearchParams({ offset: promo.offset, limit: 30, store: $('#pf-store').value, q: $('#pf-q').value.trim() });
  try {
    const r = await (await fetch('/api/promos?' + qs)).json();
    if (seq !== promo.seq) return;
    promo.items.push(...r.items); promo.offset += r.items.length; promo.hasMore = r.hasMore; promo.total = r.total;
  } catch { toast('Não consegui carregar as promoções'); promo.hasMore = false; }
  finally { if (seq === promo.seq) { promo.loading = false; renderPromos(); } }
}
const promoObserver = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting)) loadPromos(); }, { rootMargin: '600px 0px' }) : null;
const safeHref = (u) => /^https:\/\//i.test(u ?? '') ? esc(u) : null;

function renderPromos() {
  if (!S) return;
  const ch = S.channels ?? { suggested: [], status: {} };
  const ativos = S.settings?.channels ?? [];
  const st = Object.entries(ch.status ?? {}).filter(([k]) => ativos.includes(k));
  const ok = st.filter(([, v]) => v.ok).length;
  const last = Math.max(0, ...st.map(([, v]) => Date.parse(v.at) || 0));
  $('#count-promo').textContent = ch.promos ?? 0;
  const sel = $('#pf-store');
  if (sel.options.length <= 1) for (const s of S.stores) sel.add(new Option(s.name, s.id));
  $('#ch-summary').innerHTML = !ativos.length
    ? `<p>Nenhum canal ativado.</p><button type="button" class="btn primary" id="ch-enable">Ativar os ${ch.suggested.length} canais sugeridos</button> <small class="muted-i">dá para editar a lista na aba 🎟️ Cupons</small>`
    : `<span><b>${ok}</b> de <b>${ativos.length}</b> canais lidos${last ? ' · última leitura ' + ago(last) : ''}${ch.reading ? ' · <b>lendo agora…</b>' : ''}</span>
       <button type="button" class="btn small" id="ch-read" ${ch.reading ? 'disabled' : ''}>Ler agora</button>`;
  $('#ch-list').innerHTML = ativos.map(c => {
    const v = ch.status?.[c];
    const cls = !v ? 'wait' : v.ok ? 'ok' : v.noPreview ? 'warn' : 'err';
    const txt = !v ? 'aguardando a primeira leitura' : v.ok ? `${v.posts} posts na prévia · ${ago(Date.parse(v.at))}` : v.error;
    return `<div class="ch ${cls}"><a href="https://t.me/${esc(c)}" target="_blank" rel="noopener noreferrer">@${esc(c)}</a><span>${esc(txt)}</span></div>`;
  }).join('') || '<p class="muted">Ative canais para ver a situação de cada um.</p>';

  const card = (p) => {
    const s = p.store ? store(p.store) : null;
    const link = safeHref(p.link), post = safeHref(p.postUrl);
    const kind = p.kind === 'promo' ? 'promoção' : p.kind === 'cupom' ? 'cupom' : 'promoção + cupom';
    return `<article class="promo-card">
      <div class="pc-top"><span class="sdot" style="background:${s?.color ?? 'var(--fg2)'}"></span><b>${esc(s?.name ?? 'loja a confirmar')}</b>
        <span class="muted">@${esc(p.channel)} · ${ago(Date.parse(p.date ?? p.seenAt))}</span>
        <span class="tag ${p.kind === 'promo' ? 'info' : 'warn'}">${kind}</span></div>
      ${p.product ? `<div class="pc-title">${esc(p.product)}</div>` : ''}
      <div class="pc-price">${p.price != null ? `<b>${brl(p.price)}</b>` : ''}${p.oldPrice ? ` <s>${brl(p.oldPrice)}</s>` : ''}${p.price != null ? ' <small class="muted-i">divulgado, não verificado</small>' : ''}</div>
      ${p.coupons?.length ? `<div class="pc-coupons">🎟️ ${p.coupons.map(c => `<code>${esc(c)}</code>`).join(' ou ')}</div>` : ''}
      <div class="pc-actions">
        ${p.product ? `<button type="button" class="btn small" data-pfix="${esc(p.id)}">📌 Fixar</button>` : ''}
        ${link ? `<a class="btn small" href="${link}" target="_blank" rel="noopener noreferrer nofollow">Abrir link ↗</a>` : ''}
        ${post ? `<a class="btn small ghost" href="${post}" target="_blank" rel="noopener noreferrer">Ver post ↗</a>` : ''}
      </div></article>`;
  };
  const filtro = $('#pf-q').value || $('#pf-store').value;
  const empty = !promo.items.length && !promo.loading
    ? `<div class="empty"><h2>Nenhuma promoção ${filtro ? 'com esse filtro' : 'ainda'}</h2><p class="muted">${ativos.length ? 'Os canais são lidos a cada 30 min. Toque em "Ler agora" para buscar já.' : 'Ative os canais sugeridos acima.'}</p></div>` : '';
  $('#promo-feed').innerHTML = promo.items.map(card).join('') + empty +
    (promo.items.length ? `<div class="more" id="promo-sentinel">${promo.loading ? '<span class="muted">Carregando…</span>' : promo.hasMore ? '<button type="button" class="btn" id="promo-more">Mostrar mais</button>' : '<span class="muted">Fim das promoções.</span>'}</div>` : '');
  const sent = $('#promo-sentinel');
  if (sent && promoObserver) { promoObserver.disconnect(); if (promo.hasMore) promoObserver.observe(sent); }
}
{
  let tmr;
  $('#pf-store').onchange = () => loadPromos(true);
  $('#pf-q').oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => loadPromos(true), 350); };
  const enable = async (list) => {
    const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channels: list }) });
    if (!r.ok) return toast((await r.json()).error ?? 'Erro ao salvar');
    toast(`${list.length} canais ativados: lendo agora…`); setTimeout(() => loadPromos(true), 4000);
  };
  document.addEventListener('click', async (e) => {
    if (e.target.id === 'ch-enable') return enable((S.channels?.suggested ?? []).map(c => c.canal));
    if (e.target.id === 'cfg-suggested') { $('#cfg-channels').value = (S.channels?.suggested ?? []).map(c => c.canal).join('\n'); return toast('Lista preenchida: toque em Salvar'); }
    if (e.target.id === 'ch-read') { await fetch('/api/channels/read', { method: 'POST' }); toast('Lendo os canais…'); setTimeout(() => loadPromos(true), 5000); return; }
    if (e.target.id === 'promo-more') return loadPromos();
    const f = e.target.closest('[data-pfix]');
    if (f) {
      const p = promo.items.find(x => x.id === f.dataset.pfix);
      if (p) openWatchDialog({ name: p.product.slice(0, 80), query: p.product.split(/\s+/).slice(0, 6).join(' '), refPrice: p.price, pin: null });
    }
  });
}

// ================= COMPARATIVO =================
// O mesmo produto em todas as lojas e em todos os vendedores dos marketplaces, lado a lado.
// Agrupamento e ordem vêm de src/compare.js e src/ranking.js (os mesmos do servidor).
for (const b of $$('#view button')) {
  b.classList.toggle('on', b.dataset.view === ui.view);
  b.onclick = () => { ui.view = b.dataset.view; lset('view', ui.view); $$('#view button').forEach(x => x.classList.toggle('on', x === b)); ui.shown = 40; renderSearch(); };
}
// ================= POR LOJA (Etapa 3b) =================
// Uma seção por loja com até N produtos de vendedores bem avaliados; ocultos e "sem dados" ficam visíveis à parte.
// A mesma regra do servidor (src/por-loja.js, em /lib/por-loja.js): trocar a ordem ou o filtro não refaz a busca.
const plAbertas = new Set();
function renderPorLojaView() {
  const pl = S.settings?.porLoja ?? {};
  const opts = { refOf, sort: pl.ordem ?? 'melhor', filterOn: pl.soVendedorBom !== false, minScore: pl.notaMinima ?? 70, resultsPerStore: pl.produtosPorLoja ?? 10,
    storeOrder: Object.keys(search.status) };
  const view = porLoja(search.results, search.q, opts);
  if (!plAbertas.size) for (const l of view) plAbertas.add(l.storeId);
  search.cmpIndex = [];
  $('#results').innerHTML = renderPorLoja(view, { esc, brl, refOf, sellerLabel: (o) => sellerLabel({ storeId: o.storeId, seller: o.seller }), storeName: (id) => store(id).name, storeColor: (id) => store(id).color,
    storeLink: (o) => storeLink(linkOf(o), store(o.storeId), search.status[o.storeId]?.url), indexOf: (o) => search.cmpIndex.push(o) - 1,
    status: (id) => search.status[id], sort: opts.sort, filterOn: opts.filterOn, minScore: opts.minScore, abertas: plAbertas });
}
const savePorLoja = async (patch) => {
  S.settings.porLoja = { ...(S.settings.porLoja ?? {}), ...patch }; renderSearch();
  try { await api('/api/settings', { method: 'POST', body: { porLoja: patch } }); } catch (err) { toast(err.message); }
};
$('#results').addEventListener('click', (e) => {
  const ps = e.target.closest('[data-psort]'); if (ps) return savePorLoja({ ordem: ps.dataset.psort });
  const pw = e.target.closest('[data-pwatch]');
  if (pw) { const r = search.cmpIndex[Number(pw.dataset.pwatch)]; openWatchDialog({ name: r.title.slice(0, 80), query: search.q, refPrice: refOf(r), pin: r.url && !store(r.storeId).agregador ? { storeId: r.storeId, url: r.url } : null }); }
});
$('#results').addEventListener('change', (e) => { if (e.target.matches('[data-pfiltro]')) savePorLoja({ soVendedorBom: e.target.checked }); });
$('#results').addEventListener('toggle', (e) => {
  const sec = e.target.closest?.('.ploja'); if (!sec || e.target.parentElement !== sec) return;
  if (e.target.open) plAbertas.add(sec.dataset.store); else plAbertas.delete(sec.dataset.store);
}, true);

function renderCompare(list, best) {
  const visiveis = list.filter(r => (trustOf(r) ?? 100) >= ui.min || r.suspeito);
  const groups = groupOffers(visiveis, { refOf, scoreOf: trustOf });
  const shownGroups = Math.max(8, Math.round(ui.shown / 5));
  search.cmpIndex = [];
  const row = (o, g) => {
    const s = store(o.storeId), i = search.cmpIndex.push(o) - 1, rp = refOf(o);
    const tr = o.trust, sc = trustOf(o);
    const card = o.totals?.card?.total ?? o.price?.card;
    return `<div class="crow ${o === g.best ? 'cbest' : ''} ${o.suspeito || (sc != null && sc < 40) ? 'risky' : ''}">
      <div class="cstore"><span class="chip sm" style="background:${s.color}">${esc(s.name[0])}</span>
        <div class="cwho"><b>${esc(s.name)}</b><small>${esc(sellerLabel(o))}</small></div></div>
      <div class="cscore" title="${esc((tr?.reasons ?? []).join('; '))}">${sc != null ? `<b style="color:${scoreColor(sc)}">${sc}</b><small>${esc(tr?.tier ?? '')}</small>` : '<small>sem nota</small>'}</div>
      <div class="cprice">${rp == null ? '<small>preço não lido</small>' : `<b>${brl(rp)}</b><small>${refKind() === 'pix' ? 'Pix' : 'cartão'}${card != null && card !== rp ? ` · ${brl(card)} cartão` : ''}</small>`}
        ${o.approx ? '<span class="tag info">Parecido</span>' : ''}${o.suspeito ? '<span class="tag warn">Suspeito</span>' : ''}${o.available === false ? '<span class="tag out">Indisponível</span>' : ''}
        ${g.min != null && rp != null && rp > g.min ? `<small class="cdiff">+${brl(rp - g.min)}</small>` : ''}</div>
      <div class="cact"><button type="button" class="btn small" data-cwatch="${i}" title="Fixar">📌</button>${storeLink(linkOf(o), s, search.status[o.storeId]?.url)}</div>
    </div>`;
  };
  search.localMore = groups.length > shownGroups;
  const html = groups.slice(0, shownGroups).map((g, gi) => {
    const top = g.offers.slice(0, 5), rest = g.offers.slice(5);
    return `<article class="cgroup ${g.offers.includes(best) ? 'top1' : ''}">
      <header class="chead"><div class="ctitle">${esc(g.title)}</div>
        <div class="cmeta">${g.stores.length} loja(s) · ${g.sellers} oferta(s) · ${g.min != null ? `${brl(g.min)}${g.max !== g.min ? ' a ' + brl(g.max) : ''}` : 'sem preço'}</div></header>
      ${top.map(o => row(o, g)).join('')}
      ${rest.length ? `<details class="cmore"><summary>Ver mais ${rest.length} vendedor(es)</summary>${rest.map(o => row(o, g)).join('')}</details>` : ''}
    </article>`;
  }).join('');
  const remote = Object.values(search.status).some(s => s.state === 'ok' && s.hasMore);
  const foot = groups.length > shownGroups ? `<div class="more" id="more-sentinel"><button type="button" class="btn" id="more">Mostrar mais produtos</button></div>`
    : search.loadingMore ? '<div class="more" id="more-sentinel"><span class="muted">Buscando mais produtos e vendedores nas lojas…</span></div>'
    : remote && !search.running ? '<div class="more" id="more-sentinel"><button type="button" class="btn" id="more-remote">Buscar mais produtos e vendedores</button></div>'
    : groups.length && !search.running ? '<div class="more"><span class="muted">Fim dos resultados.</span></div>' : '';
  $('#results').innerHTML = html + foot;
  const sentinel = $('#more-sentinel');
  if (sentinel && moreObserver) { moreObserver.disconnect(); moreObserver.observe(sentinel); }
}

// ================= DIAGNÓSTICO DAS LOJAS =================
let lastDiag = null;
function diagText(d) {
  const L = [`SetupSniper ${d.versao}${d.commit ? ' (' + d.commit + ')' : ''} · Node ${d.node} · ${d.sistema}${d.demo ? ' · DEMO' : ''}`,
    `navegador headless: ${d.navegador ? 'sim' : 'não'} · plano B navegador: ${d.browserFallback ? 'ligado' : 'desligado'}`,
    `APIs oficiais: ML ${d.apisOficiais.mercadolivre ? 'sim' : 'não'} · Shopee ${d.apisOficiais.shopee ? 'sim' : 'não'} · AliExpress ${d.apisOficiais.aliexpress ? 'sim' : 'não'}`,
    `busca de teste: "${d.busca}" · ${d.quando}`,
    ...(d.fontesOficiais ?? []).map(f => `fonte oficial ${store(f.loja).name} (${f.nome}): ${f.configurada ? 'configurada' : 'falta ' + f.faltam.join(', ')}`),
    ...(d.telegram ? [`Telegram: ${d.telegram.canais.ok} de ${d.telegram.canais.total} canais lidos sem erro${d.telegram.canais.failing ? ` (${d.telegram.canais.failing} em recuo)` : ''} · ${d.telegram.grupos} grupo(s)/canal(is) com o bot · privacy mode ${d.telegram.privacyMode} · último post ${d.telegram.ultimoPost ? new Date(d.telegram.ultimoPost).toLocaleString('pt-BR') : 'nenhum'}`] : []),
    ...Object.entries(d.pausas ?? {}).map(([id, p]) => `pausa após bloqueio: ${store(id).name} até ${new Date(p.until).toLocaleString('pt-BR')}`), ''];
  for (const l of d.lojas) {
    L.push(`${l.ok ? '✓' : l.bloqueado ? '⛔' : '✕'} ${l.nome}: ${l.ok ? `${l.itens} itens via ${l.fonte}` : l.erro ?? 'nenhum item'} (${l.ms} ms)`);
    for (const t of l.tentativas ?? []) L.push(`    - ${t.via}: ${t.ok ? `${t.n} itens${t.bytes ? `, ${Math.round(t.bytes / 1024)} KB` : ''}` : t.error}`);
  }
  return L.join('\n');
}
$('#diag-go').onclick = async () => {
  const b = $('#diag-go'); b.disabled = true; b.textContent = 'Testando… (até 1 min)';
  $('#diag-out').innerHTML = '';
  try {
    const d = await (await fetch('/api/diagnostico', { method: 'POST' })).json();
    lastDiag = d;
    $('#diag-out').innerHTML = `<div class="diag-grid">${d.lojas.map(l => `
      <div class="dl ${l.ok ? 'ok' : l.bloqueado ? 'blk' : 'err'}"><b>${esc(l.nome)}</b>
        <span>${l.ok ? `${l.itens} itens via ${esc(l.fonte)}` : l.bloqueado ? 'bloqueado' : 'falhou'} · ${l.ms} ms</span>
        ${(l.tentativas ?? []).map(t => `<small>${t.ok ? '✓' : '✕'} ${esc(t.via)}: ${t.ok ? t.n + ' itens' : esc(t.error)}</small>`).join('')}</div>`).join('')}</div>
      ${(d.fontesOficiais ?? []).length ? `<ul class="howto">${d.fontesOficiais.map(f => `<li><b>${esc(store(f.loja).name)}</b> · ${esc(f.nome)}: ${f.configurada ? '✓ configurada' : `falta no .env: <code>${f.faltam.map(esc).join('</code>, <code>')}</code>`}</li>`).join('')}</ul>` : ''}
      ${d.telegram ? `<p class="muted"><b>Telegram:</b> ${d.telegram.canais.ok} de ${d.telegram.canais.total} canais lidos sem erro${d.telegram.canais.failing ? ` (${d.telegram.canais.failing} em recuo)` : ''} · ${d.telegram.grupos} grupo(s)/canal(is) com o bot · privacy mode <b>${esc(d.telegram.privacyMode)}</b> · último post ${d.telegram.ultimoPost ? ago(Date.parse(d.telegram.ultimoPost)) : 'nenhum'}</p>` : ''}
      <p class="muted">Navegador headless neste aparelho: <b>${d.navegador ? 'sim' : 'não'}</b> · APIs oficiais configuradas: ${Object.entries(d.apisOficiais).filter(([, v]) => v).map(([k]) => store(k).name).join(', ') || 'nenhuma'}</p>`;
    $('#diag-copy').hidden = false;
  } catch { toast('O diagnóstico falhou'); }
  finally { b.disabled = false; b.textContent = 'Testar as lojas de novo'; }
};
$('#diag-copy').onclick = async () => {
  if (!lastDiag) return;
  const txt = diagText(lastDiag);
  try { await navigator.clipboard.writeText(txt); toast('Relatório copiado'); }
  catch { const ta = Object.assign(document.createElement('textarea'), { value: txt, rows: 12 }); ta.className = 'diag-txt'; $('#diag-out').append(ta); ta.select(); toast('Selecione e copie o texto'); }
};

// ================= ENVIAR DA LOJA (favorito) =================
// O favorito roda na aba da loja: abre /receber.html deste servidor e entrega o HTML da tela por postMessage
// (só para a origem deste servidor). Funciona mesmo com o site em http, porque não faz requisição da página da loja.
function bookmarkletCode() {
  const O = location.origin;
  return `javascript:(()=>{const O=${JSON.stringify(O)};const w=window.open(O+'/receber.html','setupsniper');if(!w){alert('Permita pop-ups para enviar ao SetupSniper');return}` +
    `const d={type:'setupsniper-capture',url:location.href,title:document.title,html:document.documentElement.outerHTML};let n=0;` +
    `const t=setInterval(()=>{try{w.postMessage(d,O)}catch(e){}if(++n>60)clearInterval(t)},500);` +
    `addEventListener('message',e=>{if(e.origin===O&&e.data&&e.data.type==='setupsniper-ok')clearInterval(t)})})()`;
}
{
  const a = $('#bm-link');
  a.href = bookmarkletCode();
  a.onclick = (e) => { e.preventDefault(); toast('Arraste este botão para a barra de favoritos (no celular, use "Copiar o código")'); };
  $('#bm-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(bookmarkletCode()); toast('Código copiado: cole como endereço de um favorito'); }
    catch { prompt('Copie o código do favorito:', bookmarkletCode()); }
  };
}

// ================= CONTA DO MERCADO LIVRE =================
function renderMl() {
  const m = S?.ml; if (!m) return;
  const box = $('#ml-box');
  if (box.dataset.k === JSON.stringify(m) && box.innerHTML) return;   // não apaga o que a pessoa está digitando
  box.dataset.k = JSON.stringify(m);
  const https = location.protocol === 'https:';
  const retorno = m.redirectUri !== 'https://localhost/setupsniper-ml' ? m.redirectUri : https ? `${location.origin}/auth/ml/callback` : m.redirectUri;
  if (!m.app) {
    box.innerHTML = `<p>Primeiro cadastre o app grátis do Mercado Livre e coloque <code>ML_CLIENT_ID</code> e <code>ML_CLIENT_SECRET</code> no <code>.env</code> do servidor. No app, use como endereço de retorno (redirect URI): <code>${esc(retorno)}</code>${https ? ' (com ele, o login conclui sozinho)' : ''}. Passo a passo em <code>docs/fontes-oficiais.md</code>.</p>`;
    return;
  }
  if (m.connected) {
    box.innerHTML = `<p>✅ Conectado${m.nickname ? ` como <b>${esc(m.nickname)}</b>` : ''}. ${m.renewable ? 'O acesso é renovado sozinho.' : 'Este app não renova o acesso sozinho: conecte de novo quando vencer (ative "offline_access" no app para renovar).'}</p>
      <button type="button" class="btn" id="ml-off">Desconectar</button>`;
    return;
  }
  if (https && retorno.endsWith('/auth/ml/callback')) {
    box.innerHTML = `<p><button type="button" class="btn primary" id="ml-go">Conectar minha conta do Mercado Livre</button></p>
      <p class="muted">Você autoriza no site do Mercado Livre e volta para cá já conectado. O app do Mercado Livre precisa ter <code>${esc(retorno)}</code> como endereço de retorno.</p>`;
    return;
  }
  box.innerHTML = `<ol class="howto">
      <li><button type="button" class="btn primary" id="ml-go">Conectar minha conta do Mercado Livre</button></li>
      <li>Autorize no site do Mercado Livre. Ele vai levar o navegador para <code>${esc(m.redirectUri)}</code> (a página pode nem abrir: tudo bem).</li>
      <li>Copie o endereço inteiro da barra do navegador (tem <code>?code=…</code>) e cole aqui:
        <div class="ml-paste"><input id="ml-code" placeholder="https://…?code=TG-…" autocomplete="off"><button type="button" class="btn" id="ml-done">Concluir</button></div></li>
    </ol>`;
}
document.addEventListener('click', async (e) => {
  if (e.target.id === 'ml-go') {
    const r = await fetch('/api/ml/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: location.origin }) }); const j = await r.json();
    if (!r.ok) return toast(j.error);
    if (j.automatic) location.href = j.url;   // HTTPS: o Mercado Livre devolve direto para cá, sem colar nada
    else window.open(j.url, '_blank', 'noopener');
  }
  if (e.target.id === 'ml-done') {
    const r = await fetch('/api/ml/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: $('#ml-code').value }) });
    const j = await r.json(); toast(r.ok ? 'Conta do Mercado Livre conectada' : j.error);
  }
  if (e.target.id === 'ml-off') { await fetch('/api/ml/disconnect', { method: 'POST' }); toast('Desconectado'); }
});

// ================= APP INSTALADO (PWA) =================
// Instalável pelo navegador (precisa de HTTPS: tailscale serve, ou servidor na nuvem com certificado).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => {});
// Link recebido pelo "Compartilhar" do celular (app da loja → SetupSniper): calcula como um post colado
function receberCompartilhado() {
  const m = location.hash.match(/^#compartilhar=(.*)$/);
  if (!m) return;
  const texto = decodeURIComponent(m[1]);
  history.replaceState(null, '', '/#cupons');
  showTab();
  $('#promo-text').value = texto;
  $('#promo-go').click();
  toast('Link recebido: calculando o total');
}
receberCompartilhado();
addEventListener('hashchange', receberCompartilhado);
