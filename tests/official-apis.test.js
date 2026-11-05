// APIs oficiais (credenciais do usuário), com respostas simuladas: sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { mlSearch, resetMlToken, shopeeSearch, shopeeAuthHeader, aliSearch, aliSign, configured } from '../src/official-apis.js';
import { normalizeOffer } from '../src/offer.js';

const resp = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

test('sem credenciais no .env, nenhuma API oficial é considerada configurada', () => {
  for (const k of ['ML_CLIENT_ID', 'ML_CLIENT_SECRET', 'SHOPEE_AFFILIATE_APP_ID', 'SHOPEE_AFFILIATE_SECRET', 'ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET']) delete process.env[k];
  assert.equal(configured.mercadolivre(), false);
  assert.equal(configured.shopee(), false);
  assert.equal(configured.aliexpress(), false);
});

test('Mercado Livre: busca + catálogo trazem vários vendedores do mesmo produto, com reputação', async (t) => {
  process.env.ML_CLIENT_ID = 'id'; process.env.ML_CLIENT_SECRET = 'segredo';
  t.after(() => { delete process.env.ML_CLIENT_ID; delete process.env.ML_CLIENT_SECRET; resetMlToken(); });
  resetMlToken();
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    if (url.endsWith('/oauth/token')) { assert.match(String(opts.body), /grant_type=client_credentials/); return resp({ access_token: 'TOK', expires_in: 21600 }); }
    assert.equal(opts.headers.Authorization, 'Bearer TOK');
    if (url.includes('/sites/MLB/search')) return resp({ results: [
      { id: 'MLB1', title: 'Placa De Vídeo Msi Rtx 4060 Ventus 2x 8gb', price: 1799.9, permalink: 'https://produto.mercadolivre.com.br/MLB-1', seller: { id: 10 }, catalog_product_id: 'MLB999', official_store_id: null, available_quantity: 5, shipping: { free_shipping: true } },
    ] });
    if (url.includes('/products/MLB999/items')) return resp({ results: [
      { item_id: 'MLB1', seller_id: 10, price: 1799.9 },
      { item_id: 'MLB2', seller_id: 20, price: 1749.0, official_store_id: 77 },
      { item_id: 'MLB3', seller_id: 30, price: 1699.0 },
    ] });
    if (url.includes('/users?ids=')) return resp([
      { code: 200, body: { id: 10, nickname: 'TECHSTORE', registration_date: '2015-03-01T00:00:00Z', seller_reputation: { level_id: '5_green', power_seller_status: 'platinum', transactions: { completed: 48000 } } } },
      { code: 200, body: { id: 20, nickname: 'MSI_OFICIAL', seller_reputation: { level_id: '5_green' } } },
      { code: 200, body: { id: 30, nickname: 'LOJA_NOVA', registration_date: '2026-10-20T00:00:00Z', seller_reputation: { level_id: null, transactions: { completed: 2 } } } },
    ]);
    throw new Error('URL inesperada ' + url);
  };
  const offers = await mlSearch('rtx 4060', 1, { fetchImpl });
  assert.equal(offers.length, 3);
  const nova = offers.find(o => o.seller.name === 'LOJA_NOVA');
  assert.equal(nova.url, 'https://produto.mercadolivre.com.br/MLB-3');
  assert.equal(nova.title, 'Placa De Vídeo Msi Rtx 4060 Ventus 2x 8gb');
  assert.equal(nova.sellerInfo.sales, 2);
  assert.equal(offers.find(o => o.seller.id === 20).seller.official, true);
  const n = normalizeOffer(offers[0], 'mercadolivre');
  assert.equal(n.price.card, 179990);
  assert.equal(n.catalogId, 'MLB999');
  // o token é reaproveitado
  await mlSearch('rtx 4060', 1, { fetchImpl });
  assert.equal(calls.filter(u => u.endsWith('/oauth/token')).length, 1);
});

