// Fontes de preço por loja, da mais oficial para a menos oficial.
//
//   api-oficial    API oficial da loja com a credencial do usuário (Mercado Livre, Shopee, AliExpress, Amazon)
//   feed-afiliado  rede de afiliados com a credencial do usuário (Awin → KaBuM!, Lomadee → Terabyte)
//   api-publica    o JSON público que o próprio site da loja usa (KaBuM!, Mercado Livre, Shopee)
//   pagina         a página pública de busca (HTML)
//
// A ordem de cada loja fica em data/stores.json ("sources"). searchStore() (src/stores.js) percorre a lista,
// pula as fontes sem credencial e para na primeira que devolver itens.
import { readFileSync } from 'node:fs';
import { OFFICIAL } from '../official-apis.js';
import * as awin from './awin.js';
import * as lomadee from './lomadee.js';
import * as amazonCreators from './amazon-creators.js';

export const SOURCE_IDS = ['api-oficial', 'feed-afiliado', 'api-publica', 'pagina'];
export const SOURCE_LABELS = {
  'api-oficial': 'API oficial',
  'feed-afiliado': 'feed de afiliado',
  'api-publica': 'API pública',
  pagina: 'página da loja',
};

const STORES = JSON.parse(readFileSync(new URL('../../data/stores.json', import.meta.url), 'utf8')).stores ?? [];
const storeCfg = (id) => STORES.find(s => s.id === id) ?? {};
const defined = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k, v]) => v != null && !k.startsWith('_')));

// Envolve um módulo de src/sources/ com a configuração da loja (data/stores.json → "afiliado").
function wrap(mod, extra) {
  const cfg = defined(extra.cfg);
  return {
    id: mod.id, nome: extra.nome, provedor: extra.provedor, cadastro: extra.cadastro,
    configured: mod.configured, missing: mod.missing,
    search: (q, page, opts = {}) => mod.search(q, page, { ...cfg, ...opts }),
  };
}
const official = (o, provedor, cadastro) => ({ ...o, provedor, cadastro });

export const PROVIDERS = {
  mercadolivre: { 'api-oficial': official(OFFICIAL.mercadolivre, 'Mercado Livre', 'https://developers.mercadolivre.com.br') },
  shopee: { 'api-oficial': official(OFFICIAL.shopee, 'Shopee Afiliados', 'https://affiliate.shopee.com.br') },
  aliexpress: { 'api-oficial': official(OFFICIAL.aliexpress, 'AliExpress Portals', 'https://openservice.aliexpress.com') },
  amazon: { 'api-oficial': wrap(amazonCreators, { nome: 'Amazon Creators API', provedor: 'Amazon Associados', cadastro: 'https://associados.amazon.com.br' }) },
  kabum: { 'feed-afiliado': wrap(awin, { nome: 'Awin (feed da KaBuM!)', provedor: 'Awin', cadastro: 'https://ui.awin.com/awin-api', cfg: storeCfg('kabum').afiliado?.awin }) },
  terabyte: { 'feed-afiliado': wrap(lomadee, { nome: 'Lomadee (Terabyte)', provedor: 'Lomadee', cadastro: 'https://www.lomadee.com.br', cfg: storeCfg('terabyte').afiliado?.lomadee }) },
};

export const providerFor = (storeId, sourceId) => PROVIDERS[storeId]?.[sourceId] ?? null;

// Ordem das fontes da loja. Sem "sources" em data/stores.json, monta a ordem compatível com a versão 2.x:
// oficial → afiliado → API pública → página.
export function storeSources(storeId, { hasPublicApi = false } = {}) {
  const list = storeCfg(storeId).sources;
  if (Array.isArray(list) && list.length) return list.filter(s => SOURCE_IDS.includes(s));
  return [
    ...(providerFor(storeId, 'api-oficial') ? ['api-oficial'] : []),
    ...(providerFor(storeId, 'feed-afiliado') ? ['feed-afiliado'] : []),
    ...(hasPublicApi ? ['api-publica'] : []),
    'pagina',
  ];
}

// Para o diagnóstico: por loja, as fontes oficiais que existem, se estão configuradas e quais variáveis
// do .env faltam. Só nomes de variáveis, nunca valores.
// → [{ loja, fonte, id, nome, provedor, cadastro, configurada, faltam: [...] }]
export function officialSourcesStatus(storeIds = Object.keys(PROVIDERS)) {
  const out = [];
  for (const loja of storeIds) {
    for (const [fonte, p] of Object.entries(PROVIDERS[loja] ?? {})) {
      const faltam = p.missing();
      out.push({ loja, fonte, id: p.id, nome: p.nome, provedor: p.provedor, cadastro: p.cadastro, configurada: faltam.length === 0, faltam });
    }
  }
  return out;
}
