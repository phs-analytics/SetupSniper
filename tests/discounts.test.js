import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferCouponRule, couponDiscount, applyCoupons, basketOpportunity, isCouponActive, defaultExpiry } from '../src/discounts.js';
import { normalizeOffer } from '../src/offer.js';

const ml = normalizeOffer({ title: 'Monitor Acer Nitro', pix: 608, card: 699, url: 'https://www.mercadolivre.com.br/p/MLB1' }, 'mercadolivre');
const cupom = (x) => ({ id: 'c', store: 'mercadolivre', codes: ['VOLTESEMPRE', 'SEMPREPROMO'], status: 'unverified', ...x });

test('inferCouponRule: R$ 608 → R$ 547 é 10% (o exemplo real)', () => {
  assert.deepEqual(inferCouponRule(60800, 54700), { type: 'percent', value: 10, discount: 6100, inferred: true });
  assert.equal(inferCouponRule(60800, 55000).type, 'fixed');         // 9,5%: não é redondo → valor fixo
  assert.equal(inferCouponRule(60800, 70000), null);                 // anunciado maior que a página
});

test('percentual com teto, valor fixo com mínimo e forma de pagamento', () => {
  assert.equal(couponDiscount(cupom({ type: 'percent', value: 10, maxDiscount: 5000 }), 60800, 'pix').discount, 5000);
  const semMinimo = couponDiscount(cupom({ type: 'fixed', value: 5000, minOrder: 30000 }), 25000, 'pix');
  assert.equal(semMinimo.ok, false);
  assert.equal(semMinimo.missing, 5000);
  assert.equal(couponDiscount(cupom({ type: 'fixed', value: 5000, appliesTo: ['pix'] }), 60800, 'card').ok, false);
  assert.ok(couponDiscount(cupom({ type: 'percent', value: 10 }), 69900, 'card').notes.includes('pode não valer no crédito'));
});

test('perfil: primeira compra e assinantes', () => {
  const c = cupom({ type: 'fixed', value: 2000, conditions: ['first_purchase'] });
  assert.equal(couponDiscount(c, 60800, 'pix', { profile: { boughtAt: ['mercadolivre'] } }).ok, false);
  assert.equal(couponDiscount(c, 60800, 'pix', { profile: {} }).ok, true);
  assert.equal(couponDiscount(cupom({ type: 'fixed', value: 2000, conditions: ['subscriber'] }), 60800, 'pix', { profile: {} }).ok, false);
});

test('empilhamento padrão: 1 cupom por pedido (o de maior desconto)', () => {
  const r = applyCoupons(ml, [cupom({ id: 'a', type: 'fixed', value: 3000 }), cupom({ id: 'b', type: 'percent', value: 10 })], 'pix', 60800);
  assert.equal(r.applied.length, 1);
  assert.equal(r.discount, 6080);
});

test('cupom de outra loja, de outro produto, expirado ou marcado "não funcionou" não vale', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  const lista = [
    cupom({ type: 'fixed', value: 1000, store: 'kabum' }),
    cupom({ type: 'fixed', value: 1000, productUrl: 'https://www.mercadolivre.com.br/p/OUTRO' }),
    cupom({ type: 'fixed', value: 1000, expiresAt: '2026-11-03T11:00:00Z' }),
    cupom({ type: 'fixed', value: 1000, status: 'expired' }),
  ];
  assert.equal(applyCoupons(ml, lista, 'pix', 60800, { now }).applied.length, 0);
  assert.equal(isCouponActive(cupom({}), now), true);
  assert.equal(defaultExpiry('2026-11-03T12:00:00.000Z'), '2026-11-04T12:00:00.000Z');
});

test('oportunidade de carrinho: quanto falta e preço efetivo do item', () => {
  assert.deepEqual(basketOpportunity(25000, { type: 'fixed', value: 5000, minOrder: 30000 }), { missing: 5000, discountOnBasket: 5000, effectiveItemPrice: 20833 });
  assert.equal(basketOpportunity(35000, { type: 'fixed', value: 5000, minOrder: 30000 }), null);
});
