// Histórico de preços na interface: funções puras que devolvem HTML em texto (o app.js só insere).
// Minigráfico em SVG simples e os selos dos indicadores de src/price-history.js. Dinheiro em centavos.
// Testes: tests/historico-ui.test.js. Guia: docs/historico.md.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toMs = (t) => (typeof t === 'number' ? t : Date.parse(t));
const DIA = 864e5;

export function brl(cents) {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
const dataCurta = (ms) => { const d = new Date(ms - 3 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

// Junta pontos de várias lojas num por dia (o menor do dia, no horário de Brasília), para o minigráfico dos Fixados.
export function dailyMin(points) {
  const dias = new Map();
  for (const p of points ?? []) {
    const ms = toMs(p.t);
    if (!Number.isFinite(ms) || !Number.isInteger(p.pix)) continue;
    const dia = new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);
    const cur = dias.get(dia);
    if (!cur || p.pix < cur.pix) dias.set(dia, { t: ms, pix: p.pix });
  }
  return [...dias.values()].sort((a, b) => a.t - b.t);
}

// Minigráfico em degraus (o preço vale até mudar). points: [{ t (ISO ou ms), pix }]. Só mostra o que foi visto.
export function sparklineSvg(points, { width = 120, height = 32, label = 'Histórico de preço' } = {}) {
  const pts = (points ?? []).map((p) => ({ ms: toMs(p.t), pix: p.pix }))
    .filter((p) => Number.isFinite(p.ms) && Number.isInteger(p.pix) && p.pix > 0)
    .sort((a, b) => a.ms - b.ms);
  if (!pts.length) return '<span class="hist-vazio">histórico começando</span>';
  const pad = 3, w = width - pad * 2, h = height - pad * 2;
  const t0 = pts[0].ms, t1 = pts.at(-1).ms, span = t1 - t0 || 1;
  const lo = Math.min(...pts.map((p) => p.pix)), hi = Math.max(...pts.map((p) => p.pix)), range = hi - lo;
  const x = (ms) => +(pad + (pts.length === 1 ? w : ((ms - t0) / span) * w)).toFixed(1);
  const y = (pix) => +(pad + (range ? (1 - (pix - lo) / range) * h : h / 2)).toFixed(1);
  let d = `M${pts.length === 1 ? pad : x(pts[0].ms)} ${y(pts[0].pix)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i].ms)} V${y(pts[i].pix)}`;
  if (pts.length === 1) d += ` H${x(pts[0].ms)}`;
  const min = pts.reduce((a, p) => (p.pix < a.pix ? p : a));   // primeira vez que o menor apareceu
  const ultimo = pts.at(-1);
  const resumo = `${label}: ${pts.length} ${pts.length === 1 ? 'ponto' : 'pontos'} de ${dataCurta(t0)} a ${dataCurta(t1)}; menor ${brl(lo)}, maior ${brl(hi)}, último ${brl(ultimo.pix)}`;
  return `<svg class="hist-spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(resumo)}">` +
    `<title>${esc(resumo)}</title>` +
    `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<circle class="hist-spark-min" cx="${x(min.ms)}" cy="${y(min.pix)}" r="2.2"/>` +
    `<circle class="hist-spark-ultimo" cx="${x(ultimo.ms)}" cy="${y(ultimo.pix)}" r="1.6" fill="currentColor"/>` +
    '</svg>';
}

// Selos dos indicadores (computeIndicators). opts.fonte: 'Keepa' quando a série veio de lá.
export function historyBadges(ind, { fonte } = {}) {
  const fonteTxt = fonte ? ` <span class="hist-fonte">fonte: ${esc(fonte)}</span>` : '';
  if (!ind || ind.estado !== 'ok') return `<span class="hist-badge hist-comecando">histórico começando</span>${fonteTxt}`;
  const out = [`<span class="hist-min90">menor em 90 dias: ${esc(brl(ind.min90))}</span>`];
  if (ind.menor90) out.push('<span class="hist-badge hist-menor">menor preço em 90 dias</span>');
  const f = ind.inflado;
  if (f?.ativo) {
    const dica = `Estimativa pelo histórico visto aqui: antes da queda o preço subiu ${String(f.altaPct).replace('.', ',')}% ` +
      `(de ${brl(f.base)}, o menor dos ${f.janelaDias ?? 30} dias anteriores, para ${brl(f.de)}) e agora está em ${brl(f.atual)}. Critério próprio, não é acusação.`;
    out.push(`<span class="hist-badge hist-inflado" title="${esc(dica)}">preço inflado antes da promoção</span>`);
  }
  return out.join(' ') + fonteTxt;
}
