// Recebe a página enviada pelo favorito "Enviar para o SetupSniper" (window.postMessage da aba da loja),
// manda para o servidor (/api/capture) e mostra as ofertas lidas, com o botão de fixar.
import { sellerLabel } from '/lib/compare.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (c) => c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ref = (o) => o.totals?.pix?.total ?? o.price?.pix ?? o.price?.card ?? null;
let recebido = false, items = [], store = null;

function status(html) { $('#rc-status').innerHTML = html; }

addEventListener('message', async (e) => {
  const d = e.data;
  if (recebido || !d || d.type !== 'setupsniper-capture' || typeof d.html !== 'string' || !/^https:\/\//.test(d.url ?? '')) return;
  recebido = true;
  e.source?.postMessage({ type: 'setupsniper-ok' }, e.origin);   // a aba da loja para de reenviar
  status(`<p>Lendo os preços de <b>${esc(new URL(d.url).hostname)}</b>…</p>`);
  try {
    const r = await fetch('/api/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: d.url, html: d.html }) });
    const j = await r.json();
    if (!r.ok) return status(`<p>❌ ${esc(j.error ?? 'não consegui ler esta página')}</p><p class="muted">Funciona em páginas de produto e de busca das lojas do SetupSniper.</p>`);
    items = j.items; store = j.store;
    status(`<p>✅ ${j.items.length} oferta(s) lida(s) da sua tela${j.kind === 'product' ? ' (página de produto)' : ' (busca)'}.${j.atualizados ? ` <b>${j.atualizados} produto(s) fixado(s) atualizado(s).</b>` : ''}</p>
      <p class="muted">Os preços vieram da página que você abriu, sem nenhum acesso automático à loja.</p>`);
    render(d.url);
  } catch { status('<p>❌ Não consegui falar com o servidor do SetupSniper.</p>'); }
});

function render(pageUrl) {
  $('#rc-items').innerHTML = items.slice(0, 60).map((o, i) => `
    <article class="crow rc">
      <div class="cstore"><div class="cwho"><b>${esc(o.title ?? 'Produto')}</b><small>${esc(sellerLabel(o))}</small></div></div>
      <div class="cscore">${o.trust?.score != null ? `<b>${o.trust.score}</b><small>${esc(o.trust.tier ?? '')}</small>` : ''}</div>
      <div class="cprice"><b>${brl(ref(o))}</b><small>${o.totals?.card?.total != null ? 'cartão ' + brl(o.totals.card.total) : ''}</small></div>
      <div class="cact"><button type="button" class="btn small" data-fix="${i}">📌 Fixar</button></div>
    </article>`).join('');
  $('#rc-items').onclick = async (e) => {
    const b = e.target.closest('[data-fix]'); if (!b) return;
    const o = items[Number(b.dataset.fix)];
    b.disabled = true;
    const q = (o.title ?? '').split(/\s+/).slice(0, 6).join(' ');
    const r = await fetch('/api/watch', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: (o.title ?? q).slice(0, 80), query: q, refPrice: ref(o), pin: o.url ? { storeId: store, url: o.url } : null }) });
    b.textContent = r.ok ? '✓ Fixado' : 'Erro';
  };
}

// Aberta sem o favorito: explica como usar
setTimeout(() => { if (!recebido) status(`<p>Nenhuma página recebida.</p><p class="muted">Abra a página de um produto ou de uma busca na loja e toque no favorito <b>Enviar para o SetupSniper</b>. Como instalar: aba <a href="/#lojas">Lojas</a>.</p>`); }, 8000);
