import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOffer, referencePrice, priceStatus, toCents, formatBRL, canonicalUrl } from '../src/offer.js';

test('toCents converte reais (número e texto pt-BR) em centavos inteiros', () => {
  assert.equal(toCents(1849.99), 184999);
  assert.equal(toCents('R$ 1.849,99'), 184999);
  assert.equal(toCents('1.234'), 123400);
  assert.equal(toCents(0.1 + 0.2), 30);          // sem erro de ponto flutuante
  assert.equal(toCents(''), null);
  assert.equal(toCents(-5), null);
});

test('formatBRL formata centavos', () => {
  assert.equal(formatBRL(54720).replace(/\s/g, ' '), 'R$ 547,20');
  assert.equal(formatBRL(null), '—');
});

test('schema: Pix, cartão e parcelas em centavos', () => {
  const o = normalizeOffer({ title: 'X', pix: 608, card: 699, installments: { n: 10, value: 69.9, interestFree: true }, url: 'https://meli.la/x' }, 'mercadolivre');
  assert.deepEqual(o.price, { pix: 60800, card: 69900, installments: { n: 10, value: 6990, interestFree: true }, currency: 'BRL', taxesIncluded: null });
  assert.equal(o.store, 'mercadolivre');
  assert.match(o.fetchedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('samePrice preenche Pix e cartão; "price" sozinho vira cartão', () => {
  assert.deepEqual([normalizeOffer({ price: 100, samePrice: true }, 'amazon').price.pix, normalizeOffer({ price: 100, samePrice: true }, 'amazon').price.card], [10000, 10000]);
  const o = normalizeOffer({ price: 100 }, 'kabum');
  assert.equal(o.price.pix, null);
  assert.equal(o.price.card, 10000);
});

test('rótulos trocados (Pix maior que o cartão) são corrigidos', () => {
  const o = normalizeOffer({ pix: 699, card: 608 }, 'kabum');
  assert.equal(o.price.pix, 60800);
  assert.equal(o.price.card, 69900);
});

test('sem cartão, parcelas sem juros viram o preço no cartão', () => {
  const o = normalizeOffer({ pix: 1869.9, installments: { n: 12, value: 184.11, interestFree: true } }, 'terabyte');
  assert.equal(o.price.card, 12 * 18411);
});

test('referência: Pix por padrão, cartão quando configurado, parcelas como último recurso', () => {
  const o = normalizeOffer({ pix: 608, card: 699 }, 'mercadolivre');
  assert.equal(referencePrice(o), 60800);
  assert.equal(referencePrice(o, 'card'), 69900);
  assert.equal(referencePrice(normalizeOffer({ card: 699 }, 'x')), 69900);
  assert.equal(referencePrice(normalizeOffer({ installments: { n: 10, value: 70 } }, 'x')), 70000);
});

test('estado do preço: não encontrado ≠ indisponível', () => {
  assert.equal(priceStatus(normalizeOffer({ title: 'X', url: 'https://a.b/c' }, 'kabum')), 'not_found');
  assert.equal(priceStatus(normalizeOffer({ price: 10, available: false }, 'kabum')), 'unavailable');
  assert.equal(priceStatus(normalizeOffer({ price: 10 }, 'kabum')), 'ok');
});

test('URL canônica sem rastreamento/afiliado; URLs perigosas são descartadas', () => {
  assert.equal(canonicalUrl('https://www.mercadolivre.com.br/p/MLB1?matt_tool=99&utm_source=x#polycard'), 'https://www.mercadolivre.com.br/p/MLB1');
  const o = normalizeOffer({ url: 'javascript:alert(1)', image: 'http://inseguro/p.jpg' }, 'kabum');
  assert.equal(o.url, null);
  assert.equal(o.image, null);
});

test('vendedor e frete', () => {
  const o = normalizeOffer({ seller: { id: 5, name: 'Loja X', official: true }, freeShipping: true, origin: 'INTL' }, 'shopee');
  assert.deepEqual(o.seller, { id: '5', name: 'Loja X', url: null, official: true, cnpj: null });
  assert.deepEqual(o.shipping, { cost: 0, origin: 'INTL', freeAbove: null });
  assert.equal(normalizeOffer({}, 'x').shipping.cost, null);   // frete desconhecido nunca vira zero
});
