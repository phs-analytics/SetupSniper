// Cupons e descontos. Funções puras, em centavos, testadas em tests/discounts.test.js.
//
// Modelo de cupom (data/coupons.json; exemplo versionado em data/coupons.example.json):
// { id, store, seller, productUrl, codes: ['VOLTESEMPRE','SEMPREPROMO'],
//   type: 'percent'|'fixed'|'shipping'|'progressive'|'cashback'|'unknown',
//   value, minOrder, maxDiscount, appliesTo: ['pix','card']|null,
//   conditions: ['first_purchase','app_only','subscriber','new_account'],
//   announcedPrice, inferred, source, sourceName, sourceUrl, seenAt, expiresAt,
//   status: 'unverified'|'confirmed_by_user'|'expired' }
// Cupons oficiais das redes de afiliados (src/coupon-feed.js) usam o mesmo modelo, mais:
// { origem: 'oficial', rede: 'Awin'|'Lomadee', kind: 'cupom'|'promocao', startsAt, divulgadoEm, lidoEm,
//   verificado, pageUrl, affiliateUrl, title, description, terms, exclusivo, regraDoTexto }
// e a condição 'selected_items' (vale só em parte da loja: não entra sozinho no total).
// Promoção sem código (kind 'promocao') aparece na aba Cupons, mas nunca entra no total.
import { formatBRL } from './offer.js';

// Rótulos para a interface e para o bot
export const SOURCE_LABEL = {
  telegram_forward: 'post encaminhado ao bot',
  telegram_channel: 'canal do Telegram',
  store_page: 'página da loja',
  official_api: 'API oficial',
  manual: 'cadastro manual',
  rea_mapped_public_endpoint: 'endpoint público da loja',
};

export function isCouponActive(c, now = Date.now()) {
  if (!c || c.status === 'expired') return false;
  if (c.expiresAt && Date.parse(c.expiresAt) <= now) return false;
  if (c.startsAt && Date.parse(c.startsAt) > now) return false;   // cupom futuro: ainda não vale
  return true;
}

// Só cupom com código entra no cálculo (promoção sem código já está no preço da página).
export const hasCode = (c) => c?.kind !== 'promocao' && Array.isArray(c?.codes) && c.codes.length > 0;

// O cupom vale para esta oferta? (mesma loja; e mesmo produto/vendedor quando o cupom é específico)
export function couponMatches(c, offer) {
  if (c.store !== offer.store) return false;
  if (c.productUrl && c.productUrl !== offer.canonicalUrl) return false;
  if (c.seller && c.seller !== offer.seller?.id) return false;
  return true;
}

// Perfil local: { boughtAt: ['mercadolivre', ...], subscriptions: ['meli+', ...] }
// Retorna o motivo pelo qual o usuário NÃO tem direito, ou null.
export function eligibilityProblem(c, profile = {}) {
  const conds = c.conditions ?? [];
  const bought = profile.boughtAt ?? [];
  if ((conds.includes('first_purchase') || conds.includes('new_account')) && bought.includes(c.store)) return 'só para a primeira compra na loja';
  if (conds.includes('subscriber') && !(profile.subscriptions ?? []).length) return 'só para assinantes';
  return null;
}

