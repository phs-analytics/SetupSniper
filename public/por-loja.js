// Interface do modo "Por loja" (Etapa 3b): uma seção recolhível por loja, com até N produtos de vendedores
// bem avaliados, o grupo "Sem dados do vendedor" e o botão "Mostrar ocultos (N)" com o motivo de cada um.
//
// Função pura: recebe a visão pronta (porLoja() de src/por-loja.js, servida em /lib/por-loja.js, ou vinda
// do servidor) e os helpers do app.js por parâmetro; devolve HTML. Não mexe no DOM nem importa app.js.
// Os botões só têm atributos data-*; quem liga os eventos é o app.js:
//   data-psort="melhor|preco|nota"  troca a ordem
//   data-pfiltro                     liga/desliga "só vendedor bom" (checkbox)
//   data-pwatch="<índice>"           📌 Fixar (índice devolvido por indexOf(oferta))

const ESC = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BRL = (c) => c == null || !Number.isFinite(c) ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const REF = (o) => o?.totals?.pix?.total ?? o?.price?.pix ?? o?.price?.card ?? null;
const SELLER = (o) => { const s = o?.seller; if (!s || (!s.name && !s.id)) return 'vendido pela própria loja'; if (s.official) return `loja oficial ${s.name ?? ''}`.trim(); return s.name ? `vendido por ${s.name}` : 'vendedor do marketplace (nome não informado)'; };
const PALAVRA = (s) => (s >= 85 ? 'confiável' : s >= 70 ? 'bom' : s >= 55 ? 'regular' : s >= 40 ? 'cautela' : 'alto risco');

export const ORDENS = [['melhor', 'Melhor escolha'], ['preco', 'Menor preço'], ['nota', 'Maior nota']];

