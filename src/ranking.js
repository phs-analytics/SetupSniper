// Ordem padrão das ofertas: os links com preço mais baixo E de vendedores mais confiáveis vêm primeiro.
//
//   1º grupo: com preço, disponíveis, sem "suspeito" e com nota de confiança ≥ 40
//   2º grupo: "Alto risco" (nota < 40) ou preço suspeito: aparecem, mas depois de todas as confiáveis
//   3º grupo: sem preço legível ou indisponíveis
// Dentro de cada grupo: preço ajustado à confiança = preço × (1 + (100 − nota) / 400).
// Nota 100 não muda o preço; nota 60 soma 10%; sem nota conta como 50 (+12,5%).
// A interface (public/app.js) usa a mesma regra.
export const RISK_LIMIT = 40;
export const adjustedPrice = (price, score) => price * (1 + (100 - (score ?? 50)) / 400);

export function rankGroup({ price, score, suspeito = false, available = true }) {
  if (price == null || available === false) return 2;
  if (suspeito || (score != null && score < RISK_LIMIT)) return 1;
  return 0;
}

// Ordena uma cópia. get(o) → { price, score, suspeito, available }
export function rankOffers(list, get) {
  return list.map((o) => ({ o, k: get(o) }))
    .sort((a, b) => rankGroup(a.k) - rankGroup(b.k)
      || adjustedPrice(a.k.price ?? Infinity, a.k.score) - adjustedPrice(b.k.price ?? Infinity, b.k.score)
      || (a.k.price ?? Infinity) - (b.k.price ?? Infinity))
    .map((x) => x.o);
}
