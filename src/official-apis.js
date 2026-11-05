// Fontes OFICIAIS de preço (APIs das próprias lojas), usadas antes de ler o site quando o usuário
// cadastra as credenciais dele no .env. Não dependem de ler HTML, então não caem no bloqueio anti-bot.
//
//   Mercado Livre: app grátis em https://developers.mercadolivre.com.br (ML_CLIENT_ID / ML_CLIENT_SECRET).
//                  Busca + catálogo: o MESMO produto com TODOS os vendedores que o vendem.
//   Shopee:        Shopee Affiliate Open API (SHOPEE_AFFILIATE_APP_ID / SHOPEE_AFFILIATE_SECRET).
//   AliExpress:    AliExpress Affiliate API (ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET).
//
// [não verificado ao vivo] Os formatos seguem a documentação pública de cada API; a rede do ambiente de
// desenvolvimento bloqueava os domínios. Testado com respostas simuladas (tests/official-apis.test.js).
// fetchImpl é injetável para os testes. Os links salvos são os do produto, nunca os de afiliado.
import { createHash, createHmac } from 'node:crypto';
import { netError } from './http.js';

const env = (k) => (process.env[k] ?? '').trim();
// Variáveis do .env de cada API oficial (para o diagnóstico dizer qual falta).
export const VARS = {
  mercadolivre: ['ML_CLIENT_ID', 'ML_CLIENT_SECRET'],
  shopee: ['SHOPEE_AFFILIATE_APP_ID', 'SHOPEE_AFFILIATE_SECRET'],
  aliexpress: ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET'],
};
// missing.<loja>() → nomes das variáveis que faltam (nunca os valores)
export const missing = Object.fromEntries(Object.entries(VARS).map(([id, vs]) => [id, () => vs.filter(k => !env(k))]));
export const configured = Object.fromEntries(Object.keys(VARS).map(id => [id, () => missing[id]().length === 0]));

async function getJson(fetchImpl, url, opts = {}) {
  let res;
  try { res = await fetchImpl(url, { ...opts, signal: AbortSignal.timeout(20000) }); } catch (e) { throw new Error(netError(e)); }
  if (!res.ok) throw new Error(`HTTP ${res.status} na API oficial`);
  return res.json();
}

// ---------------- Mercado Livre ----------------
let mlToken = null;   // { token, exp }
export function resetMlToken() { mlToken = null; }
// Conta do usuário conectada pelo login oficial (src/ml-oauth.js): tem prioridade sobre o token do app.
let userTokenProvider = null;
export function setMlUserTokenProvider(fn) { userTokenProvider = fn; }
async function mlAuth(fetchImpl) {
  if (userTokenProvider) {
    try { const t = await userTokenProvider(); if (t) return t; } catch { /* login vencido: tenta o token do app */ }
  }
  if (mlToken && mlToken.exp > Date.now() + 60e3) return mlToken.token;
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: env('ML_CLIENT_ID'), client_secret: env('ML_CLIENT_SECRET') });
  const j = await getJson(fetchImpl, 'https://api.mercadolibre.com/oauth/token', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } });
  if (!j.access_token) throw new Error('o Mercado Livre não devolveu o token: confira ML_CLIENT_ID e ML_CLIENT_SECRET');
  mlToken = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 21600) * 1000 };
  return mlToken.token;
}
const mlUrl = (itemId) => `https://produto.mercadolivre.com.br/${String(itemId).replace(/^MLB/, 'MLB-')}`;

// Vendedor do ML → dados para a nota de confiança (src/seller-score.js)
export function mlSellerInfo(u) {
  if (!u) return null;
  const rep = u.seller_reputation ?? {};
  return {
    openedAt: u.registration_date ?? null,
    sales: rep.transactions?.completed ?? rep.transactions?.total ?? null,
    nativeReputation: { level: rep.level_id ?? null, powerSeller: rep.power_seller_status ?? null },
  };
}

function mlOffer(r, users, catalogTitle) {
  const u = users.get(String(r.seller_id ?? r.seller?.id));
  return {
    title: r.title ?? catalogTitle, card: r.price, url: r.permalink ?? mlUrl(r.id ?? r.item_id),
    image: r.thumbnail?.replace(/^http:/, 'https:') ?? null, available: r.available_quantity !== 0,
    installments: r.installments ? { n: r.installments.quantity, value: r.installments.amount, rate: r.installments.rate } : null,
    seller: { id: r.seller_id ?? r.seller?.id ?? null, name: r.official_store_name ?? u?.nickname ?? r.seller?.nickname ?? null, official: !!r.official_store_id },
    sellerInfo: mlSellerInfo(u) ?? undefined,
    freeShipping: r.shipping?.free_shipping === true, catalogId: r.catalog_product_id ?? null,
  };
}

