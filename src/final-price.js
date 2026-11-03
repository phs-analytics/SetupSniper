// Valor final por forma de pagamento: Pix e crédito, com cupom, frete e impostos de importação.
// Funções puras, em centavos, testadas em tests/final-price.test.js.
//
// finalTotals(offer, coupons, profile, ctx) → {
//   pix:  { product, coupons: [{ code, discount, notes }], shipping, importTax, icms, total, complete, notes },
//   card: { ...mesmo detalhamento, installments: { n, value, interestFree, total } | null, totalWithInterest },
//   cheaper: 'pix' | 'card' | null, saving
// }
// ctx: { taxes, cepUf, cep, fx, stacking, now }
import { applyCoupons } from './discounts.js';
import { computeImportTax, ufFromCep } from './import-tax.js';
import { formatBRL } from './offer.js';

function totalFor(method, offer, coupons, profile, ctx) {
  const p = offer.price ?? {};
  const notes = [];
  // Base do produto nesta forma de pagamento
  let product = method === 'pix' ? (p.pix ?? p.card) : (p.card ?? p.pix);
  if (product == null && p.installments) product = p.installments.n * p.installments.value;
  if (product == null) return null;
  if (method === 'pix' && p.pix == null) notes.push('Pix não informado: usado o preço do cartão');
  if (method === 'card' && p.card == null && p.pix != null) notes.push('preço no cartão não informado: usado o do Pix');

  // Frete: desconhecido nunca vira zero
  const sh = offer.shipping ?? {};
  let shipping = sh.cost ?? null;

  // Cupons (desconto sobre o produto nesta forma de pagamento)
  const cup = applyCoupons(offer, coupons ?? [], method, product, { profile, stacking: ctx.stacking ?? 1, shippingCost: shipping, now: ctx.now });
  const afterCoupon = product - cup.discount;
  if (cup.freeShipping) shipping = 0;
  if (sh.freeAbove != null && afterCoupon >= sh.freeAbove) shipping = 0;
  if (shipping == null) notes.push('frete não informado');

  // Impostos de importação (só lojas em importTaxStores)
  const uf = ufFromCep(ctx.cep, ctx.cepUf);
  const tax = computeImportTax({ offer, value: afterCoupon, shipping: shipping ?? 0, uf, fx: ctx.fx, taxes: ctx.taxes, date: ctx.now ? new Date(ctx.now) : new Date() });
  notes.push(...tax.notes);

  const importTax = tax.status === 'ok' || tax.status === 'national' || tax.status === 'included' ? tax.ii : null;
  const icms = tax.status === 'ok' || tax.status === 'national' || tax.status === 'included' ? tax.icms : null;
  const total = afterCoupon + (shipping ?? 0) + (importTax ?? 0) + (icms ?? 0);
  const taxPending = tax.status === 'need_fx' || tax.status === 'no_rule' || (tax.status === 'ok' && icms == null);
  return {
    product,
    coupons: cup.applied.map((a) => ({ code: a.coupon.codes.join(' ou '), discount: a.shipping ? 0 : a.discount, freeShipping: !!a.shipping, notes: a.notes, status: a.coupon.status, source: a.coupon.source, sourceName: a.coupon.sourceName, seenAt: a.coupon.seenAt, inferred: !!a.coupon.inferred })),
    couponDiscount: cup.discount,
    shipping,
    importTax,
    icms,
    taxStatus: tax.status,
    taxRule: tax.rule ?? null,
    icmsRate: tax.icmsRate ?? null,
    total,
    complete: shipping != null && !taxPending,
    notes,
  };
}

export function finalTotals(offer, coupons, profile, ctx = {}) {
  const pix = totalFor('pix', offer, coupons, profile, ctx);
  const card = totalFor('card', offer, coupons, profile, ctx);
  if (card) {
    const i = offer.price?.installments;
    if (i) {
      const parcelas = i.n * i.value;
      // Parcelamento com juros (ou parcelas que somam mais que o preço no cartão): vale o total com juros
      const comJuros = i.interestFree === false || (i.interestFree !== true && parcelas > card.product);
      // Sem juros: as parcelas dividem o total final (com cupom, frete e impostos), como no checkout.
      card.installments = comJuros
        ? { n: i.n, value: i.value, interestFree: false, total: parcelas }
        : { n: i.n, value: Math.ceil(card.total / i.n), interestFree: i.interestFree ?? null, total: card.total };
      card.totalWithInterest = comJuros ? card.total - card.product + parcelas : card.total;
      if (comJuros) card.notes.push(`em ${i.n}x o total fica ${formatBRL(parcelas)} com juros`);
    } else {
      card.installments = null;
      card.totalWithInterest = card.total;
    }
  }
  let cheaper = null, saving = 0;
  if (pix && card && pix.total !== card.total) {
    cheaper = pix.total < card.total ? 'pix' : 'card';
    saving = Math.abs(card.total - pix.total);
  }
  return { pix, card, cheaper, saving };
}
