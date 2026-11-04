// Paginação por loja (scroll infinito), catálogo da KaBuM e páginas de verificação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kabumItems, isChallenge } from '../src/stores.js';
import { normalizeOffer } from '../src/offer.js';

test('catálogo da KaBuM: Pix, cartão, link e vendedor parceiro', () => {
  const j = { data: [
    { id: 519870, type: 'product', attributes: { title: 'Placa de Vídeo RTX 4060 Ventus 2X', price: 2199.99, price_with_discount: 1869.99, friendly_name: 'placa-de-video-rtx-4060', images: ['https://img/1.jpg'], available: true } },
    { id: 1, attributes: { title: 'Placa de Vídeo RTX 4060 Parceiro', price: 2100, price_with_discount: 1900, marketplace: { seller_name: 'Loja X' } } },
    { id: 2, attributes: { title: '' } },
  ] };
  const [a, b, ...rest] = kabumItems(j);
  assert.equal(rest.length, 0);
  const o = normalizeOffer(a, 'kabum');
  assert.equal(o.price.pix, 186999);
  assert.equal(o.price.card, 219999);
  assert.equal(o.url, 'https://www.kabum.com.br/produto/519870/placa-de-video-rtx-4060');
  assert.equal(a.seller, null);
  assert.equal(b.seller.name, 'Loja X');
});

test('página de verificação é reconhecida como bloqueio, não como "nenhum resultado"', () => {
  assert.ok(isChallenge('<html><head><title>Just a moment...</title></head><body><div id="cf-chl-widget"></div>'));
  assert.ok(isChallenge('<form action="/errors/validateCaptcha">Digite os caracteres que você vê abaixo</form>'));
  assert.ok(!isChallenge('<html><title>Busca: rtx 4060 | KaBuM!</title><script id="__NEXT_DATA__"></script>'));
});
