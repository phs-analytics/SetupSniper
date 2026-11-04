// Testes do extrator de produtos e dos adaptadores (com páginas de exemplo, sem internet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADAPTERS } from '../src/stores.js';
import { cleanResults, flagOutliers, relevance, queryTokens, normalize } from '../src/extract.js';
import { parseBRL } from '../src/scraper.js';
import { normalizeOffer } from '../src/offer.js';

const Q = 'Ryzen 7 7800X3D';
const parse = (id, html) => cleanResults(ADAPTERS[id].parse(html, ADAPTERS[id]).map((x) => normalizeOffer(x, id)), Q);
const nextData = (obj) => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(obj)}</script>`;

test('parseBRL entende formatos brasileiros', () => {
  assert.equal(parseBRL('R$ 2.199,90'), 2199.9);
  assert.equal(parseBRL('2199.90'), 2199.9);
  assert.equal(parseBRL('1.234'), 1234);
  assert.equal(parseBRL(''), null);
});

test('relevância: "rtx 4060" encontra "RTX4060" e "rtx" não casa no meio de outra palavra', () => {
  assert.equal(relevance('Placa de Vídeo RTX4060 8GB', queryTokens('rtx 4060')), 1);
  assert.equal(relevance('Placa de Vídeo Gigabyte artx 4060', queryTokens('rtx 4060')), 0.5);
});

test('normalize junta número e unidade e tira acentos', () => {
  assert.equal(normalize('Memória 16 GB 5600 MHz'), 'memoria 16gb 5600mhz');
  assert.deepEqual(queryTokens('SSD de 1 TB'), ['ssd', '1tb']);
  assert.equal(relevance('Processador AMD Ryzen 7 7800X3D', queryTokens(Q)), 1);
});

test('KaBuM: JSON dentro de string no __NEXT_DATA__, preço PIX e link montado', () => {
  const html = nextData({ props: { pageProps: { data: JSON.stringify({ catalogServer: { data: [
    { code: 426262, name: 'Processador AMD Ryzen 7 7800X3D, AM5', price: 2176.46, priceWithDiscount: 1849.99, friendlyName: 'processador-amd-ryzen-7-7800x3d' },
  ] } }) } } });
  const [r] = parse('kabum', html);
  assert.equal(r.price.pix, 184999);
  assert.equal(r.price.card, 217646);
  assert.equal(r.url, 'https://www.kabum.com.br/produto/426262/processador-amd-ryzen-7-7800x3d');
});

test('Magalu: preço aninhado (price.bestPrice) e link relativo', () => {
  const html = nextData({ props: { pageProps: { data: { search: { products: [
    { title: 'Processador AMD Ryzen 7 7800X3D', path: 'processador/p/abc123def/in/pcam/', price: { bestPrice: '1899.00', fullPrice: '2299.00' } },
  ] } } } } });
  const [r] = parse('magalu', html);
  assert.equal(r.price.pix, 189900);
  assert.equal(r.price.card, null);              // fullPrice é o preço "de" (riscado), não o do cartão
  assert.match(r.url, /^https:\/\/www\.magazineluiza\.com\.br\/processador\/p\//);
});

test('Amazon: bloco de resultado com ASIN', () => {
  const html = `<div data-component-type="s-search-result" data-asin="B0BTZB7F88"><h2 aria-label="AMD Ryzen 7 7800X3D 8 núcleos"></h2><span class="a-offscreen">R$&nbsp;1.799,99</span></div>`;
  const [r] = parse('amazon', html);
  assert.equal(r.price.pix, 179999);
  assert.equal(r.price.card, 179999);
  assert.equal(r.url, 'https://www.amazon.com.br/dp/B0BTZB7F88');
});

test('Mercado Livre: usa o preço atual, não o riscado', () => {
  const html = `<div class="poly-card"><a href="https://www.mercadolivre.com.br/p/MLB1" class="poly-component__title">Processador AMD Ryzen 7 7800X3D</a><s><span class="andes-money-amount__fraction">2.500</span></s><div class="poly-price__current"><span class="andes-money-amount__fraction">2.349</span><span class="andes-money-amount__cents">90</span></div></div>`;
  const [r] = parse('mercadolivre', html);
  assert.equal(r.price.card, 234990);
});

test('AliExpress: objeto JavaScript com chaves sem aspas', () => {
  const html = `<script>window._dida_config_._init_data_= { data: {"x":{"content":[{"productId":"1005","title":{"displayTitle":"AMD Ryzen 7 7800X3D CPU"},"prices":{"salePrice":{"minPrice":1599.5}}}]}} }</script>`;
  const [r] = parse('aliexpress', html);
  assert.equal(r.price.pix, 159950);
  assert.equal(r.url, 'https://pt.aliexpress.com/item/1005.html');
});

test('Terabyte: plano B pelo HTML dos cartões', () => {
  const html = `<a href="https://www.terabyteshop.com.br/produto/23859/ryzen" title="Processador AMD Ryzen 7 7800X3D"></a><span>R$ 1.869,90</span>`;
  const [r] = parse('terabyte', html);
  assert.equal(r.price.card, 186990);
});

test('acessórios e links perigosos são descartados', () => {
  const items = [
    { title: 'Cooler para Ryzen 7 7800X3D', price: 99, url: 'https://x.com/a' },
    { title: 'Processador Ryzen 7 7800X3D', price: 1800, url: 'javascript:alert(1)' },
  ].map((x) => normalizeOffer(x, 'kabum'));
  const out = cleanResults(items, Q);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, null);
});

test('preços muito abaixo da mediana viram suspeitos ou somem', () => {
  const out = flagOutliers([1850, 1900, 1800, 1950, 700, 90].map(v => ({ price: { pix: v * 100 } })));
  assert.equal(out.length, 5);                       // 90 (acessório/parcela) removido
  assert.equal(out.find(r => r.price.pix === 70000).suspeito, true);
  assert.equal(out.find(r => r.price.pix === 185000).suspeito, false);
});

test('produto que só MENCIONA um acessório no título não é descartado', () => {
  const items = [
    { title: 'Processador AMD Ryzen 7 7800X3D, 4.2GHz, Cooler não incluso', price: 1800 },
    { title: 'Processador AMD Ryzen 7 7800X3D Box com Cooler Wraith', price: 1850 },
    { title: 'Kit Ryzen 7 7800X3D sem cabo', price: 1900 },
    { title: 'Suporte para Ryzen 7 7800X3D', price: 50 },
    { title: 'Pasta Térmica ideal para Ryzen 7 7800X3D', price: 30 },
    { title: 'Ryzen 7 7800X3D compatível com placa mãe AM5', price: 1700 },
  ].map((x, i) => normalizeOffer({ ...x, url: `https://x.com/${i}` }, 'kabum'));
  const titles = cleanResults(items, Q).map(r => r.title);
  assert.ok(titles.some(t => /Cooler não incluso/.test(t)));
  assert.ok(titles.some(t => /Cooler Wraith/.test(t)));
  assert.ok(titles.some(t => /sem cabo/.test(t)));
  assert.ok(!titles.some(t => /^Suporte|^Pasta/.test(t)));
});
