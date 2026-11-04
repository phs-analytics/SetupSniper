// Fontes oficiais novas (Awin, Lomadee, Amazon Creators API) com respostas simuladas: sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as awin from '../src/sources/awin.js';
import * as lomadee from '../src/sources/lomadee.js';
import * as amazon from '../src/sources/amazon-creators.js';
import { officialSourcesStatus, storeSources, SOURCE_IDS } from '../src/sources/index.js';
import { normalizeOffer } from '../src/offer.js';
import { resetLimiters } from '../src/rate-limit.js';

const fx = (f) => readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');
const json = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const VARS = ['AWIN_TOKEN', 'AWIN_PUBLISHER_ID', 'LOMADEE_API_KEY', 'AMAZON_CREATORS_CLIENT_ID', 'AMAZON_CREATORS_CLIENT_SECRET', 'AMAZON_PARTNER_TAG',
  'ML_CLIENT_ID', 'ML_CLIENT_SECRET', 'SHOPEE_AFFILIATE_APP_ID', 'SHOPEE_AFFILIATE_SECRET', 'ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET'];
function cleanEnv(t, set = {}) {
  const old = Object.fromEntries(VARS.map(k => [k, process.env[k]]));
  for (const k of VARS) delete process.env[k];
  Object.assign(process.env, set);
  t.after(() => { for (const k of VARS) { if (old[k] == null) delete process.env[k]; else process.env[k] = old[k]; } });
}
// relógio parado e "sono" instantâneo, para o limite de chamadas não atrasar os testes
const clock = () => { const c = { t: Date.UTC(2026, 10, 4, 12), now: () => c.t, sleep: async (ms) => { c.t += ms; } }; return c; };

// ---------------- configuração ----------------
test('sem credenciais: nada configurado e missing() lista as variáveis que faltam', (t) => {
  cleanEnv(t);
  assert.equal(awin.configured(), false);
  assert.deepEqual(awin.missing(), ['AWIN_TOKEN', 'AWIN_PUBLISHER_ID']);
  assert.equal(lomadee.configured(), false);
  assert.deepEqual(lomadee.missing(), ['LOMADEE_API_KEY']);
  assert.equal(amazon.configured(), false);
  assert.deepEqual(amazon.missing(), ['AMAZON_CREATORS_CLIENT_ID', 'AMAZON_CREATORS_CLIENT_SECRET', 'AMAZON_PARTNER_TAG']);
  process.env.AWIN_TOKEN = '  ';   // só espaço não conta
  assert.deepEqual(awin.missing(), ['AWIN_TOKEN', 'AWIN_PUBLISHER_ID']);
});

