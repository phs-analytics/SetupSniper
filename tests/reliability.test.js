import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReliability, scoreVendas, scoreRating } from '../src/reliability.js';
import { readFileSync } from 'node:fs';

test('score fica entre 0 e 100 e tem classificação', () => {
  const r = computeReliability({ reclameAqui: { nota: 8, solucao: 90, voltaria: 75, respondidas: 99 }, rating: { media: 4.6, avaliacoes: 500000 }, vendas: 1e7, reviewsPositivas: 82 });
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(['Excelente', 'Bom', 'Regular', 'Atenção'].includes(r.tier));
});

test('poucas avaliações puxam a nota para o meio', () => {
  assert.ok(scoreRating({ media: 5, avaliacoes: 3 }) < scoreRating({ media: 5, avaliacoes: 100000 }));
  assert.equal(scoreVendas(1e7), 100);
});

test('dados faltando redistribuem o peso', () => {
  const r = computeReliability({ reviewsPositivas: 80 });
  assert.equal(r.score, 80);
});

test('stores.json é válido e toda loja não-comparador tem score', () => {
  const { stores } = JSON.parse(readFileSync(new URL('../data/stores.json', import.meta.url)));
  for (const s of stores) {
    assert.ok(s.id && s.name && s.color, `loja incompleta: ${s.id}`);
    if (!s.agregador) assert.ok(computeReliability(s).score > 0, s.id);
  }
});
