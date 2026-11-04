// Aba Ofertas: funções puras que devolvem HTML em texto ou listas (sem DOM, sem rede).
// O app.js só insere o HTML e liga os botões pelos data-*. O servidor (src/offers.js) usa o mesmo filtro.
// Dinheiro em centavos; o formatador vem por parâmetro (h.brl) ou é o do JavaScript (Intl), sem montar vírgula à mão.
// Testes: tests/ofertas-ui.test.js. Guia: docs/ofertas.md.
//
// Botões de cada card (o app.js liga):
//   data-ofixar="<id>"   📌 Fixar (o servidor fixa pelo título e pela URL limpa)
//   <a href=URL limpa>   Ver na loja (só URL https canônica; link de afiliado/encurtado nunca vai aqui)
//   data-ocopiar="<código>"  Copiar cupom (só copia; nada é aplicado na loja)
//   data-ook="<id>" / data-ono="<id>"  ✅ Funcionou / ❌ Não funcionou
//   data-omostrar-outros  mostra as ofertas fora de tecnologia (escondidas por padrão)
//   data-onovas  aviso "N novas ofertas" (o app.js aplica as novas só quando a pessoa toca, sem pular a rolagem)
// Formulário de filtros: <form data-ofiltros> com os campos cupom, categoria, loja, precoMax e outros.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function brl(cents) {
  return Number.isInteger(cents) ? BRL.format(cents / 100).replace(/ /g, ' ') : '—';
}

const PAGAMENTO = { pix: 'no Pix', avista: 'à vista', parcelado: 'parcelado', cartao: 'no cartão' };
export const ORDENS = Object.freeze([['melhor', 'Melhor escolha'], ['preco', 'Menor preço'], ['recentes', 'Mais recentes']]);

