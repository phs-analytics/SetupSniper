// Lomadee (rede de afiliados), usada para a Terabyte: busca de produtos.
//
// Credencial (no .env): LOMADEE_API_KEY, criada no painel da Lomadee (menu do usuário → "Credenciais de API"),
// com o escopo products:read. A conta precisa estar aprovada no programa da Terabyte.
//
// Documentação conferida em 04/11/2026:
//   GET https://api.lomadee.com.br/affiliate/products?search=&page=&limit=&isAvailable=&organizationIds=
//   cabeçalho x-api-key; preços em CENTAVOS (pricing[].price e listPrice); resposta { data, count }.
//   https://docs.lomadee.com.br/api-reference/affiliate/products/all e .../api-reference/introduction
//   (o host api-beta.lomadee.com.br está sendo desligado; aqui já vai o novo).
// Limite: 10 chamadas/min (data/source-limits.json). A busca pode trazer produtos de outros anunciantes da
// rede, por isso o resultado é filtrado pelo domínio da loja e, se configurado, pelo organizationId dela
// (data/stores.json → terabyte → "afiliado.lomadee.organizationId").
//
// [não verificado ao vivo] Sem conta Lomadee no ambiente de desenvolvimento: testado com a fixture
// tests/fixtures/lomadee-produtos.json. Não conferidos: o organizationId da Terabyte; se o "price" é o preço
// à vista (Pix) ou o parcelado (aqui fica como preço no cartão, o mais conservador); se a Terabyte aparece na
// busca de produtos da Lomadee.
// O link de afiliado da Lomadee sai de outra chamada (encurtador) e gastaria o limite: não é gerado.
import { canonicalUrl } from '../offer.js';
import { env, missingVars, reais, callApi, readJson } from './util.js';

const VARS = ['LOMADEE_API_KEY'];
const NOME = 'Lomadee';
const HINT = 'confira LOMADEE_API_KEY (escopo products:read) e se a conta está aprovada no programa da loja';
const DEFAULTS = { dominio: 'terabyteshop.com.br', organizationId: null, pageSize: 40 };

export const id = 'lomadee';
export const nome = 'Lomadee (afiliado)';
export const configured = () => missingVars(VARS).length === 0;
export const missing = () => missingVars(VARS);

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

function toOffer(p, dominio) {
  const url = typeof p.url === 'string' ? p.url : null;
  const host = url ? hostOf(url) : '';
  if (!url || !(host === dominio || host.endsWith('.' + dominio))) return null;
  const opts = Array.isArray(p.options) ? p.options : [];
  const priced = opts.filter(x => Number.isInteger(x?.pricing?.[0]?.price) && x.pricing[0].price > 0);
  const opt = priced.find(x => x.available !== false) ?? priced[0];
  if (!opt) return null;
  const cents = opt.pricing[0].price;
  const img = p.images?.[0]?.url ?? opt.images?.[0]?.url ?? null;
  return {
    title: p.name ?? opt.name,
    card: reais(cents),
    url: canonicalUrl(url),
    affiliateUrl: null,
    image: img,
    available: p.available === false || opt.available === false ? false : true,
  };
}

export async function search(query, page = 1, opts = {}) {
  if (!configured()) throw new Error(`${NOME}: falta ${missing().join(', ')} no .env`);
  const o = { ...DEFAULTS, fetchImpl: fetch, ...opts };
  const qs = new URLSearchParams({ search: query, page: String(page), limit: String(o.pageSize), isAvailable: 'true' });
  if (o.organizationId) qs.set('organizationIds', o.organizationId);
  const res = await callApi(`https://api.lomadee.com.br/affiliate/products?${qs}`,
    { ...o, nome: NOME, limits: ['lomadee'], hint: HINT, headers: { 'x-api-key': env('LOMADEE_API_KEY'), Accept: 'application/json' } });
  const j = await readJson(res, NOME);
  return (j?.data ?? []).map(p => toOffer(p, o.dominio.replace(/^www\./, ''))).filter(Boolean);
}