test('officialSourcesStatus: por loja, as fontes oficiais, se estão configuradas e o que falta', (t) => {
  cleanEnv(t, { LOMADEE_API_KEY: 'k', ML_CLIENT_ID: 'x' });
  const st = officialSourcesStatus();
  const by = (loja, fonte) => st.find(s => s.loja === loja && s.fonte === fonte);
  assert.deepEqual(by('kabum', 'feed-afiliado').faltam, ['AWIN_TOKEN', 'AWIN_PUBLISHER_ID']);
  assert.equal(by('terabyte', 'feed-afiliado').configurada, true);
  assert.deepEqual(by('terabyte', 'feed-afiliado').faltam, []);
  assert.equal(by('amazon', 'api-oficial').configurada, false);
  assert.deepEqual(by('mercadolivre', 'api-oficial').faltam, ['ML_CLIENT_SECRET']);
  assert.deepEqual(by('shopee', 'api-oficial').faltam, ['SHOPEE_AFFILIATE_APP_ID', 'SHOPEE_AFFILIATE_SECRET']);
  assert.deepEqual(by('aliexpress', 'api-oficial').faltam, ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET']);
  for (const s of st) { assert.ok(s.nome && s.cadastro && s.provedor, s.loja); assert.equal(typeof s.configurada, 'boolean'); }
  // Pichau e Magalu não têm fonte oficial conhecida
  assert.ok(!st.some(s => s.loja === 'pichau' || s.loja === 'magalu'));
  // nada de valor de credencial no resultado
  assert.ok(!JSON.stringify(st).includes('"k"'));
});

test('stores.json: cada loja do escopo tem a lista de fontes, com ids conhecidos', () => {
  const j = JSON.parse(readFileSync(new URL('../data/stores.json', import.meta.url), 'utf8'));
  for (const s of j.stores.filter(s => s.enabled)) {
    assert.ok(Array.isArray(s.sources) && s.sources.length, s.id);
    for (const f of s.sources) assert.ok(SOURCE_IDS.includes(f), `${s.id}: ${f}`);
    assert.equal(s.sources.at(-1), 'navegador', s.id);
  }
  assert.deepEqual(storeSources('kabum'), ['api-publica', 'feed-afiliado', 'pagina', 'navegador']);
  assert.deepEqual(storeSources('terabyte'), ['feed-afiliado', 'pagina', 'navegador']);
  assert.deepEqual(storeSources('amazon'), ['api-oficial', 'pagina', 'navegador']);
  assert.deepEqual(storeSources('pichau'), ['pagina', 'navegador']);
  assert.deepEqual(storeSources('mercadolivre'), ['api-oficial', 'api-publica', 'pagina', 'navegador']);
});

// ---------------- Awin (KaBuM!) ----------------
test('Awin: acha o programa da KaBuM, baixa o feed JSONL e filtra pela busca', async (t) => {
  cleanEnv(t, { AWIN_TOKEN: 'TOKAWIN', AWIN_PUBLISHER_ID: '999999' });
  resetLimiters(); awin.resetAwinCache();
  const c = clock();
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push(url);
    assert.equal(opts.headers.Authorization, 'Bearer TOKAWIN');
    assert.ok(!/Mozilla|Chrome/.test(JSON.stringify(opts.headers)), 'sem disfarce de navegador');
    if (url.startsWith('https://api.awin.com/publishers/999999/programmes')) { assert.match(url, /relationship=joined/); return json(fx('awin-programmes.json')); }
    if (url === 'https://api.awin.com/publishers/999999/awinfeeds/download/17729-retail-pt_BR.jsonl') return new Response(fx('awin-feed.jsonl'));
    throw new Error('URL inesperada ' + url);
  };
  const r = await awin.search('ssd 1tb', 1, { fetchImpl, now: c.now, sleep: c.sleep });
  assert.deepEqual(r.map(x => x.title), [
    'SSD 1TB Kingston NV2, M.2 2280 PCIe NVMe, Leitura 3500MB/s',
    'SSD 1TB WD Blue SN580, M.2 NVMe, Leitura 4150MB/s',
    'SSD 1TB Crucial P3 Plus, M.2 NVMe',
  ]);   // sem a RTX, sem o item em dólar e sem o item sem preço
  const [kingston, wd, crucial] = r;
  // URL canônica limpa em url; link rastreado separado em affiliateUrl
  assert.equal(kingston.url, 'https://www.kabum.com.br/produto/521312/ssd-1tb-kingston-nv2');
  assert.equal(kingston.affiliateUrl, 'https://www.awin1.com/pclick.php?p=521312&a=999999&m=17729');
  assert.equal(wd.affiliateUrl, null);
  assert.equal(crucial.available, false);
  const o = normalizeOffer(kingston, 'kabum');
  assert.equal(o.price.card, 42990);   // preço de oferta (sale_price), em centavos
  assert.equal(o.price.installments.n, 10);
  assert.equal(o.price.installments.value, 4299);
  assert.equal(o.canonicalUrl, 'https://www.kabum.com.br/produto/521312/ssd-1tb-kingston-nv2');
  assert.equal(normalizeOffer(wd, 'kabum').price.card, 51990);   // feed com seções (product_basic/product_price)
  // segunda busca usa o feed guardado: nenhuma chamada nova
  const n = calls.length;
  await awin.search('rtx 4060', 1, { fetchImpl, now: c.now, sleep: c.sleep });
  assert.equal(calls.length, n);
  assert.equal((await awin.search('rtx 4060', 1, { fetchImpl, now: c.now, sleep: c.sleep })).length, 1);
  // página além do fim: vazio
  assert.deepEqual(await awin.search('ssd 1tb', 2, { fetchImpl, now: c.now, sleep: c.sleep }), []);
});

test('Awin: advertiserId fixo pula a descoberta; sem programa aprovado, erro claro', async (t) => {
  cleanEnv(t, { AWIN_TOKEN: 'T', AWIN_PUBLISHER_ID: '1' });
  resetLimiters(); awin.resetAwinCache();
  const c = clock();
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return url.includes('/programmes') ? json([]) : new Response(fx('awin-feed.jsonl')); };
  await awin.search('ssd', 1, { fetchImpl, advertiserId: 17729, now: c.now, sleep: c.sleep });
  assert.ok(!urls.some(u => u.includes('/programmes')));
  awin.resetAwinCache();
  await assert.rejects(awin.search('ssd', 1, { fetchImpl, now: c.now, sleep: c.sleep }), /não está aprovada no programa.*kabum\.com\.br/);
});

