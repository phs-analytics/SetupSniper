// Comparativo entre lojas e vendedores: agrupa ofertas do MESMO produto (títulos escritos de jeitos
// diferentes em cada loja) e ordena cada grupo pelo menor preço dos vendedores mais confiáveis.
// Funções puras, testadas em tests/compare.test.js.
import { normalize } from './extract.js';
import { rankOffers } from './ranking.js';

// Palavras que não identificam o produto (categoria, marketing, estado, cor...).
const GENERIC = new Set(('placa de da do das dos para com sem e a o video grafica processador memoria ram ssd hd nvme m2 m 2 interno interna externo ' +
  'gamer gaming nvidia geforce amd radeon intel core ryzen novo nova original lacrado lacrada envio imediato garantia oficial loja promocao oferta ' +
  'preto preta black branco branca white edition edicao oc overclock pcie pci express gddr6 gddr6x gddr7 ddr4 ddr5 dlss rgb led box cooler ' +
  'max turbo ghz mhz core cores nucleo nucleos threads cache socket am4 am5 lga1700 lga1851 desktop pc computador kit unidade un pronta entrega').split(' '));
// "Ti", "Super", "XT" e "GRE" mudam o produto: entram na assinatura mesmo sem dígito.
const VARIANT = new Set(['ti', 'super', 'xt', 'xtx', 'gre']);

// Junta números quebrados: "8 GB" → "8gb", "2 X" → "2x", "4060 ti" fica separado (variante)
const prep = (title) => normalize(title).replace(/\b(\d+)\s+(gb|tb|mb|x|w|mhz|hz)\b/g, '$1$2');

// Assinatura: { codes: tokens com dígito (4060, 8gb, 7800x3d, 2x), words: palavras distintivas (msi, ventus, eagle...) }
export function productSignature(title) {
  const toks = prep(title).split(' ').filter(Boolean);
  const codes = new Set(), words = new Set();
  for (const t of toks) {
    if (/\d/.test(t)) {
      // velocidade/frequência e o "8 core" variam entre lojas; capacidade e modelo ficam
      if (/^\d+(\.\d+)?(ghz|mhz)$/.test(t) || /^\d+-?core$/.test(t)) continue;
      codes.add(t);
    } else if (VARIANT.has(t)) codes.add(t);
    else if (t.length >= 2 && !GENERIC.has(t)) words.add(t);
  }
  return { codes, words };
}

const jaccard = (a, b) => { if (!a.size && !b.size) return 1; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };

// Mesmo produto: o código principal (o mais longo, ex.: 4060, 7800x3d) e as variantes (ti, super) iguais,
// e as palavras distintivas (marca, linha) parecidas. Capacidades extras numa loja só ("8gb") não separam.
export function sameProduct(a, b) {
  const main = (s) => [...s.codes].filter(c => /\d{3,}/.test(c) && !/^\d+(gb|tb|mb|w)$/.test(c)).sort().join(' ');
  const variants = (s) => [...s.codes].filter(c => VARIANT.has(c)).sort().join(' ');
  if (main(a) !== main(b) || variants(a) !== variants(b)) return false;
  const caps = (s) => new Set([...s.codes].filter(c => /^\d+(gb|tb)$/.test(c)));
  const ca = caps(a), cb = caps(b);
  if (ca.size && cb.size && ![...ca].some(c => cb.has(c))) return false;     // 1TB ≠ 2TB
  if (a.words.size <= 1 || b.words.size <= 1) return true;                    // título curto: o modelo decide
  return jaccard(a.words, b.words) >= 0.4;
}

export const sellerKey = (o) => `${o.storeId ?? o.store}|${o.seller?.id ?? o.seller?.name ?? 'loja'}`;

export function sellerLabel(o) {
  const s = o.seller;
  if (!s || (!s.name && !s.id)) return 'vendido pela própria loja';
  if (s.official) return `loja oficial ${s.name ?? ''}`.trim();
  return s.name ? `vendido por ${s.name}` : 'vendedor do marketplace (nome não informado)';
}

// offers: ofertas normalizadas (com storeId, title, seller, trust). refOf → centavos; scoreOf → nota 0–100.
// Retorna grupos [{ title, offers (ranqueadas, 1 por vendedor), best, min, max, stores, sellers }],
// do grupo com a melhor oferta para o pior.
export function groupOffers(offers, { refOf, scoreOf = (o) => o.trust?.score ?? null }) {
  const groups = [];
  for (const o of offers) {
    if (!o.title) continue;
    const sig = productSignature(o.title);
    let g = groups.find(x => sameProduct(x.sig, sig));
    if (!g) { g = { sig, items: [] }; groups.push(g); }
    g.items.push(o);
  }
  const key = (o) => ({ price: refOf(o), score: scoreOf(o), suspeito: !!o.suspeito, available: o.available });
  return groups.map(({ items }) => {
    // um vendedor aparece uma vez por produto: a oferta mais barata dele
    const porVendedor = new Map();
    for (const o of items) {
      const k = sellerKey(o), cur = porVendedor.get(k);
      if (!cur || (refOf(o) ?? Infinity) < (refOf(cur) ?? Infinity)) porVendedor.set(k, o);
    }
    const ranked = rankOffers([...porVendedor.values()], key);
    const prices = ranked.map(refOf).filter(v => v != null);
    const best = ranked[0];
    // título do grupo: o mais completo entre os das ofertas confiáveis
    const title = [...ranked].sort((a, b) => b.title.length - a.title.length)[0].title;
    return { title, offers: ranked, best, min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null,
      stores: [...new Set(ranked.map(o => o.storeId ?? o.store))], sellers: ranked.length };
  }).sort((a, b) => rankOffers([a.best, b.best], key)[0] === a.best ? -1 : 1);
}