// Desconto de UM cupom sobre uma base (centavos), numa forma de pagamento.
// Retorna { ok, discount, shipping, notes[], missing } — missing = quanto falta para o mínimo.
export function couponDiscount(c, base, method, { profile, shippingCost = null } = {}) {
  const notes = [];
  if (c.appliesTo?.length && !c.appliesTo.includes(method)) return { ok: false, discount: 0, notes: [`não vale no ${method === 'pix' ? 'Pix' : 'cartão'}`] };
  const elig = eligibilityProblem(c, profile);
  if (elig) return { ok: false, discount: 0, notes: [elig] };
  if ((c.conditions ?? []).includes('selected_items') && !c.productUrl) return { ok: false, discount: 0, notes: ['só em itens selecionados: confira na loja se vale para este produto'] };
  if (c.minOrder && base < c.minOrder) return { ok: false, discount: 0, missing: c.minOrder - base, notes: [`pedido mínimo de ${formatBRL(c.minOrder)}`] };
  if (!c.appliesTo?.length && method === 'card') notes.push('pode não valer no crédito');
  if ((c.conditions ?? []).includes('app_only')) notes.push('só no app');
  let discount = 0, shipping = false;
  if (c.type === 'percent' && c.value) discount = Math.round(base * c.value / 100);
  else if (c.type === 'fixed' && c.value) discount = c.value;
  else if (c.type === 'shipping') { shipping = true; discount = shippingCost ?? 0; if (shippingCost == null) notes.push('frete grátis (valor do frete não informado)'); }
  else return { ok: false, discount: 0, notes: ['regra do cupom desconhecida'] };
  if (c.maxDiscount != null) discount = Math.min(discount, c.maxDiscount);
  discount = Math.max(0, Math.min(discount, shipping ? (shippingCost ?? 0) : base));
  return { ok: true, discount, shipping, notes };
}

// Aplica os cupons de uma oferta numa forma de pagamento, respeitando o empilhamento da loja
// (padrão: 1 cupom por pedido → escolhe o de maior desconto). Cada cupom pode ter vários códigos
// ("X OU Y"): eles são alternativas, não somam.
export function applyCoupons(offer, coupons, method, base, { profile, stacking = 1, shippingCost = null, now = Date.now() } = {}) {
  const candidates = coupons
    .filter((c) => hasCode(c) && isCouponActive(c, now) && couponMatches(c, offer))
    .map((c) => ({ coupon: c, ...couponDiscount(c, base, method, { profile, shippingCost }) }));
  const usable = candidates.filter((x) => x.ok && x.discount > 0).sort((a, b) => b.discount - a.discount);
  const applied = [];
  let rest = base;
  for (const x of usable) {
    if (applied.length >= stacking) break;
    if (x.shipping) { applied.push(x); continue; }
    const d = Math.min(x.discount, rest);
    applied.push({ ...x, discount: d });
    rest -= d;
  }
  return {
    applied,
    discount: applied.filter((x) => !x.shipping).reduce((s, x) => s + x.discount, 0),
    freeShipping: applied.some((x) => x.shipping),
    skipped: candidates.filter((x) => !applied.includes(x) && !applied.some((a) => a.coupon === x.coupon)),
  };
}

// Infere a regra de um cupom a partir do preço da página e do preço anunciado no post.
// Ex.: R$ 608 → R$ 547 = 10% (ou R$ 61). Se o percentual for "redondo", assume percentual.
export function inferCouponRule(pagePrice, announcedPrice) {
  if (!pagePrice || !announcedPrice || announcedPrice >= pagePrice) return null;
  const discount = pagePrice - announcedPrice;
  const pct = (discount / pagePrice) * 100;
  const round = Math.round(pct);
  if (round >= 1 && Math.abs(pct - round) <= 0.2) return { type: 'percent', value: round, discount, inferred: true };
  return { type: 'fixed', value: discount, discount, inferred: true };
}

// Oportunidade de carrinho: quanto falta para o pedido mínimo e o preço efetivo do item
// se o carrinho for completado (desconto rateado proporcionalmente ao valor do item).
export function basketOpportunity(itemPrice, c) {
  if (!c?.minOrder || itemPrice >= c.minOrder) return null;
  const missing = c.minOrder - itemPrice;
  const full = couponDiscount({ ...c, minOrder: null, appliesTo: null, conditions: [] }, c.minOrder, 'pix');
  const share = Math.round(full.discount * (itemPrice / c.minOrder));
  return { missing, discountOnBasket: full.discount, effectiveItemPrice: itemPrice - share };
}

// Validade padrão de cupom vindo de canal/post: 24 h (configurável em data/coupon-rules.json)
export function defaultExpiry(seenAt, hours = 24) {
  return new Date(Date.parse(seenAt) + hours * 3600e3).toISOString();
}