test('Mercado Livre: tarifa de venda, % positivas do vendedor e frete até o CEP', async (t) => {
  process.env.ML_CLIENT_ID = 'id'; process.env.ML_CLIENT_SECRET = 'segredo';
  t.after(() => { delete process.env.ML_CLIENT_ID; delete process.env.ML_CLIENT_SECRET; resetMlToken(); });
  resetMlToken();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('/oauth/token')) return resp({ access_token: 'TOK', expires_in: 21600 });
    if (url.includes('/sites/MLB/search')) return resp({ results: [
      { id: 'MLB1', title: 'SSD 1TB', price: 400, listing_type_id: 'gold_special', category_id: 'MLB1672', seller: { id: 10 }, shipping: { free_shipping: true } },
      { id: 'MLB2', title: 'SSD 1TB', price: 400, listing_type_id: 'gold_special', category_id: 'MLB1672', seller: { id: 10 }, shipping: { free_shipping: false } },
    ] });
    if (url.includes('/users?ids=')) return resp([{ code: 200, body: { id: 10, nickname: 'LOJA', seller_reputation: { level_id: '5_green', transactions: { ratings: { positive: 0.973 } } } } }]);
    if (url.includes('/listing_prices?')) {
      assert.match(url, /price=400&listing_type_id=gold_special&category_id=MLB1672/);
      return resp({ listing_type_id: 'gold_special', sale_fee_amount: 64, sale_fee_details: { percentage_fee: 16, fixed_fee: 0 } });
    }
    if (url.includes('/items/MLB2/shipping_options?zip_code=01310100')) return resp({ options: [{ cost: 24.9 }, { cost: 18.5 }] });
    throw new Error('URL inesperada ' + url);
  };
  const offers = await mlSearch('ssd 1tb', 1, { fetchImpl, cep: '01310100' });
  assert.deepEqual(offers[0].fee, { listingType: 'gold_special', amount: 64, percent: 16, fixed: 0 });
  assert.equal(offers[0].sellerInfo.nativeReputation.percentPositive, 97.3);
  assert.equal(offers[0].shipping, undefined);   // frete grátis: nem consulta
  assert.equal(offers[1].shipping.cost, 18.5);
  assert.equal(calls.filter(u => u.includes('listing_prices')).length, 1);   // mesma tarifa, uma consulta
  assert.equal(calls.filter(u => u.includes('shipping_options')).length, 1);
  const n = normalizeOffer(offers[1], 'mercadolivre');
  assert.equal(n.fee.amount, 64);
  assert.equal(n.shipping.cost, 1850);
});

test('coleta automática: linhas CSV com ";" e vírgula decimal, aspas escapadas', async () => {
  const { toCsvRows } = await import('../scripts/coletar-ml.js');
  const csv = toCsvRows([{
    title: 'SSD "Pro"; 1TB', card: 399.9, url: 'https://x/1', freeShipping: false, shipping: { cost: 18.5 },
    seller: { id: 10, name: 'LOJA', official: false },
    sellerInfo: { sales: 900, nativeReputation: { level: '5_green', powerSeller: null, percentPositive: 97.3 } },
    fee: { listingType: 'gold_special', amount: 64, percent: 16 },
  }], { at: '2026-11-05T12:00:00.000Z', q: 'ssd', page: 1 });
  assert.equal(csv, '2026-11-05T12:00:00.000Z;ssd;1;"SSD ""Pro""; 1TB";399,9;false;18,5;10;LOJA;false;97,3;;5_green;900;gold_special;64;16;https://x/1');
});

test('Shopee Affiliate: assinatura SHA256 e loja Mall como oficial', async (t) => {
  process.env.SHOPEE_AFFILIATE_APP_ID = '123'; process.env.SHOPEE_AFFILIATE_SECRET = 's3';
  t.after(() => { delete process.env.SHOPEE_AFFILIATE_APP_ID; delete process.env.SHOPEE_AFFILIATE_SECRET; });
  const h = shopeeAuthHeader('123', 's3', 1700000000, '{"query":"x"}');
  assert.equal(h, `SHA256 Credential=123, Timestamp=1700000000, Signature=${createHash('sha256').update('1231700000000{"query":"x"}s3').digest('hex')}`);
  const fetchImpl = async (url, opts) => {
    assert.match(opts.headers.Authorization, /^SHA256 Credential=123, Timestamp=\d+, Signature=[0-9a-f]{64}$/);
    return resp({ data: { productOfferV2: { nodes: [
      { itemId: 9, shopId: 8, productName: 'SSD Kingston NV2 1TB', priceMin: '389.90', productLink: 'https://shopee.com.br/product/8/9', shopName: 'Kingston Oficial', shopType: [1] },
    ], pageInfo: { hasNextPage: false } } } });
  };
  const [o] = await shopeeSearch('ssd 1tb', 1, { fetchImpl });
  assert.equal(o.price, 389.9);
  assert.equal(o.seller.official, true);
  assert.equal(o.url, 'https://shopee.com.br/product/8/9');
});

test('AliExpress Affiliate: assinatura HMAC-SHA256 e link limpo do produto', async (t) => {
  process.env.ALIEXPRESS_APP_KEY = 'k'; process.env.ALIEXPRESS_APP_SECRET = 'sec';
  t.after(() => { delete process.env.ALIEXPRESS_APP_KEY; delete process.env.ALIEXPRESS_APP_SECRET; });
  assert.equal(aliSign({ b: '2', a: '1' }, 'sec'), createHmac('sha256', 'sec').update('a1b2').digest('hex').toUpperCase());
  const fetchImpl = async (url) => {
    const u = new URL(url);
    assert.equal(u.searchParams.get('sign'), aliSign(Object.fromEntries([...u.searchParams].filter(([k]) => k !== 'sign')), 'sec'));
    return resp({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 200, result: { products: { product: [
      { product_id: 1005, product_title: 'Mouse Logitech G203', target_sale_price: '99.90', shop_id: 55, shop_name: 'Logi Store', product_detail_url: 'https://s.click.aliexpress.com/afiliado' },
    ] } } } } });
  };
  const [o] = await aliSearch('mouse g203', 1, { fetchImpl });
  assert.equal(o.url, 'https://pt.aliexpress.com/item/1005.html');
  assert.equal(o.seller.name, 'Logi Store');
  assert.equal(o.price, 99.9);
});