// "1.500", "1.500,50", "1500.5" ou "R$ 300" → centavos inteiros (null se vazio ou inválido)
export function reaisParaCentavos(s) {
  if (s == null || s === '') return null;
  if (typeof s === 'number') return Number.isFinite(s) && s > 0 ? Math.round(s * 100) : null;
  let t = String(s).replace(/[^\d.,]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

// Filtros vindos da URL (?cupom=com&categoria=gpu&loja=kabum&precoMax=1500&outros=1) ou do formulário.
// precoMax chega em reais e vira centavos.
export function filtrosDe(obj = {}) {
  const get = (k) => (typeof obj.get === 'function' ? obj.get(k) : obj[k]);
  const cupom = ['com', 'sem'].includes(get('cupom')) ? get('cupom') : '';
  const pm = get('precoMax');
  return {
    cupom,
    categoria: String(get('categoria') ?? '').slice(0, 40),
    loja: String(get('loja') ?? '').slice(0, 40),
    precoMax: reaisParaCentavos(pm),
    outros: ['1', 'true', 'on', true].includes(get('outros')),
    ordem: ORDENS.some(([v]) => v === get('ordem')) ? get('ordem') : 'melhor',
  };
}

// Preço usado em filtro e ordem: o final estimado com cupom, ou o do post.
export const precoRef = (o) => (Number.isInteger(o?.precoFinal) ? o.precoFinal : Number.isInteger(o?.preco) ? o.preco : null);
const temCupom = (o) => (o?.cupom?.codes?.length ?? 0) > 0;

// Filtro puro. "Outros" (fora de tecnologia) só aparece com outros: true ou categoria 'outros'.
export function filtrarOfertas(list, f = {}) {
  return (list ?? []).filter((o) => {
    if (!o) return false;
    if (f.categoria === 'outros') { if (o.tech) return false; }
    else {
      if (!o.tech && !f.outros) return false;
      if (f.categoria && o.categoria !== f.categoria) return false;
    }
    if (f.cupom === 'com' && !temCupom(o)) return false;
    if (f.cupom === 'sem' && temCupom(o)) return false;
    if (f.loja && o.loja !== f.loja) return false;
    if (f.precoMax != null) { const p = precoRef(o); if (p == null || p > f.precoMax) return false; }
    return true;
  });
}
export const contarOutros = (list) => (list ?? []).filter((o) => o && !o.tech).length;

// ---------- aviso de ofertas novas (SSE) ----------
// O app.js guarda as ofertas que chegaram por SSE em "pendentes" e mostra só o aviso, sem mexer na lista
// (a rolagem não pula). Ao tocar no aviso, junta as pendentes e volta ao topo da aba.
export function novasPendentes(atuais, recebidas) {
  const vistos = new Set((atuais ?? []).map((o) => o.id));
  return (recebidas ?? []).filter((o) => o && !vistos.has(o.id));
}
export function avisoNovas(n) {
  if (!Number.isInteger(n) || n <= 0) return '';
  const txt = n === 1 ? '1 nova oferta' : `${n} novas ofertas`;
  return `<button type="button" class="of-novas" data-onovas aria-live="polite">↑ ${txt}: toque para ver</button>`;
}

// ---------- textos ----------
export function haQuanto(iso, now = Date.now()) {
  const t = typeof iso === 'number' ? iso : Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((now - t) / 60e3));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

export function vistoEmTexto(o) {
  const n = o?.vistoEm ?? 1;
  if (n <= 1) { const f = o?.fontes?.[0]; return f?.sourceName ? `divulgado por ${f.sourceName}` : ''; }
  return `visto em ${n} ${o?.origem === 'telegram' ? 'canais' : 'fontes'}`;
}

const palavraNota = (s) => (s >= 85 ? 'confiável' : s >= 70 ? 'bom' : s >= 55 ? 'regular' : s >= 40 ? 'cautela' : 'alto risco');

function regraCurta(c, fmt) {
  if (!c) return '';
  let r = '';
  if (c.type === 'percent' && c.value) r = `${String(c.value).replace('.', ',')}%${c.maxDiscount ? ` até ${fmt(c.maxDiscount)}` : ''}`;
  else if (c.type === 'fixed' && c.value) r = `${fmt(c.value)} OFF`;
  else if (c.type === 'shipping') r = 'frete grátis';
  else return 'regra não informada no post';
  if (c.minOrder) r += `, mínimo ${fmt(c.minOrder)}`;
  if (c.appliesTo?.length === 1) r += c.appliesTo[0] === 'pix' ? ', só no Pix' : ', só no cartão';
  return r;
}

const linkSeguro = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : null);
const linkInterno = (u) => (typeof u === 'string' && (/^#[\w\-=&?%.+]*$/.test(u) || /^\/[\w\-/=&?%.+]*$/.test(u) || /^https:\/\//i.test(u)) ? u : null);

// ---------- card de uma oferta ----------
// h: { brl, now, lojaNome(id), lojaCor(id), fixados: Set<id> }
export function ofertaCard(o, h = {}) {
  const fmt = h.brl ?? brl;
  const now = h.now ?? Date.now();
  const loja = o.loja ? (h.lojaNome?.(o.loja) ?? o.loja) : 'loja a confirmar';
  const cor = o.loja ? h.lojaCor?.(o.loja) : null;
  const acabou = o.status === 'pode_ter_acabado';
  const risco = o.risco === true || o.suspeito === true;
  const cls = ['of-card', acabou ? 'of-acabou' : '', risco ? 'of-risco' : '', o.tech ? '' : 'of-outros'].filter(Boolean).join(' ');
  const id = esc(o.id);

  const topo = [
    `<span class="of-loja"${cor && /^#[0-9a-f]{3,8}$/i.test(cor) ? ` style="--of-cor:${cor}"` : ''}>${esc(loja)}</span>`,
    `<span class="of-cat">${esc(o.categoriaNome ?? o.categoria ?? '')}</span>`,
    vistoEmTexto(o) ? `<span class="of-visto">${esc(vistoEmTexto(o))}</span>` : '',
    `<span class="of-quando">${esc(haQuanto(o.ultimaVez ?? o.at, now))}</span>`,
  ].filter(Boolean).join('');

  const nome = o.titulo ? esc(o.titulo) : (o.tipo === 'cupom' ? 'Cupom de loja' : 'Produto sem nome no post');

  // Preço anunciado (como veio) e preço final estimado com o cupom (sempre como estimativa)
  let precos = '';
  if (Number.isInteger(o.preco)) {
    const pg = o.pagamento ? ` ${PAGAMENTO[o.pagamento] ?? ''}` : '';
    const parc = o.parcelas ? ` <small class="of-parc">${o.parcelas.n}x de ${esc(fmt(o.parcelas.valor))}${o.parcelas.semJuros === true ? ' sem juros' : o.parcelas.semJuros === false ? ' com juros' : ''}</small>` : '';
    precos += `<div class="of-anunciado"><small>preço anunciado${esc(pg)}</small><b>${esc(fmt(o.preco))}</b>${Number.isInteger(o.precoDe) && o.precoDe > o.preco ? ` <s title="preço &quot;de&quot; do post">${esc(fmt(o.precoDe))}</s>` : ''}${parc}</div>`;
    if (temCupom(o)) {
      if (o.precoJaComCupom) precos += `<div class="of-final"><small>o post diz que já é com cupom</small><b>${esc(fmt(o.preco))}</b></div>`;
      else if (Number.isInteger(o.precoFinal) && o.precoFinal !== o.preco) precos += `<div class="of-final"><small>preço final estimado com cupom</small><b>${esc(fmt(o.precoFinal))}</b><small class="of-est">estimativa: confira o total na loja</small></div>`;
      else precos += `<div class="of-final of-sem-est"><small>preço final com cupom</small><b>não estimado</b>${o.precoFinalNota ? `<small class="of-est">${esc(o.precoFinalNota)}</small>` : ''}</div>`;
    }
  } else if (o.tipo === 'cupom') {
    precos = '<div class="of-anunciado"><small>cupom para a loja</small><b>sem preço</b></div>';
  }

  let cupom = '';
  if (temCupom(o)) {
    const codes = o.cupom.codes.map((c) => `<code>${esc(c)}</code>`).join(' ou ');
    const oficial = o.cupom.origem === 'oficial';
    const rot = o.cupom.rotulo ?? (oficial ? 'cupom oficial' : 'cupom divulgado, não verificado');
    cupom = `<div class="of-cupom">🎟️ ${codes} <span class="of-regra">${esc(regraCurta(o.cupom, fmt))}</span>` +
      ` <span class="of-rotulo ${oficial ? 'oficial' : 'divulgado'}">${esc(rot)}</span>` +
      (o.cupom.detalhe ? ` <small class="of-detalhe">${esc(o.cupom.detalhe)}</small>` : '') + '</div>';
  }

  const selos = [];
  const hi = o.historico;
  if (hi?.estado === 'ok') {
    if (Number.isInteger(hi.min90)) selos.push(`<span class="of-selo">menor em 90 dias: ${esc(fmt(hi.min90))}</span>`);
    if (o.menor90) selos.push('<span class="of-selo bom">menor preço em 90 dias</span>');
    if (hi.inflado?.ativo) selos.push('<span class="of-selo ruim" title="o preço &quot;de&quot; subiu pouco antes da promoção">preço inflado antes da promoção</span>');
  } else if (hi) selos.push('<span class="of-selo neutro">histórico começando</span>');
  if (Number.isInteger(o.confianca)) selos.push(`<span class="of-selo ${o.confianca < 40 ? 'ruim' : 'neutro'}">nota ${o.confianca}: ${palavraNota(o.confianca)} (est.)</span>`);
  if (o.suspeito) selos.push('<span class="of-selo ruim">preço suspeito: bom demais para ser verdade</span>');
  if (o.linkStatus === 'a_resolver') selos.push('<span class="of-selo neutro">link a resolver</span>');

  const aviso = acabou ? `<p class="of-aviso">⚠️ pode ter acabado${o.motivoStatus ? `: ${esc(o.motivoStatus)}` : ''}</p>` : '';

  const url = linkSeguro(o.url);
  const comp = linkInterno(o.comparativoUrl);
  const fixado = h.fixados?.has?.(o.id);
  const acoes = [
    o.titulo ? `<button type="button" class="btn small" data-ofixar="${id}"${fixado ? ' disabled' : ''}>📌 ${fixado ? 'Fixado' : 'Fixar'}</button>` : '',
    url ? `<a class="btn small" href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">Ver na loja ↗</a>` : '',
    ...(o.cupom?.codes ?? []).slice(0, 2).map((c) => `<button type="button" class="btn small" data-ocopiar="${esc(c)}">Copiar ${esc(c)}</button>`),
    comp ? `<a class="btn small ghost" href="${esc(comp)}">Ver nas outras lojas</a>` : '',
    `<button type="button" class="btn small ghost" data-ook="${id}" title="Funcionou para você">✅ Funcionou</button>`,
    `<button type="button" class="btn small ghost" data-ono="${id}" title="Não funcionou ou acabou">❌ Não funcionou</button>`,
  ].filter(Boolean).join('');

  return `<article class="${cls}" data-oid="${id}">` +
    `<div class="of-top">${topo}</div>` +
    `<h3 class="of-nome">${nome}</h3>` +
    (precos ? `<div class="of-precos">${precos}</div>` : '') +
    cupom +
    (selos.length ? `<div class="of-selos">${selos.join('')}</div>` : '') +
    aviso +
    `<div class="of-acoes">${acoes}</div></article>`;
}

// ---------- barra de filtros ----------
// h.categorias: [{ id, nome }]; h.lojas: [{ id, nome }]; f: filtros atuais (precoMax em centavos)
export function renderFiltros(f = {}, h = {}) {
  const opt = (v, txt, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(txt)}</option>`;
  const cats = (h.categorias ?? []).map((c) => opt(c.id, c.nome, f.categoria === c.id)).join('');
  const lojas = (h.lojas ?? []).map((l) => opt(l.id, l.nome, f.loja === l.id)).join('');
  const pm = Number.isInteger(f.precoMax) ? String(f.precoMax / 100) : '';   // valor numérico do campo (sem formatação)
  const ordem = ORDENS.map(([v, t]) => opt(v, t, (h.ordem ?? f.ordem ?? 'melhor') === v)).join('');
  return `<form class="of-filtros" data-ofiltros role="search" aria-label="Filtrar ofertas">` +
    `<select name="cupom" aria-label="Cupom">${opt('', 'Com e sem cupom', !f.cupom)}${opt('com', 'Só com cupom', f.cupom === 'com')}${opt('sem', 'Só sem cupom', f.cupom === 'sem')}</select>` +
    `<select name="categoria" aria-label="Categoria">${opt('', 'Todas as categorias', !f.categoria)}${cats}${opt('outros', 'Outros (fora de tecnologia)', f.categoria === 'outros')}</select>` +
    `<select name="loja" aria-label="Loja">${opt('', 'Todas as lojas', !f.loja)}${lojas}</select>` +
    `<input name="precoMax" inputmode="decimal" placeholder="Preço máximo (R$)" aria-label="Preço máximo em reais" value="${esc(pm)}">` +
    `<select name="ordem" aria-label="Ordem">${ordem}</select>` +
    `</form>`;
}

// ---------- aba inteira ----------
// list: ofertas já ordenadas pelo servidor (GET /api/offers). h: { brl, now, filtros, categorias, lojas, ordem,
// lojaNome, lojaCor, fixados, novas (número de pendentes), semFiltros }
export function renderOfertas(list, h = {}) {
  const f = h.filtros ?? {};
  const todas = list ?? [];
  const vis = filtrarOfertas(todas, f);
  const outros = f.outros || f.categoria === 'outros' ? 0 : contarOutros(filtrarOfertas(todas, { ...f, outros: true, categoria: '' }).filter((o) => !o.tech));
  const partes = [];
  if (!h.semFiltros) partes.push(renderFiltros(f, h));
  partes.push(`<div class="of-aviso-novas">${avisoNovas(h.novas ?? 0)}</div>`);
  partes.push('<p class="of-legenda">Preço anunciado é o divulgado na fonte. Preço final com cupom é uma <b>estimativa</b> (um cupom por pedido); o SetupSniper nunca aplica cupom: confira o total na loja.</p>');
  if (!vis.length) {
    partes.push(`<div class="of-vazio">${todas.length ? 'Nenhuma oferta com esses filtros.' : 'Nenhuma oferta de tecnologia ainda. Elas chegam sozinhas dos canais do Telegram, dos cupons oficiais e das APIs.'}</div>`);
  } else {
    partes.push(`<div class="of-lista">${vis.map((o) => ofertaCard(o, h)).join('')}</div>`);
  }
  if (outros > 0) partes.push(`<button type="button" class="btn small ghost of-mostrar-outros" data-omostrar-outros>Mostrar ${outros} ${outros === 1 ? 'oferta' : 'ofertas'} fora de tecnologia</button>`);
  return `<div class="ofertas">${partes.join('')}</div>`;
}
