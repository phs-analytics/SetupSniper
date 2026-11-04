// Link de afiliado: fica guardado à parte, nunca no lugar da URL canônica limpa (decisão já tomada).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOffer } from '../src/offer.js';

test('normalizeOffer guarda affiliateUrl separado e mantém a url limpa', () => {
  const o = normalizeOffer({ title: 'SSD 1TB', price: 'R$ 399,90', url: 'https://www.kabum.com.br/produto/1/ssd?utm_source=x', affiliateUrl: 'https://www.awin1.com/cread.php?awinmid=17729&p=x' }, 'kabum');
  assert.equal(o.url, 'https://www.kabum.com.br/produto/1/ssd?utm_source=x');
  assert.ok(!o.canonicalUrl.includes('awin'));
  assert.equal(o.affiliateUrl, 'https://www.awin1.com/cread.php?awinmid=17729&p=x');
});

test('normalizeOffer descarta affiliateUrl que não é http(s)', () => {
  const o = normalizeOffer({ title: 'SSD', price: 100, url: 'https://loja.com/p', affiliateUrl: 'javascript:alert(1)' }, 'kabum');
  assert.equal(o.affiliateUrl, undefined);
});