// Busca + catálogo: para os produtos de catálogo mais relevantes, traz as ofertas de todos os vendedores.
export async function mlSearch(q, page = 1, { fetchImpl = fetch, catalogs = 5 } = {}) {
  const token = await mlAuth(fetchImpl);
  const H = { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } };
  const s = await getJson(fetchImpl, `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&offset=${(page - 1) * 50}&limit=50`, H);
  const items = s.results ?? [];
  const extra = [];
  const ids = [...new Set(items.map(r => r.catalog_product_id).filter(Boolean))].slice(0, catalogs);
  await Promise.all(ids.map(async (cid) => {
    try {
      const j = await getJson(fetchImpl, `https://api.mercadolibre.com/products/${cid}/items?limit=20`, H);
      const titulo = items.find(r => r.catalog_product_id === cid)?.title;
      for (const r of j.results ?? []) extra.push({ ...r, id: r.item_id, title: titulo, catalog_product_id: cid });
    } catch { /* catálogo indisponível: fica só a busca */ }
  }));
  const all = [...items];
  for (const r of extra) if (!all.some(x => x.id === r.id)) all.push(r);
  // Reputação dos vendedores (multiget, até 20 por chamada)
  const sellers = [...new Set(all.map(r => String(r.seller_id ?? r.seller?.id ?? '')).filter(Boolean))];
  const users = new Map();
  for (let i = 0; i < sellers.length; i += 20) {
    try {
      const j = await getJson(fetchImpl, `https://api.mercadolibre.com/users?ids=${sellers.slice(i, i + 20).join(',')}`, H);
      for (const x of [].concat(j)) { const u = x.body ?? x; if (u?.id) users.set(String(u.id), u); }
    } catch { /* sem reputação: a nota usa só o que houver */ }
  }
  return all.map(r => mlOffer(r, users, r.title));
}

// ---------------- Shopee Affiliate ----------------
export function shopeeAuthHeader(appId, secret, ts, payload) {
  const sig = createHash('sha256').update(appId + ts + payload + secret).digest('hex');
  return `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${sig}`;
}
export async function shopeeSearch(q, page = 1, { fetchImpl = fetch, now = Date.now() } = {}) {
  const query = `{ productOfferV2(keyword: ${JSON.stringify(q)}, limit: 50, page: ${page}, sortType: 2) { nodes { itemId productName priceMin priceMax price imageUrl productLink shopName shopId shopType sales ratingStar } pageInfo { hasNextPage } } }`;
  const payload = JSON.stringify({ query });
  const ts = Math.floor(now / 1000);
  const j = await getJson(fetchImpl, 'https://open-api.affiliate.shopee.com.br/graphql', {
    method: 'POST', body: payload,
    headers: { 'Content-Type': 'application/json', Authorization: shopeeAuthHeader(env('SHOPEE_AFFILIATE_APP_ID'), env('SHOPEE_AFFILIATE_SECRET'), ts, payload) },
  });
  if (j.errors?.length) throw new Error('Shopee Affiliate: ' + (j.errors[0].message ?? 'erro'));
  return (j.data?.productOfferV2?.nodes ?? []).map(n => ({
    title: n.productName, price: Number(n.priceMin ?? n.price), samePrice: true,
    url: n.productLink ?? (n.shopId && n.itemId ? `https://shopee.com.br/product/${n.shopId}/${n.itemId}` : null),
    image: n.imageUrl ?? null, available: true,
    // shopType: 1 = Shopee Mall (loja oficial), 2 = Indicado (Preferred)
    seller: { id: n.shopId ?? null, name: n.shopName ?? null, official: [].concat(n.shopType ?? []).includes(1) },
    sellerInfo: { nativeReputation: { badge: [].concat(n.shopType ?? []).includes(1) ? 'mall' : [].concat(n.shopType ?? []).includes(2) ? 'indicado' : null } },
  }));
}

// ---------------- AliExpress Affiliate ----------------
export function aliSign(params, secret) {
  const base = Object.keys(params).sort().map(k => k + params[k]).join('');
  return createHmac('sha256', secret).update(base).digest('hex').toUpperCase();
}
export async function aliSearch(q, page = 1, { fetchImpl = fetch, now = Date.now() } = {}) {
  const params = {
    app_key: env('ALIEXPRESS_APP_KEY'), method: 'aliexpress.affiliate.product.query', sign_method: 'sha256', timestamp: String(now),
    keywords: q, page_no: String(page), page_size: '50', target_currency: 'BRL', target_language: 'PT', ship_to_country: 'BR',
  };
  params.sign = aliSign(params, env('ALIEXPRESS_APP_SECRET'));
  const j = await getJson(fetchImpl, 'https://api-sg.aliexpress.com/sync?' + new URLSearchParams(params));
  const r = j.aliexpress_affiliate_product_query_response?.resp_result;
  if (j.error_response) throw new Error('AliExpress Affiliate: ' + (j.error_response.msg ?? 'erro'));
  if (r && r.resp_code && Number(r.resp_code) !== 200) throw new Error('AliExpress Affiliate: ' + (r.resp_msg ?? r.resp_code));
  return [].concat(r?.result?.products?.product ?? []).map(p => ({
    title: p.product_title, price: Number(p.target_sale_price ?? p.sale_price), samePrice: true,
    url: p.product_id ? `https://pt.aliexpress.com/item/${p.product_id}.html` : p.product_detail_url,
    image: p.product_main_image_url ?? null, available: true,
    seller: { id: p.shop_id ?? null, name: p.shop_name ?? null, official: null },
    origin: 'INTL',
  }));
}

export const OFFICIAL = {
  mercadolivre: { id: 'mercadolivre-api', configured: configured.mercadolivre, missing: missing.mercadolivre, search: mlSearch, nome: 'API oficial do Mercado Livre' },
  shopee: { id: 'shopee-affiliate', configured: configured.shopee, missing: missing.shopee, search: shopeeSearch, nome: 'Shopee Affiliate API' },
  aliexpress: { id: 'aliexpress-affiliate', configured: configured.aliexpress, missing: missing.aliexpress, search: aliSearch, nome: 'AliExpress Affiliate API' },
};
