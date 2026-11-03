// Regressão da Fase 1: TODAS as lojas do escopo precisam sair com preço (antes só a primeira saía).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADAPTERS } from '../src/stores.js';
import { normalizeOffer, referencePrice } from '../src/offer.js';
import { cleanResults, collectJsonBlobs, extractFromJson } from '../src/extract.js';
import { parseProductPage } from '../src/scraper.js';

const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const Q = 'Ryzen 7 7800X3D';
const offersOf = (id) => {
  const a = ADAPTERS[id];
  const raw = id === 'shopee' ? a.fromCaptured([JSON.parse(fx('shopee-busca.json'))]) : a.parse(fx(`${id}-busca.html`), a);
  return cleanResults(raw.map((x) => normalizeOffer(x, id)), Q);
};

// Esperado (centavos) por loja: [Pix, cartão]
const ESPERADO = {
  kabum: [184999, 217646],
  pichau: [179990, 211753],
  terabyte: [186990, null],      // a página não diz se as 12x têm juros: o cartão não é inventado
  amazon: [179999, 179999],
  mercadolivre: [211491, 234990],
  magalu: [189900, 229900],
  shopee: [175000, 175000],
  aliexpress: [159950, 159950],
};

for (const [id, [pix, card]] of Object.entries(ESPERADO)) {
  test(`${id}: a oferta sai com Pix e cartão em centavos`, () => {
    const offers = offersOf(id);
    assert.ok(offers.length >= 1, 'nenhuma oferta lida');
    const o = offers[0];
    assert.equal(o.price.pix, pix, 'Pix');
    assert.equal(o.price.card, card, 'cartão');
    if (id === 'terabyte') assert.deepEqual(o.price.installments, { n: 12, value: 18411, interestFree: null });
    assert.ok(referencePrice(o) > 0);
    assert.match(o.url, /^https:\/\//);
  });
}

test('todas as 8 lojas do escopo exibem preço (regressão do "só a primeira loja")', () => {
  const semPreco = Object.keys(ESPERADO).filter((id) => !offersOf(id).some((o) => referencePrice(o) != null));
  assert.deepEqual(semPreco, []);
});

test('o bug: a parcela não é mais tomada como preço', () => {
  const [o] = extractFromJson(collectJsonBlobs(fx('bug-parcela.html')), { base: 'https://loja.com.br' }).map((x) => normalizeOffer(x, 'kabum'));
  assert.equal(o.price.card, 229900);                 // R$ 2.299,00, não a parcela de R$ 229,90
  assert.deepEqual(o.price.installments, { n: 10, value: 22990, interestFree: true });
  assert.equal(referencePrice(o), 229900);
});

test('detalhes extras: parcelas, vendedor oficial, frete grátis, origem e URL canônica', () => {
  const ml = offersOf('mercadolivre')[0];
  assert.deepEqual(ml.price.installments, { n: 10, value: 23499, interestFree: true });
  assert.equal(ml.seller.official, true);
  assert.equal(ml.shipping.cost, 0);
  assert.equal(ml.canonicalUrl, 'https://www.mercadolivre.com.br/processador-amd-ryzen-7-7800x3d/p/MLB22826887');
  const [sh1, sh2] = offersOf('shopee');
  assert.equal(sh1.shipping.origin, 'INTL');
  assert.equal(sh2.shipping.origin, 'BR');
  assert.equal(sh2.seller.official, true);
  assert.equal(offersOf('kabum').find((o) => o.available === false)?.available, false);   // Indisponível, não "sem preço"
});

test('página de produto (link fixado): KaBuM! separa Pix e cartão', () => {
  const o = normalizeOffer(parseProductPage(fx('kabum-produto.html'), 'kabum', 'https://www.kabum.com.br/produto/426262'), 'kabum');
  assert.equal(o.price.pix, 184999);
  assert.equal(o.price.card, 217646);
  assert.equal(o.seller.name, 'KaBuM!');
});

test('página de produto (link fixado): Amazon lê só o bloco principal e as parcelas', () => {
  const o = normalizeOffer(parseProductPage(fx('amazon-produto.html'), 'amazon', 'https://www.amazon.com.br/dp/B0BTZB7F88'), 'amazon');
  assert.equal(o.price.pix, 179999);                    // não pega o R$ 99,90 dos produtos similares
  assert.deepEqual(o.price.installments, { n: 10, value: 18000, interestFree: true });
});

test('página sem preço legível gera "Preço não encontrado nesta página"', () => {
  assert.throws(() => parseProductPage('<html><title>Produto</title></html>', 'kabum', 'https://x'), /Preço não encontrado nesta página/);
});
