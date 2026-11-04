// Amazon Creators API (substituta da PA-API 5, que foi desligada): busca de produtos na Amazon.com.br.
//
// Credenciais (no .env): AMAZON_CREATORS_CLIENT_ID e AMAZON_CREATORS_CLIENT_SECRET (Associates Central →
// Ferramentas → Creators API → Create Application) e AMAZON_PARTNER_TAG (a sua tag de associado, ex.: nome-20).
//
// Documentação conferida em 04/11/2026 (https://affiliate-program.amazon.com/creatorsapi/docs/en-us/):
//   1. Token OAuth 2.0 (client credentials) no Login with Amazon. O Brasil fica na região NA (versão 3.1):
//      POST https://api.amazon.com/auth/o2/token, corpo JSON
//      { grant_type: "client_credentials", client_id, client_secret, scope: "creatorsapi::default" };
//      o token vale 1 h e é guardado em memória.
//   2. POST https://creatorsapi.amazon/catalog/v1/searchItems com Authorization: Bearer <token>,
//      x-marketplace: www.amazon.com.br e corpo { keywords, marketplace, partnerTag, itemCount (até 10),
//      itemPage (1 a 10), resources }. Resposta: searchResult.items[] com asin, detailPageURL,
//      itemInfo.title.displayValue, images.primary.medium.url e offersV2.listings[] (price.money.amount,
//      availability.type, condition.value, merchantInfo.name, isBuyBoxWinner).
//   Limite inicial: 1 chamada/s e 8640/dia (concepts/api-rates); aqui fica mais baixo (data/source-limits.json).
//   Exige conta de associado aceita e com vendas qualificadas recentes; sem vendas por 30 dias, o acesso é
//   suspenso (HTTP 403/429).
//
// [não verificado ao vivo] Sem conta no ambiente de desenvolvimento: testado com a fixture
// tests/fixtures/amazon-creators-busca.json. Não conferidos: credencial de versão diferente da 3.1 para o
// Brasil; o id do vendedor em merchantInfo; preço em reais sem "currencyOfPreference".
// A Amazon pede para usar o link devolvido pela API (com a tag) para contar a comissão: ele fica em
// affiliateUrl; o "Ver na loja" continua com a URL limpa (decisão do projeto).
import { env, missingVars, moneyCents, reais, callApi, readJson } from './util.js';

const VARS = ['AMAZON_CREATORS_CLIENT_ID', 'AMAZON_CREATORS_CLIENT_SECRET', 'AMAZON_PARTNER_TAG'];
const NOME = 'Amazon Creators API';
const HINT = 'confira AMAZON_CREATORS_CLIENT_ID, AMAZON_CREATORS_CLIENT_SECRET e AMAZON_PARTNER_TAG e se a conta de associado tem vendas qualificadas nos últimos 30 dias';
const TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const API = 'https://creatorsapi.amazon/catalog/v1/searchItems';
const MARKETPLACE = 'www.amazon.com.br';
const RESOURCES = ['itemInfo.title', 'images.primary.medium', 'offersV2.listings.price', 'offersV2.listings.availability',
  'offersV2.listings.condition', 'offersV2.listings.merchantInfo', 'offersV2.listings.isBuyBoxWinner'];

export const id = 'amazon-creators';
export const nome = 'Amazon Creators API';
export const configured = () => missingVars(VARS).length === 0;
export const missing = () => missingVars(VARS);

let token = null;   // { value, exp }
export function resetAmazonToken() { token = null; }

async function getToken(o) {
  const now = (o.now ?? Date.now)();
  if (token && token.exp > now + 60e3) return token.value;
  let res;
  try {
    res = await callApi(TOKEN_URL, { ...o, nome: NOME, limits: [], method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: env('AMAZON_CREATORS_CLIENT_ID'), client_secret: env('AMAZON_CREATORS_CLIENT_SECRET'), scope: 'creatorsapi::default' }) });
  } catch (e) {
    throw new Error(`${NOME}: não foi possível obter o token (${e.message.replace(NOME + ': ', '')}); confira AMAZON_CREATORS_CLIENT_ID e AMAZON_CREATORS_CLIENT_SECRET`);
  }
  const j = await readJson(res, NOME);
  if (!j?.access_token) throw new Error(`${NOME}: a Amazon não devolveu o token; confira AMAZON_CREATORS_CLIENT_ID e AMAZON_CREATORS_CLIENT_SECRET`);
  token = { value: j.access_token, exp: now + (Number(j.expires_in) || 3600) * 1000 };
  return token.value;
}

function toOffer(it) {
  const listings = (it.offersV2?.listings ?? []).filter(l => !l.condition?.value || /^new$/i.test(l.condition.value));
  const l = listings.find(x => x.isBuyBoxWinner) ?? listings[0];
  const money = l?.price?.money;
  const cents = money ? moneyCents(money.currency && money.currency !== 'BRL' ? `${money.amount} ${money.currency}` : money.amount) : null;
  const title = it.itemInfo?.title?.displayValue;
  if (!title || !cents || !it.asin) return null;
  const merchant = l.merchantInfo?.name ?? null;
  const avail = l.availability?.type;
  return {
    title,
    price: reais(cents), samePrice: true,   // a Amazon cobra o mesmo no Pix e no cartão
    url: `https://www.amazon.com.br/dp/${it.asin}`,
    affiliateUrl: typeof it.detailPageURL === 'string' && /^https:\/\//.test(it.detailPageURL) ? it.detailPageURL : null,
    image: it.images?.primary?.medium?.url ?? it.images?.primary?.large?.url ?? it.images?.primary?.small?.url ?? null,
    available: avail ? !/OUT_OF_STOCK|UNAVAILABLE/i.test(avail) : null,
    seller: merchant ? { id: l.merchantInfo?.id ?? merchant, name: merchant, official: /^amazon(\.com)?(\.br)?$/i.test(merchant.trim()) ? true : null } : null,
  };
}

export async function search(query, page = 1, opts = {}) {
  if (!configured()) throw new Error(`${NOME}: falta ${missing().join(', ')} no .env`);
  if (page > 10) return [];   // a API só vai até a página 10
  const o = { fetchImpl: fetch, ...opts };
  const access = await getToken(o);
  const body = { keywords: query, marketplace: MARKETPLACE, partnerTag: env('AMAZON_PARTNER_TAG'), itemCount: 10, itemPage: page, languagesOfPreference: ['pt_BR'], resources: RESOURCES };
  const res = await callApi(API, { ...o, nome: NOME, limits: ['amazon-creators'], hint: HINT, method: 'POST', body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', Accept: 'application/json', 'x-marketplace': MARKETPLACE } });
  const j = await readJson(res, NOME);
  if (!j?.searchResult && j?.errors?.length) {
    const e = j.errors[0];
    if (/NoResults/i.test(e.code ?? '')) return [];
    throw new Error(`${NOME}: ${e.message ?? e.code ?? 'erro'}`);
  }
  return (j?.searchResult?.items ?? []).map(toOffer).filter(Boolean);
}