test('Awin: feed cortado no meio (erro na última linha) e HTTP 401 viram erro legível', async (t) => {
  cleanEnv(t, { AWIN_TOKEN: 'T', AWIN_PUBLISHER_ID: '1' });
  resetLimiters(); awin.resetAwinCache();
  const c = clock();
  const cortado = fx('awin-feed.jsonl') + '{"error":500,"message":"Internal server error"}\n';
  await assert.rejects(awin.search('ssd', 1, { fetchImpl: async () => new Response(cortado), advertiserId: 1, now: c.now, sleep: c.sleep }), /feed da Awin veio incompleto/);
  awin.resetAwinCache();
  await assert.rejects(awin.search('ssd', 1, { fetchImpl: async () => json({ message: 'no' }, 401), advertiserId: 1, now: c.now, sleep: c.sleep }), /Awin.*HTTP 401.*AWIN_TOKEN/);
});

test('Awin: sem credenciais, não chama a rede', async (t) => {
  cleanEnv(t);
  await assert.rejects(awin.search('ssd', 1, { fetchImpl: async () => { throw new Error('não devia chamar'); } }), /falta AWIN_TOKEN, AWIN_PUBLISHER_ID/);
});

test('Awin Offers API: promoções e cupons divulgados, sempre como não verificados', async (t) => {
  cleanEnv(t, { AWIN_TOKEN: 'T', AWIN_PUBLISHER_ID: '999999' });
  resetLimiters();
  const c = clock();
  let body;
  const fetchImpl = async (url, opts) => {
    assert.equal(url, 'https://api.awin.com/publisher/999999/promotions');
    assert.equal(opts.method, 'POST');
    body = JSON.parse(opts.body);
    return json(fx('awin-ofertas.json'));
  };
  const ofs = await awin.offers({ advertiserId: 17729, fetchImpl, now: c.now, sleep: c.sleep });
  assert.deepEqual(body.filters.advertiserIds, [17729]);
  assert.equal(body.filters.membership, 'joined');
  assert.equal(ofs.length, 2);
  assert.equal(ofs[0].codigo, 'SSD10');
  assert.equal(ofs[0].url, 'https://www.kabum.com.br/hardware/ssd-2-5');
  assert.match(ofs[0].affiliateUrl, /awin1\.com/);
  assert.equal(ofs[0].verificado, false);
  assert.equal(ofs[0].fonte, 'Awin Offers API');
  assert.equal(ofs[1].codigo, null);
});

// ---------------- Lomadee (Terabyte) ----------------
test('Lomadee: busca com x-api-key, preço em centavos, só produtos da Terabyte', async (t) => {
  cleanEnv(t, { LOMADEE_API_KEY: 'LMDKEY' });
  resetLimiters();
  const c = clock();
  let seen;
  const fetchImpl = async (url, opts) => {
    seen = new URL(url);
    assert.equal(opts.headers['x-api-key'], 'LMDKEY');
    return json(fx('lomadee-produtos.json'));
  };
  const r = await lomadee.search('ssd 1tb', 2, { fetchImpl, now: c.now, sleep: c.sleep });
  assert.equal(seen.origin + seen.pathname, 'https://api.lomadee.com.br/affiliate/products');
  assert.equal(seen.searchParams.get('search'), 'ssd 1tb');
  assert.equal(seen.searchParams.get('page'), '2');
  assert.equal(r.length, 2);   // fora: a outra loja da rede e o item sem preço
  const [kingston, wd] = r;
  assert.equal(kingston.url, 'https://www.terabyteshop.com.br/produto/22841/ssd-kingston-nv2-1tb');
  assert.equal(kingston.affiliateUrl, null);   // o link de afiliado da Lomadee custa outra chamada: não é gerado
  const o = normalizeOffer(kingston, 'terabyte');
  assert.equal(o.price.card, 42990);
  assert.equal(o.image, 'https://img.terabyteshop.com.br/produto/g/ssd-kingston-nv2-1tb_1.jpg');
  assert.equal(normalizeOffer(wd, 'terabyte').price.card, 51990);   // a opção disponível, não a esgotada
});

test('Lomadee: organizationId restringe a busca; HTTP 429 vira erro legível', async (t) => {
  cleanEnv(t, { LOMADEE_API_KEY: 'K' });
  resetLimiters();
  const c = clock();
  let url;
  await lomadee.search('ssd', 1, { fetchImpl: async (u) => { url = u; return json({ data: [], count: 0 }); }, organizationId: 'abc-123', now: c.now, sleep: c.sleep });
  assert.match(url, /organizationIds=abc-123/);
  await assert.rejects(lomadee.search('ssd', 1, { fetchImpl: async () => json({ message: 'x' }, 429), now: c.now, sleep: c.sleep }), /Lomadee.*HTTP 429.*limite/);
});

