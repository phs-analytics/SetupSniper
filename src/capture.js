// "Enviar para o SetupSniper": a pessoa abre a página da loja no PRÓPRIO navegador (como sempre faz)
// e toca no favorito. O favorito manda o HTML que já está na tela para o servidor dela, que lê os
// preços com os mesmos leitores da busca. Não há acesso automático à loja: quem abriu a página foi a pessoa.
import { storeFromUrl } from './promo-parser.js';
import { ADAPTERS, isChallenge } from './stores.js';
import { parseProductPage } from './scraper.js';

// Páginas de produto têm um padrão de endereço por loja; o resto é tratado como busca/listagem.
const PRODUCT_PATH = {
  kabum: /\/produto\/\d+/, pichau: /^\/[a-z0-9-]{15,}$/, terabyte: /\/produto\/\d+/, amazon: /\/(dp|gp\/product)\/[A-Z0-9]{10}/,
  mercadolivre: /MLB-?\d+|\/p\/MLB\d+/, magalu: /\/p\/[a-z0-9]{6,}\//i, aliexpress: /\/item\/\d+\.html/, shopee: /-i\.\d+\.\d+|\/product\/\d+\/\d+/,
};

export function pageKind(url, store) {
  try { const u = new URL(url); return PRODUCT_PATH[store]?.test(u.pathname) ? 'product' : 'search'; } catch { return 'search'; }
}

// { url, html } → { store, kind, items: [ofertas brutas], error? }
export function parseCapture({ url, html }) {
  const store = storeFromUrl(url);
  if (!store || !ADAPTERS[store]) return { store, kind: null, items: [], error: 'esta página não é de uma loja do SetupSniper' };
  if (isChallenge(html)) return { store, kind: null, items: [], error: 'a página enviada é a de verificação da loja: resolva a verificação no navegador e envie de novo' };
  const kind = pageKind(url, store);
  if (kind === 'product') {
    try {
      const raw = parseProductPage(html, store, url);
      return { store, kind, items: [{ ...raw, url: raw.url ?? url }] };
    } catch (e) {
      // algumas páginas de produto também têm "compre junto"/vendedores: tenta como listagem
      const items = ADAPTERS[store].parse(html, ADAPTERS[store]);
      return items.length ? { store, kind: 'search', items } : { store, kind, items: [], error: e.message };
    }
  }
  const items = ADAPTERS[store].parse(html, ADAPTERS[store]);
  return { store, kind, items, error: items.length ? null : 'nenhum produto com preço encontrado nesta página' };
}
