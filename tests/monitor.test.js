// Estado de cada loja num produto fixado: nenhuma loja fica sem preço E sem explicação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeState } from '../src/monitor.js';
import { normalizeOffer, referencePrice } from '../src/offer.js';

const ref = (o) => referencePrice(o);
const of = (raw) => ({ ...normalizeOffer({ title: 'Ryzen 7 7800X3D', url: 'https://loja.com.br/p/1', ...raw }, 'kabum'), suspeito: false });
const item = { minPrice: 120000, maxPrice: 500000 };

test('ok: escolhe o menor preço de referência dentro da faixa', () => {
  const st = storeState({ raw: 2, offers: [of({ pix: 1900 }), of({ pix: 1850 })] }, item, ref);
  assert.equal(st.status, 'ok');
  assert.equal(st.price, 185000);
});

test('fora da faixa NÃO some em silêncio (o bug da Fase 1)', () => {
  const st = storeState({ raw: 1, offers: [of({ pix: 229.9 })] }, item, ref);
  assert.equal(st.status, 'out_of_range');
  assert.equal(st.price, null);
  assert.match(st.message, /Fora da faixa/);
  assert.ok(st.offer, 'a oferta continua disponível para o link "Ver na loja"');
});

test('preço não encontrado ≠ indisponível ≠ sem resultados', () => {
  assert.equal(storeState({ raw: 1, offers: [of({})] }, item, ref).status, 'price_not_found');
  assert.equal(storeState({ raw: 1, offers: [of({ pix: 1900, available: false })] }, item, ref).status, 'unavailable');
  assert.equal(storeState({ raw: 0, offers: [] }, item, ref).status, 'no_results');
  assert.equal(storeState({ raw: 3, offers: [] }, item, ref).status, 'no_match');
  assert.equal(storeState({ error: 'HTTP 403 (bloqueio anti-bot)' }, item, ref).status, 'error');
});

test('sem faixa definida, qualquer preço vale', () => {
  assert.equal(storeState({ raw: 1, offers: [of({ pix: 10 })] }, {}, ref).status, 'ok');
});
