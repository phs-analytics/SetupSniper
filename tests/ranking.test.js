import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankOffers, adjustedPrice } from '../src/ranking.js';

const ord = (l) => rankOffers(l, (o) => o).map((o) => o.id);

test('mais barato e confiável primeiro; alto risco e suspeito depois; sem preço por último', () => {
  const l = [
    { id: 'semPreco', price: null, score: 90 },
    { id: 'altoRisco', price: 90000, score: 33 },
    { id: 'suspeito', price: 70000, score: 85, suspeito: true },
    { id: 'caroConfiavel', price: 110000, score: 90 },
    { id: 'baratoConfiavel', price: 100000, score: 88 },
    { id: 'indisponivel', price: 50000, score: 90, available: false },
  ];
  const r = ord(l);
  assert.deepEqual(r.slice(0, 2), ['baratoConfiavel', 'caroConfiavel']);
  assert.deepEqual(new Set(r.slice(2, 4)), new Set(['suspeito', 'altoRisco']));
  assert.deepEqual(new Set(r.slice(4)), new Set(['semPreco', 'indisponivel']));
});

test('diferença pequena de preço perde para uma confiança bem maior', () => {
  // R$ 1.000 com nota 55 (ajustado 1.112,50) fica atrás de R$ 1.050 com nota 92 (ajustado 1.071)
  assert.deepEqual(ord([{ id: 'a', price: 100000, score: 55 }, { id: 'b', price: 105000, score: 92 }]), ['b', 'a']);
  // mas uma diferença grande de preço continua valendo
  assert.deepEqual(ord([{ id: 'a', price: 80000, score: 60 }, { id: 'b', price: 105000, score: 95 }]), ['a', 'b']);
  assert.equal(adjustedPrice(100000, 100), 100000);
});
