// Score de confiabilidade 0–100 de uma loja.
// Pesos: Reclame Aqui 40% · Avaliação da loja 25% · Volume de vendas 20% · Reviews/comentários 15%
export const WEIGHTS = { reclameAqui: 0.40, rating: 0.25, vendas: 0.20, reviews: 0.15 };

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function scoreReclameAqui(ra = {}) {
  if (ra.nota == null) return null;
  const base = 0.40 * ra.nota * 10 + 0.30 * (ra.solucao ?? 0) + 0.20 * (ra.voltaria ?? 0) + 0.10 * (ra.respondidas ?? 0);
  return clamp(base + (ra.ra1000 ? 5 : 0));
}

// Média 1–5 convertida para 0–100, puxada para 50 quando há poucas avaliações.
export function scoreRating(r = {}) {
  if (r.media == null) return null;
  const raw = ((r.media - 1) / 4) * 100;
  const confianca = Math.min(1, Math.log10((r.avaliacoes ?? 0) + 1) / 5); // 100k avaliações = confiança total
  return clamp(50 + (raw - 50) * confianca);
}

// Escala logarítmica: 1 venda = 0, 10 milhões = 100.
export function scoreVendas(vendas) {
  if (vendas == null) return null;
  return clamp((Math.log10(Math.max(1, vendas)) / 7) * 100);
}

export function scoreReviews(pct) {
  return pct == null ? null : clamp(pct);
}

export function computeReliability(store) {
  const parts = {
    reclameAqui: scoreReclameAqui(store.reclameAqui),
    rating: scoreRating(store.rating),
    vendas: scoreVendas(store.vendas),
    reviews: scoreReviews(store.reviewsPositivas),
  };
  // Se faltar algum dado, redistribui o peso entre os disponíveis.
  let sum = 0, wsum = 0;
  for (const [k, v] of Object.entries(parts)) if (v != null) { sum += v * WEIGHTS[k]; wsum += WEIGHTS[k]; }
  const score = wsum ? Math.round(sum / wsum) : 0;
  return {
    score,
    tier: score >= 85 ? 'Excelente' : score >= 70 ? 'Bom' : score >= 55 ? 'Regular' : 'Atenção',
    parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v == null ? null : Math.round(v)])),
    weights: WEIGHTS,
  };
}
