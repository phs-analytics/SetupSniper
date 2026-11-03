// Estado de cada loja num produto fixado. Função pura, testada em tests/monitor.test.js.
//
// Antes da v2.4, uma loja cujas ofertas caíam fora da faixa de preço (por exemplo, porque o
// extrator pegava o valor de uma parcela) ficava sem preço E sem erro: a tela mostrava
// "aguardando" para sempre. Agora toda loja termina com um estado explícito.
import { formatBRL } from './offer.js';

export const STATUS_MSG = {
  no_results: 'Nenhum resultado na busca da loja',
  no_match: 'Nenhum resultado compatível com a busca',
  price_not_found: 'Preço não encontrado nesta página',
  unavailable: 'Indisponível (sem estoque)',
};

// result: { error } | { raw: nº de itens lidos, offers: [ofertas normalizadas, com .suspeito] }
// item:   { minPrice, maxPrice } em centavos (podem ser null)
// refOf:  (oferta) => centavos do preço de referência ou null
export function storeState(result, item, refOf) {
  if (result.error) return { status: 'error', message: result.error, price: null, offer: null };
  const inRange = (o) => { const p = refOf(o); return (!item.minPrice || p >= item.minPrice) && (!item.maxPrice || p <= item.maxPrice); };
  const mine = result.offers ?? [];
  const priced = mine.filter((o) => refOf(o) != null);
  const ok = priced.filter(inRange).filter((o) => o.available !== false)
    .sort((a, b) => (a.suspeito - b.suspeito) || (refOf(a) - refOf(b)));
  let status = 'ok', offer = ok[0] ?? null;
  if (!result.raw) status = 'no_results';
  else if (!mine.length) status = 'no_match';
  else if (!priced.length) { status = 'price_not_found'; offer = mine[0]; }
  else if (!priced.some(inRange)) { status = 'out_of_range'; offer = [...priced].sort((a, b) => refOf(a) - refOf(b))[0]; }
  else if (!ok.length) { status = 'unavailable'; offer = priced.find(inRange); }
  const message = status === 'out_of_range'
    ? `Fora da faixa de preço do produto (${formatBRL(item.minPrice)} a ${formatBRL(item.maxPrice)}): ${formatBRL(refOf(offer))}`
    : STATUS_MSG[status] ?? null;
  return { status, message, price: status === 'ok' ? refOf(offer) : null, offer, count: ok.length };
}
