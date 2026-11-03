const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const brl = (v) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const scoreColor = (s) => s >= 85 ? 'var(--good)' : s >= 70 ? 'var(--ok)' : s >= 55 ? 'var(--warn)' : 'var(--bad)';
const ago = (t) => { if (!t) return 'nunca'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`; };
const lget = (k, d) => { try { const v = localStorage.getItem('radar.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lset = (k, v) => { try { localStorage.setItem('radar.' + k, JSON.stringify(v)); } catch {} };

let S = null;                                   // estado do servidor (SSE)
const ui = { sort: lget('sort', 'price'), min: lget('min', 0), hideSus: lget('hideSus', true), deep: lget('deep', false), stores: lget('stores', null), shown: 40 };
const search = { q: '', es: null, status: {}, results: [], running: false };

const store = (id) => S?.stores.find(s => s.id === id) ?? { id, name: id, color: '#666' };
const scoreOf = (id) => store(id).reliability?.score ?? null;
const adjusted = (p, sc) => p * (1 + (100 - (sc ?? 50)) / 400);

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2800); }

// Score de confiabilidade desenhado como carimbo
function ring(score, sm = true) {
  const rot = ((score ?? 7) * 37) % 24 - 12;
  if (score == null) return `<div class="stamp ${sm ? 'sm' : ''} na" style="--r:${rot}deg" title="Comparador: sem score"><b>—</b><span>comparador</span></div>`;
  const word = score >= 85 ? 'certificado' : score >= 70 ? 'aprovado' : score >= 55 ? 'regular' : 'atenção';
  return `<div class="stamp ${sm ? 'sm' : ''}" style="--c:${scoreColor(score)};--r:${rot}deg" title="Confiabilidade ${score}/100"><b>${score}</b><span>${word}</span></div>`;
}
// Código de barras decorativo gerado a partir de um texto (sempre igual para o mesmo texto)
function barcode(seed) {
  let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  let x = 0, bars = '';
  for (let i = 0; i < 38; i++) { h = (h * 1103515245 + 12345) >>> 0; const w = 1 + (h >> 16) % 3; bars += `<rect x="${x}" y="0" width="${w}" height="22"/>`; x += w + 1 + ((h >> 8) % 2); }
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
  const valid = tab === 'monitorados' ? 'fixados' : ['busca', 'fixados', 'lojas', 'alertas'].includes(tab) ? tab : 'busca';
  $$('.tab').forEach(t => t.hidden = t.id !== 'tab-' + valid);
  $$('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === valid));
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
  $('#deep-hint').textContent = S.browser ? 'mais páginas + comparadores + navegador' : 'mais páginas + comparadores';
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
  Object.assign(search, { q, status: {}, results: [], running: true });
  ui.shown = 40;
  const ids = storeFilterIds();
  for (const id of ids) search.status[id] = { state: 'loading' };
  if (location.hash !== '#busca') location.hash = 'busca';
  renderSearch();
  const es = new EventSource(`/api/search?q=${encodeURIComponent(q)}&deep=${ui.deep ? 1 : 0}&stores=${ids.join(',')}`);
  search.es = es;
  es.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'store') {
      search.status[m.storeId] = { state: m.status, n: m.items.length, error: m.error, url: m.searchUrl, ms: m.ms };
      search.results.push(...m.items);
    } else if (m.type === 'done') { search.running = false; es.close(); }
    renderSearch();
  };
  es.onerror = () => { if (search.running) { search.running = false; es.close(); toast('A busca foi interrompida'); renderSearch(); } };
}
$('#search').onsubmit = (e) => { e.preventDefault(); startSearch($('#q').value); };

function flagged(list) {   // mesmo critério do servidor
  const ps = list.map(r => r.price).sort((a, b) => a - b);
  if (ps.length < 5) return list.map(r => ({ ...r, suspeito: false }));
  const med = ps[Math.floor(ps.length / 2)];
  return list.filter(r => r.price >= med * 0.25).map(r => ({ ...r, suspeito: r.price < med * 0.55 }));
}
function sortList(list, priceOf = (o) => o.price) {
  const key = { price: (o) => priceOf(o), score: (o) => -(scoreOf(o.storeId) ?? -1), balance: (o) => adjusted(priceOf(o), scoreOf(o.storeId)) }[ui.sort];
  return list.sort((a, b) => key(a) - key(b) || priceOf(a) - priceOf(b));
}

function renderSearch() {
  const has = !!search.q;
  $('#empty').hidden = has;
  $('#progress').hidden = $('#results-tools').hidden = !has;
  if (!has) { $('#results').innerHTML = ''; $('#results-summary').textContent = ''; return; }

  $('#progress').innerHTML = Object.entries(search.status).map(([id, s]) => {
    const n = store(id).name;
    if (s.state === 'loading') return `<span class="pchip loading">${esc(n)}</span>`;
    if (s.state === 'ok') return `<span class="pchip ok">${esc(n)} <b>${s.n}</b></span>`;
    return `<span class="pchip err" title="${esc(s.error)}"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(n)}: ${esc(shortErr(s.error))} ↗</a></span>`;
  }).join('');

  let list = flagged(search.results);
  const total = list.length, sus = list.filter(r => r.suspeito).length;
  if (ui.hideSus) list = list.filter(r => !r.suspeito);
  list = sortList(list.filter(r => r.available !== false || ui.sort !== 'price'));
  const eligible = list.filter(r => (scoreOf(r.storeId) ?? 100) >= ui.min);
  const best = [...eligible].sort((a, b) => a.price - b.price)[0];
  const storesN = new Set(list.map(r => r.storeId)).size;
  const prices = list.map(r => r.price).sort((a, b) => a - b);
  const med = prices[Math.floor(prices.length / 2)];
  $('#results-summary').innerHTML = total
    ? `<b>${list.length}</b> ofertas de <b>${storesN}</b> lojas para “${esc(search.q)}” · menor <b>${brl(best?.price)}</b> · mediana <b>${brl(med)}</b>${sus ? ` · ${sus} suspeita(s) ${ui.hideSus ? 'ocultas' : 'marcadas'}` : ''}${search.running ? ' · buscando…' : ''}`
    : search.running ? 'Buscando nas lojas…' : `Nenhuma oferta encontrada para “${esc(search.q)}”. Tente termos mais simples (ex.: marca + modelo) ou ative a busca profunda.`;

  $('#results').innerHTML = list.slice(0, ui.shown).map((r, i) => {
    const s = store(r.storeId), sc = scoreOf(r.storeId), below = sc != null && sc < ui.min;
    const tags = [
      r === best ? '<span class="sticker lime">MELHOR PREÇO.</span>' : '',
      r.suspeito ? '<span class="tag warn" title="Muito abaixo da mediana: pode ser golpe, usado ou outro produto">Suspeito</span>' : '',
      r.official ? '<span class="tag info">Oficial</span>' : '',
      r.available === false ? '<span class="tag out">Esgotado</span>' : '',
      s.agregador ? '<span class="tag info">Comparador</span>' : '',
    ].join('');
    const diff = best && r !== best && r.price > best.price ? `<div class="diff">+${brl(r.price - best.price)}</div>` : '';
    return `<div class="res ${r === best ? 'top1' : ''} ${below ? 'dim' : ''}">
      ${r.image ? `<img class="thumb" src="${esc(r.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'thumb',textContent:'${esc(s.name[0])}'}))">` : `<div class="thumb" style="background:${s.color}">${esc(s.name[0])}</div>`}
      <div class="info">${/^https?:\/\//i.test(r.url ?? '') ? `<a class="title" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" title="${esc(r.title)}">${esc(r.title)}</a>` : `<div class="title" title="${esc(r.title)}">${esc(r.title)}</div>`}
        <div class="meta"><span class="sdot" style="background:${s.color}"></span>${esc(s.name)} ${tags}</div>
        <div class="code">${barcode(r.url ?? r.title)}<span>SN-${esc(r.storeId.slice(0, 3).toUpperCase())}-${licenseNo(r.url ?? r.title)}</span></div></div>
      <div class="rscore">${ring(sc)}</div>
      <div class="price"><div class="price">${brl(r.price)}</div>${diff}</div>
      <div class="actions">
        ${pinnedItem(r) ? `<a class="btn small pinned-btn" href="#fixados" title="Já está nos fixados">✓ Fixado</a>` : `<button type="button" class="btn small" data-watch="${i}">📌 Fixar</button>`}
        ${storeLink(r.url, s, search.status[r.storeId]?.url)}
      </div></div>`;
  }).join('') + (list.length > ui.shown ? `<div class="more"><button type="button" class="btn" id="more">Mostrar mais ${list.length - ui.shown}</button></div>` : '');
  search.view = list;
}
// Botão que leva direto à página do produto na loja (ou, sem link direto, à busca da loja)
function storeLink(url, s, fallbackUrl) {
  const safe = (u) => /^https?:\/\//i.test(u ?? '') ? u : null;
  const u = safe(url), f = safe(fallbackUrl);
  const hex = (s.color ?? '#ff5a1f').replace('#', ''), [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  const ink = (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111' : '#fff';   // texto legível sobre a cor da loja
  if (u) return `<a class="btn small shop" href="${esc(u)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" style="--sc:${s.color};--ink:${ink}" aria-label="Ver produto na ${esc(s.name)}">${s.agregador ? 'Ver ofertas' : 'Ver na loja'} ↗</a>`;
  if (f) return `<a class="btn small" href="${esc(f)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" title="Sem link direto: abre a busca da loja">Buscar na loja ↗</a>`;
  return '';
}
const shortErr = (e = '') => /bloqueio/.test(e) ? 'bloqueado' : /Playwright/.test(e) ? 'precisa navegador' : /abort|timeout/i.test(e) ? 'sem resposta' : e.length > 22 ? e.slice(0, 20) + '…' : e;

$('#results').addEventListener('click', (e) => {
  if (e.target.id === 'more') { ui.shown += 40; return renderSearch(); }
  const b = e.target.closest('[data-watch]'); if (!b) return;
  const r = search.view[Number(b.dataset.watch)];
  openWatchDialog({ name: r.title.slice(0, 80), query: search.q, refPrice: r.price, pin: r.url && !store(r.storeId).agregador ? { storeId: r.storeId, url: r.url } : null });
});
for (const b of $$('#sort button')) {
  b.classList.toggle('on', b.dataset.sort === ui.sort);
  b.onclick = () => { ui.sort = b.dataset.sort; lset('sort', ui.sort); $$('#sort button').forEach(x => x.classList.toggle('on', x === b)); renderSearch(); renderWatch(); };
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
  $('#w-target').value = v.target ?? (v.refPrice ? Math.floor(v.refPrice * 0.95) : '');
  $('#w-min').value = v.minPrice ?? (v.refPrice ? Math.round(v.refPrice * 0.5) : '');
  $('#w-max').value = v.maxPrice ?? (v.refPrice ? Math.round(v.refPrice * 2.5) : '');
  $('#w-pin-note').hidden = !v.pin;
  if (v.pin) $('#w-pin-note').textContent = `Na ${store(v.pin.storeId).name}, o servidor vai acompanhar exatamente esta oferta. Nas outras lojas, usa o termo de busca.`;
  dlg.showModal();
}
$('#w-cancel').onclick = () => dlg.close();
$('#watch-form').onsubmit = async (e) => {
  e.preventDefault();
  const body = { name: $('#w-name').value, query: $('#w-query').value, target: $('#w-target').value, minPrice: $('#w-min').value, maxPrice: $('#w-max').value, alerts: $('#w-alerts').checked };
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
    const offers = it.offers.map(o => ({ ...o, sc: scoreOf(o.storeId) }));
    const valid = offers.filter(o => o.price != null && !o.error && !o.suspeito && (o.sc ?? 100) >= S.settings.alerts.minScore);
    const best = [...valid].sort((a, b) => a.price - b.price)[0];
    const hit = best && it.target && best.price <= it.target;
    const rows = sortList([...offers], (o) => o.price ?? Infinity).sort((a, b) => (a.price == null || a.error ? 1 : 0) - (b.price == null || b.error ? 1 : 0)).map(o => {
      const s = store(o.storeId);
      let priceCell;
      if (o.price != null && !o.error) priceCell = `<div class="price">${brl(o.price)}</div><div class="diff ${o === best ? 'isbest' : ''}">${o === best ? 'menor preço' : best ? '+' + brl(o.price - best.price) : ''}${o.suspeito ? ' <span class="tag warn">Suspeito</span>' : ''}</div>`;
      else if (o.error) priceCell = `<span class="tag err" title="${esc(o.error)}">⚠ ${esc(shortErr(o.error))}</span>`;
      else priceCell = `<span class="nolink">${it.checking ? 'buscando…' : 'aguardando'}</span>`;
      return `<div class="row ${o === best ? 'top1' : ''}">
        <div class="store"><div class="chip" style="background:${s.color}">${esc(s.name[0])}</div>
          <div style="min-width:0"><div class="n">${esc(s.name)} ${o.pin ? '<span class="tag info" title="Acompanhando um link fixo">📌</span>' : ''}</div>
          <div class="t" title="${esc(o.title)}">${esc(o.title ?? '')}${o.updatedAt ? ' · ' + ago(o.updatedAt) : ''}</div></div></div>
        <div class="pcell">${priceCell}</div>
        <div class="score">${ring(o.sc, false)}<div class="tier">${s.reliability?.tier ?? ''}</div></div>
        <div class="spk">${sparkline(o.history)}</div>
        <div class="actions">${storeLink(o.url, s, o.searchUrl)}</div>
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
      <div class="scard-head"><div class="chip" style="background:${s.color}">${esc(s.name[0])}</div><div class="n">${esc(s.name)}<div class="tier muted">${r.tier}</div></div>${ring(r.score, false)}</div>
      <div class="bars">${Object.entries(r.parts).map(([k, v]) => `<div class="bar"><span>${labels[k]} <small style="color:var(--dim)">${Math.round(r.weights[k] * 100)}%</small></span><div class="track"><div class="fill" style="width:${v ?? 0}%;background:${scoreColor(v ?? 0)}"></div></div><b>${v ?? '—'}</b></div>`).join('')}</div>
      <div class="facts"><span>RA nota <b>${ra.nota?.toFixed(1) ?? '—'}</b></span><span>Solução <b>${ra.solucao != null ? Math.round(ra.solucao) + '%' : '—'}</b></span><span>Voltaria <b>${ra.voltaria != null ? Math.round(ra.voltaria) + '%' : '—'}</b></span>${ra.ra1000 ? '<span><b style="color:var(--good)">RA1000</b></span>' : ''}<span>★ <b>${s.rating?.media ?? '—'}</b> (${fmt(s.rating?.avaliacoes ?? 0)})</span><span>~<b>${fmt(s.vendas ?? 0)}</b> vendas</span></div>
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
      intervalMin: $('#al-interval').value, monitorStores: $$('#mon-stores .fchip.on').map(b => b.dataset.mon) } });
    alertsFormFilled = false; toast('Regras salvas');
  } catch (e) { toast(e.message); }
};

// ================= GERAL =================
function renderStatus() {
  $('#live').className = 'live ' + (S.refreshing ? 'busy' : 'on');
  $('#live-text').textContent = S.refreshing ? 'Verificando preços…' : `Ao vivo · ${ago(S.lastRefresh)}`;
  $('#demo-banner').hidden = !S.demo;
}
let first = true;
function bestOf(it) {
  return it.offers.filter(o => o.price != null && !o.error && !o.suspeito && (scoreOf(o.storeId) ?? 100) >= S.settings.alerts.minScore).sort((a, b) => a.price - b.price)[0];
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
function render() {
  if (!S) return;
  renderStatus(); renderWatch(); renderPinned(); if (search.q && !search.running) renderSearch(); renderStores(); renderAlerts();
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
