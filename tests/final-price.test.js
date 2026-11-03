import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { finalTotals } from '../src/final-price.js';
import { computeImportTax, ufFromCep } from '../src/import-tax.js';
import { normalizeOffer } from '../src/offer.js';

const cepUf = JSON.parse(readFileSync(new URL('../data/cep-uf.json', import.meta.url), 'utf8'));
// Regras de TESTE (não são as alíquotas oficiais; essas ficam em data/taxes.json)
const TAXES = {
  importTaxStores: ['amazon', 'aliexpress', 'shopee'],
  remessaConforme: { aliexpress: true, shopee: true, amazon: true },
  regras: [
    { id: 'rc-ate-50', remessaConforme: true, faixaUSD: [0, 50], aliquotaII: 0, deducaoUSD: 0, vigenteDesde: '2026-01-01' },
    { id: 'rc-50-3000', remessaConforme: true, faixaUSD: [50.01, 3000], aliquotaII: 0.6, deducaoUSD: 30, vigenteDesde: '2026-01-01' },
  ],
  icms: { SP: { aliquota: 0.2 }, _padrao: { aliquota: 0.17, verificar: true } },
};

test('o exemplo real: Total Pix R$ 547,20 e Total Crédito R$ 629,10 (10x R$ 62,91)', () => {
  const o = normalizeOffer({ title: 'Monitor', pix: 608, card: 699, installments: { n: 10, value: 69.9, interestFree: true }, freeShipping: true, url: 'https://www.mercadolivre.com.br/p/MLB1' }, 'mercadolivre');
  const c = [{ id: '1', store: 'mercadolivre', codes: ['VOLTESEMPRE', 'SEMPREPROMO'], type: 'percent', value: 10, status: 'unverified' }];
  const t = finalTotals(o, c, {}, { taxes: TAXES });
  assert.equal(t.pix.total, 54720);
  assert.equal(t.card.total, 62910);
  assert.deepEqual(t.card.installments, { n: 10, value: 6291, interestFree: true, total: 62910 });
  assert.equal(t.cheaper, 'pix');
  assert.equal(t.saving, 8190);
  assert.equal(t.pix.importTax, null);                 // Mercado Livre é nacional: sem imposto
  assert.equal(t.pix.complete, true);
});

test('frete desconhecido não vira zero e deixa o total incompleto', () => {
  const t = finalTotals(normalizeOffer({ pix: 100, card: 110 }, 'kabum'), [], {}, { taxes: TAXES });
  assert.equal(t.pix.shipping, null);
  assert.equal(t.pix.complete, false);
  assert.ok(t.pix.notes.includes('frete não informado'));
});

test('parcelamento com juros: vale o total com juros', () => {
  const t = finalTotals(normalizeOffer({ card: 1000, installments: { n: 12, value: 100, interestFree: false }, freeShipping: true }, 'kabum'), [], {}, { taxes: TAXES });
  assert.equal(t.card.total, 100000);
  assert.equal(t.card.totalWithInterest, 120000);
});

test('CEP → UF localmente', () => {
  assert.equal(ufFromCep('01001-000', cepUf), 'SP');
  assert.equal(ufFromCep('69301000', cepUf), 'RR');
  assert.equal(ufFromCep('70040-010', cepUf), 'DF');
  assert.equal(ufFromCep('123', cepUf), null);
});

test('imposto só nas lojas de importação; nacional e lojas nacionais ficam de fora', () => {
  const ali = (raw) => normalizeOffer({ price: 200, samePrice: true, ...raw }, 'aliexpress');
  assert.equal(computeImportTax({ offer: ali({ origin: 'BR' }), value: 20000, fx: 5, taxes: TAXES }).status, 'national');
  assert.equal(computeImportTax({ offer: ali({ origin: 'INTL' }), value: 20000, taxes: TAXES }).status, 'need_fx');
  const kab = computeImportTax({ offer: normalizeOffer({ price: 200, origin: 'INTL' }, 'kabum'), value: 20000, fx: 5, taxes: TAXES });
  assert.equal(kab.status, 'not_applicable');
  assert.deepEqual(kab.notes, ['possível importação, imposto não calculado']);
});

test('importado até US$ 50: II zero, só ICMS por dentro', () => {
  // US$ 40 a R$ 5,00 = R$ 200,00 · ICMS SP 20%: 200 / 0,8 × 0,2 = R$ 50,00
  const r = computeImportTax({ offer: normalizeOffer({ price: 200, samePrice: true, origin: 'INTL' }, 'aliexpress'), value: 20000, uf: 'SP', fx: 5, taxes: TAXES });
  assert.equal(r.ii, 0);
  assert.equal(r.icms, 5000);
});

test('importado acima de US$ 50: II de 60% com dedução de US$ 30, frete na base', () => {
  // produto R$ 550 + frete R$ 50 = R$ 600 = US$ 120 · II = 120×0,6−30 = US$ 42 = R$ 210
  // ICMS SP 20% = (600 + 210) / 0,8 × 0,2 = R$ 202,50
  const o = normalizeOffer({ price: 550, samePrice: true, origin: 'INTL', shipping: { cost: 50 } }, 'aliexpress');
  const r = computeImportTax({ offer: o, value: 55000, shipping: 5000, uf: 'SP', fx: 5, taxes: TAXES });
  assert.equal(r.ii, 21000);
  assert.equal(r.icms, 20250);
  const t = finalTotals(o, [], {}, { taxes: TAXES, cep: '01001000', cepUf, fx: 5 });
  assert.equal(t.pix.total, 55000 + 5000 + 21000 + 20250);
});
