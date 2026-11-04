// Comparativo: o mesmo produto em lojas e vendedores diferentes vira um grupo só.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productSignature, sameProduct, groupOffers, sellerLabel } from '../src/compare.js';

const of = (store, title, pix, seller = null, extra = {}) => ({ storeId: store, store, title, price: { pix, card: pix }, seller, url: `https://x/${store}/${title.length}/${pix}`, ...extra });
const ref = (o) => o.price.pix;

test('títulos diferentes do mesmo modelo caem no mesmo grupo', () => {
  const a = 'Placa de Vídeo MSI GeForce RTX 4060 Ventus 2X Black OC, 8GB GDDR6, DLSS';
  const b = 'Placa De Vídeo Msi Rtx 4060 Ventus 2x Black 8gb Oc';
  const c = 'Placa de Vídeo Gigabyte NVIDIA GeForce RTX 4060 Eagle OC 8GB';
  const d = 'Placa de Vídeo MSI RTX 4060 Ti Ventus 2X 8GB';
  assert.ok(sameProduct(productSignature(a), productSignature(b)));
  assert.ok(!sameProduct(productSignature(a), productSignature(c)), 'Ventus ≠ Eagle');
  assert.ok(!sameProduct(productSignature(a), productSignature(d)), '4060 ≠ 4060 Ti');
});

test('processador: "Box", "sem cooler" e a ordem das palavras não separam o grupo', () => {
  const s = ['Processador AMD Ryzen 7 7800X3D, 5.0GHz Max Turbo, AM5, Sem Cooler', 'Processador Ryzen 7 7800x3d Amd Box', 'AMD Ryzen 7 7800X3D 8-Core'].map(productSignature);
  assert.ok(sameProduct(s[0], s[1]) && sameProduct(s[1], s[2]));
  assert.ok(!sameProduct(s[0], productSignature('Processador AMD Ryzen 7 9800X3D AM5')));
});

test('grupo junta lojas e vários vendedores do marketplace, na ordem preço + confiança', () => {
  const offers = [
    of('kabum', 'Placa de Vídeo MSI GeForce RTX 4060 Ventus 2X Black OC 8GB', 189990, null, { trust: { score: 86 } }),
    of('mercadolivre', 'Placa De Vídeo Msi Rtx 4060 Ventus 2x Black 8gb Oc', 179990, { name: 'TECHSTORE', id: 1 }, { trust: { score: 80 }, price: { pix: 175000, card: 175000 } }),
    of('mercadolivre', 'Placa Video MSI RTX 4060 Ventus 2X Black OC 8GB', 169990, { name: 'loja_nova_123', id: 2 }, { trust: { score: 33 } }),
    of('mercadolivre', 'Placa de Vídeo MSI RTX 4060 Ventus 2X Black OC 8 GB', 185000, { name: 'MSI Loja Oficial', id: 3, official: true }, { trust: { score: 92 } }),
    of('pichau', 'Placa de Video Gigabyte RTX 4060 Eagle OC 8GB', 179990, null, { trust: { score: 85 } }),
  ];
  const groups = groupOffers(offers, { refOf: ref, scoreOf: (o) => o.trust?.score });
  assert.equal(groups.length, 2);
  const ventus = groups.find(g => g.offers.length === 4);
  assert.deepEqual(ventus.stores.sort(), ['kabum', 'mercadolivre']);
  assert.equal(ventus.sellers, 4);
  // Alto risco (nota 33) vai para o fim mesmo sendo o mais barato
  assert.equal(ventus.offers.at(-1).seller.name, 'loja_nova_123');
  assert.equal(ventus.offers[0].seller.name, 'TECHSTORE');
  assert.equal(ventus.min, 169990);
  assert.equal(ventus.best.seller.name, 'TECHSTORE');
});

test('mesmo vendedor com o mesmo produto repetido: fica só a oferta mais barata dele', () => {
  const offers = [
    of('mercadolivre', 'SSD Kingston NV2 1TB NVMe', 39990, { name: 'A', id: 9 }),
    of('mercadolivre', 'SSD Kingston NV2 1TB NVMe M.2', 37990, { name: 'A', id: 9 }),
    of('mercadolivre', 'SSD Kingston NV2 1TB M.2 NVMe', 38990, { name: 'B', id: 10 }),
  ];
  const [g] = groupOffers(offers, { refOf: ref, scoreOf: () => 80 });
  assert.equal(g.offers.length, 2);
  assert.equal(g.offers.find(o => o.seller.name === 'A').price.pix, 37990);
});

test('rótulo do vendedor', () => {
  assert.equal(sellerLabel({ storeId: 'kabum', seller: null }), 'vendido pela própria loja');
  assert.equal(sellerLabel({ storeId: 'mercadolivre', seller: { name: 'TECHSTORE' } }), 'vendido por TECHSTORE');
  assert.equal(sellerLabel({ storeId: 'mercadolivre', seller: { name: 'MSI', official: true } }), 'loja oficial MSI');
  assert.equal(sellerLabel({ storeId: 'shopee', seller: { id: 5 } }), 'vendedor do marketplace (nome não informado)');
});