// view: array de lojas de porLoja(), ou { lojas: [...] }.
// h: { esc, brl, refOf, sellerLabel, storeName(id), storeColor(id), storeLink(o) → HTML, indexOf(o) → nº,
//      status(id) → { state, error, hasMore } (opcional), sort, filterOn, minScore, abertas: Set de lojas abertas }
export function renderPorLoja(view, h = {}) {
  const esc = h.esc ?? ESC, brl = h.brl ?? BRL, refOf = h.refOf ?? REF, sellerLabel = h.sellerLabel ?? SELLER;
  const storeName = h.storeName ?? ((id) => id), storeColor = h.storeColor ?? (() => '#666');
  const lojas = Array.isArray(view) ? view : view?.lojas ?? [];
  const sort = h.sort ?? lojas[0]?.regras?.sort ?? 'melhor';
  const filterOn = h.filterOn ?? lojas[0]?.regras?.filterOn ?? true;
  const minScore = h.minScore ?? lojas[0]?.regras?.minScore ?? 70;

  const nota = (o) => {
    const sc = o?.trust?.score;
    if (sc == null) return '<span class="pnota na"><small>sem nota</small></span>';
    const tip = esc(`Nota de confiança ${sc}/100 (estimativa do SetupSniper, não é certificação)${o.trust.reasons?.length ? '. Motivos: ' + o.trust.reasons.slice(0, 4).join('; ') : ''}`);
    return `<span class="pnota" title="${tip}"><b>${sc}</b> <small>${esc(PALAVRA(sc))}</small></span>`;
  };
  const acoes = (o) => {
    const i = h.indexOf ? h.indexOf(o) : null;
    return `<span class="pact">${i != null ? `<button type="button" class="btn small" data-pwatch="${esc(i)}" title="Fixar">📌</button>` : ''}${h.storeLink ? h.storeLink(o) : o?.url ? `<a class="btn small" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">Ver na loja</a>` : ''}</span>`;
  };
  const linha = (o, g, cls = '') => {
    const rp = refOf(o);
    const risco = o.suspeito || (o.trust?.score != null && o.trust.score < 40);
    return `<div class="prow ${cls} ${risco ? 'risky' : ''}">
      <span class="pwho">${esc(sellerLabel(o))}</span>${nota(o)}
      <span class="pprice">${rp == null ? '<small>preço não lido</small>' : `<b>${brl(rp)}</b>`}${g?.min != null && rp != null && rp > g.min ? ` <small class="cdiff">+${brl(rp - g.min)}</small>` : ''}
        ${o.suspeito ? '<span class="tag warn">Suspeito</span>' : ''}${o.available === false ? '<span class="tag out">Indisponível</span>' : ''}${o.approx ? '<span class="tag info">Parecido</span>' : ''}</span>
      ${acoes(o)}</div>`;
  };
  const card = (g) => `<article class="pcard">
      <header class="ptitle">${esc(g.titulo)}</header>
      ${linha(g.melhor, g, 'pbest')}
      ${g.outros.length ? `<details class="pmore"><summary>Outros ${g.outros.length} ${g.outros.length === 1 ? 'vendedor' : 'vendedores'}</summary>${g.outros.map(o => linha(o, g)).join('')}</details>` : ''}
    </article>`;

  const controles = `<div class="psort" role="group" aria-label="Ordem dos produtos">
      ${ORDENS.map(([k, rot]) => `<button type="button" class="btn small ${k === sort ? 'on' : ''}" data-psort="${k}" aria-pressed="${k === sort}">${rot}</button>`).join('')}
      <label class="pfiltro"><input type="checkbox" data-pfiltro ${filterOn ? 'checked' : ''}> Só vendedor bom (nota ${esc(minScore)}+)</label>
    </div>`;

  const secoes = lojas.map((l) => {
    const c = l.contagem ?? {};
    const st = h.status ? h.status(l.storeId) : null;
    const aberta = h.abertas ? h.abertas.has(l.storeId) : true;
    const vazio = !l.grupos.length
      ? `<p class="muted pvazio">${st?.state === 'error' ? esc(st.error ?? 'a loja não respondeu') : c.semDados || c.ocultos ? 'Nenhum produto com vendedor bom nesta loja. Veja abaixo os sem dados e os ocultos.' : 'Nenhum produto relevante nesta loja.'}</p>` : '';
    const semDados = l.semDados?.length
      ? `<details class="psemdados"><summary>Sem dados do vendedor (${c.semDados ?? l.semDados.length})</summary>
          <p class="muted"><small>Não há dados suficientes do vendedor para dar nota. Não quer dizer que seja ruim: confira na loja.</small></p>
          ${l.semDados.map(card).join('')}</details>` : '';
    const ocultos = l.ocultos?.length
      ? `<details class="pocultos"><summary>Mostrar ocultos (${l.ocultos.length})</summary>
          ${l.ocultos.map(x => `<div class="poculto"><div class="ptitle">${esc(x.oferta.title)}</div>${linha(x.oferta, null)}<small class="pmotivo">${esc(x.motivo)}</small></div>`).join('')}</details>` : '';
    const alem = c.alemDoLimite ? `<p class="muted"><small>+${c.alemDoLimite} ${c.alemDoLimite === 1 ? 'produto' : 'produtos'} além dos ${l.grupos.length} mostrados.</small></p>` : '';
    return `<section class="ploja" data-store="${esc(l.storeId)}">
      <details ${aberta ? 'open' : ''}><summary><span class="chip sm" style="background:${esc(storeColor(l.storeId))}">${esc(String(storeName(l.storeId))[0] ?? '?')}</span>
        <b>${esc(storeName(l.storeId))}</b>: <span class="presumo">${esc(l.resumo ?? '')}</span></summary>
        ${vazio}${l.grupos.map(card).join('')}${alem}${semDados}${ocultos}
      </details></section>`;
  }).join('');

  return controles + (secoes || '<p class="muted">Nenhuma loja respondeu ainda.</p>');
}