test('Lomadee: o limite de 10 por minuto é respeitado (11ª chamada espera a vez)', async (t) => {
  cleanEnv(t, { LOMADEE_API_KEY: 'K' });
  resetLimiters();
  const c = clock();
  const t0 = c.t;
  const at = [];
  const fetchImpl = async () => { at.push(c.t - t0); return json({ data: [], count: 0 }); };
  for (let i = 0; i < 11; i++) await lomadee.search('ssd', 1, { fetchImpl, now: c.now, sleep: c.sleep, maxWaitMs: 1e9 });
  assert.ok(at.filter(x => x < 60000).length <= 10);
  resetLimiters();
});

// ---------------- Amazon Creators API ----------------
test('Amazon Creators API: token OAuth (client credentials) e SearchItems no marketplace do Brasil', async (t) => {
  cleanEnv(t, { AMAZON_CREATORS_CLIENT_ID: 'cid', AMAZON_CREATORS_CLIENT_SECRET: 'csec', AMAZON_PARTNER_TAG: 'meutag-20' });
  resetLimiters(); amazon.resetAmazonToken();
  const c = clock();
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    if (url === 'https://api.amazon.com/auth/o2/token') {
      const b = JSON.parse(opts.body);
      assert.deepEqual(b, { grant_type: 'client_credentials', client_id: 'cid', client_secret: 'csec', scope: 'creatorsapi::default' });
      return json({ access_token: 'Atc|TOKEN', token_type: 'bearer', expires_in: 3600 });
    }
    assert.equal(url, 'https://creatorsapi.amazon/catalog/v1/searchItems');
    assert.equal(opts.headers.Authorization, 'Bearer Atc|TOKEN');
    assert.equal(opts.headers['x-marketplace'], 'www.amazon.com.br');
    const b = JSON.parse(opts.body);
    assert.equal(b.keywords, 'ssd 1tb');
    assert.equal(b.partnerTag, 'meutag-20');
    assert.equal(b.marketplace, 'www.amazon.com.br');
    assert.equal(b.itemPage, 1);
    assert.ok(b.resources.includes('offersV2.listings.price'));
    return json(fx('amazon-creators-busca.json'));
  };
  const r = await amazon.search('ssd 1tb', 1, { fetchImpl, now: c.now, sleep: c.sleep });
  assert.equal(r.length, 2);   // o item sem oferta fica de fora
  const [kingston, wd] = r;
  assert.equal(kingston.url, 'https://www.amazon.com.br/dp/B0BHPW5DS5');
  assert.equal(kingston.affiliateUrl, 'https://www.amazon.com.br/dp/B0BHPW5DS5?tag=meutag-20&linkCode=osi&th=1&psc=1');
  const o = normalizeOffer(kingston, 'amazon');
  assert.equal(o.price.pix, 44990);
  assert.equal(o.price.card, 44990);   // a Amazon cobra o mesmo no Pix e no cartão
  assert.equal(o.seller.official, true);
  assert.equal(o.available, true);
  // listagem nova vencedora, não a usada mais barata
  assert.equal(normalizeOffer(wd, 'amazon').price.card, 51900);
  assert.equal(wd.seller.name, 'TechParceiro BR');
  assert.equal(wd.seller.official, null);
  // token reaproveitado na segunda busca
  await amazon.search('ssd 1tb', 1, { fetchImpl, now: c.now, sleep: c.sleep });
  assert.equal(calls.filter(u => u.includes('/auth/o2/token')).length, 1);
});

test('Amazon Creators API: página máxima 10 e erros legíveis', async (t) => {
  cleanEnv(t, { AMAZON_CREATORS_CLIENT_ID: 'cid', AMAZON_CREATORS_CLIENT_SECRET: 'csec', AMAZON_PARTNER_TAG: 'meutag-20' });
  resetLimiters(); amazon.resetAmazonToken();
  const c = clock();
  assert.deepEqual(await amazon.search('ssd', 11, { fetchImpl: async () => { throw new Error('não devia chamar'); }, now: c.now, sleep: c.sleep }), []);
  const f403 = async (url) => url.includes('/auth/o2/token') ? json({ access_token: 'A', expires_in: 3600 }) : json({ errors: [{ code: 'AccessDenied' }] }, 403);
  await assert.rejects(amazon.search('ssd', 1, { fetchImpl: f403, now: c.now, sleep: c.sleep }), /Amazon Creators API: HTTP 403.*vendas/);
  amazon.resetAmazonToken();
  const semToken = async () => json({ error: 'invalid_client' }, 401);
  await assert.rejects(amazon.search('ssd', 1, { fetchImpl: semToken, now: c.now, sleep: c.sleep }), /token.*AMAZON_CREATORS_CLIENT_ID/);
});
