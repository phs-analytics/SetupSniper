// Extrator genérico de produtos ("busca profunda").
// Procura blocos JSON embutidos na página (JSON-LD, __NEXT_DATA__, estados iniciais, application/json)
// e percorre tudo atrás de objetos que se pareçam com um produto: nome + preço (+ link/imagem).
import { parseBRL } from './scraper.js';

const NAME_KEYS = ['name', 'title', 'displayTitle', 'productName', 'displayName', 'item_name', 'nome'];
const PRICE_KEYS = ['priceWithDiscount', 'pixPrice', 'cashPrice', 'avista', 'bestPrice', 'salePrice', 'finalPrice', 'final_price',
  'specialPrice', 'promotionalPrice', 'sellPrice', 'currentPrice', 'price', 'lowPrice', 'minPrice', 'preco', 'valor'];
const NESTED_PRICE = ['value', 'amount', 'bestPrice', 'minPrice', 'current', 'final', 'price', 'sale', 'avista', 'final_price', 'minimum_price'];
const LINK_KEYS = ['url', 'link', 'href', 'permalink', 'productUrl', 'itemUrl', 'canonicalUrl', 'path', 'detailUrl'];
const IMG_KEYS = ['image', 'imageUrl', 'thumbnail', 'thumbnailUrl', 'img', 'picture', 'mainImage', 'imagem'];

function* walk(node, depth = 0) {
  if (depth > 40 || !node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) yield* walk(n, depth + 1); return; }
  yield node;
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') yield* walk(v, depth + 1);
    // Alguns sites guardam JSON dentro de string (ex.: KaBuM pageProps.data)
    else if (typeof v === 'string' && v.length > 40 && (v[0] === '{' || v[0] === '[')) {
      try { yield* walk(JSON.parse(v), depth + 1); } catch { /* não é JSON */ }
    }
  }
}

function priceValue(v, depth = 0) {
  if (v == null || depth > 4) return null;
  if (typeof v === 'number') return v > 0 ? v : null;
  if (typeof v === 'string') return /\d/.test(v) && v.length < 30 ? parseBRL(v) : null;
  if (typeof v === 'object' && !Array.isArray(v)) {
    for (const k of NESTED_PRICE) { const p = priceValue(v[k], depth + 1); if (p) return p; }
  }
  return null;
}

export function priceOf(obj) {
  const found = [];
  for (const k of PRICE_KEYS) { const p = priceValue(obj[k]); if (p) found.push(p); }
  if (obj.offers) { const o = [].concat(obj.offers)[0]; const p = priceValue(o?.lowPrice ?? o?.price); if (p) found.push(p); }
  if (obj.price_range) { const p = priceValue(obj.price_range); if (p) found.push(p); }
  if (obj.prices) { const p = priceValue(obj.prices.salePrice ?? obj.prices); if (p) found.push(p); }
  return found.length ? Math.min(...found) : null; // menor = normalmente PIX/à vista
}

const firstStr = (obj, keys) => {
  for (const k of keys) {
    let v = obj[k];
    if (Array.isArray(v)) v = v[0];
    if (v && typeof v === 'object') v = v.url ?? v.src ?? v.displayTitle ?? v.text ?? null;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
};

export function collectJsonBlobs(html) {
  const blobs = [];
  const tryParse = (s) => {
    try { blobs.push(JSON.parse(s)); return; } catch { /* tenta modo tolerante */ }
    // Objeto JS com chaves sem aspas ({ data: {...} }) → coloca aspas nas chaves
    try { blobs.push(JSON.parse(s.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/,\s*([}\]])/g, '$1'))); } catch { /* desiste */ }
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi)) tryParse(m[1].trim());
  // Atribuições JS: window.__X__ = {...};  _init_data_ = {...}
  for (const m of html.matchAll(/(?:__[A-Z_]+__|_init_data_|__PRELOADED_STATE__|__APOLLO_STATE__|initialState)\s*=\s*(?=[{[])/g)) {
    const obj = sliceBalanced(html, m.index + m[0].length);
    if (obj) tryParse(obj);
  }
  return blobs;
}

function sliceBalanced(s, start) {
  const open = s[start], close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length && i - start < 5e6; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

// linkOf(obj) permite que cada loja monte o link a partir de ids (ex.: KaBuM code+friendlyName)
export function extractFromJson(blobs, { base, linkOf, imageOf, priceScale = 1 } = {}) {
  const out = [];
  for (const blob of blobs) {
    for (const obj of walk(blob)) {
      const title = firstStr(obj, NAME_KEYS);
      if (!title || title.length < 6 || title.length > 400) continue;
      let price = priceOf(obj);
      if (!price) continue;
      price = price / priceScale;
      let url = linkOf?.(obj) ?? firstStr(obj, LINK_KEYS);
      if (url && !/^https?:/.test(url)) { try { url = new URL(url, base).href; } catch { url = null; } }
      let image = imageOf?.(obj) ?? firstStr(obj, IMG_KEYS);
      if (image?.startsWith('//')) image = 'https:' + image;
      if (image && !/^https?:/.test(image)) image = null;
      const available = obj.available ?? obj.availability ?? obj.inStock;
      out.push({ title: decode(title), price, url, image, available: typeof available === 'string' ? !/OutOfStock|SoldOut/i.test(available) : available !== false });
    }
  }
  return out;
}

// Plano B: varre o HTML atrás de links de produto e pega título + primeiro "R$" próximo.
export function extractFromHtmlCards(html, { base, productPath }) {
  const out = [];
  const re = new RegExp(`<a\\b[^>]*href=["']([^"']*${productPath.source}[^"']*)["'][^>]*>`, 'gi');
  for (const m of html.matchAll(re)) {
    const win = html.slice(m.index, m.index + 3000);
    const title = m[0].match(/title=["']([^"']{8,300})["']/)?.[1]
      ?? win.match(/<h[23][^>]*>\s*(?:<[^>]+>\s*)*([^<]{8,300})</)?.[1]
      ?? win.match(/alt=["']([^"']{8,300})["']/)?.[1];
    const pm = win.match(/R\$\s*(?:&nbsp;|\s)*([\d.]+,\d{2})/);
    if (!title || !pm) continue;
    let url; try { url = new URL(m[1], base).href; } catch { continue; }
    const img = win.match(/<img[^>]+(?:data-src|src)=["'](https?:[^"']+)["']/)?.[1] ?? null;
    out.push({ title: decode(title.trim()), price: parseBRL(pm[1]), url, image: img, available: true });
  }
  return out;
}

export function decode(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------- relevância e limpeza ----------
export function normalize(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/(\d)\s+(gb|tb|mb|mhz|ghz|w|hz|pol)\b/g, '$1$2').replace(/[^a-z0-9]+/g, ' ').trim();
}
// Palavras que indicam acessório/peça — descartadas se não estiverem na busca
const ACCESSORY = ['adesivo', 'suporte', 'cooler', 'dissipador', 'heatsink', 'capa', 'pelicula', 'cabo', 'adaptador', 'bracket',
  'pasta termica', 'caixa vazia', 'compativel com', 'protetor', 'gabinete', 'placa mae', 'kit upgrade', 'combo'];
const STOP = new Set(['de', 'da', 'do', 'para', 'com', 'e', 'o', 'a', 'em', 'kit', 'novo', 'original']);

export function queryTokens(q) {
  return normalize(q).split(' ').filter(t => t.length >= 2 && !STOP.has(t));
}

// Fração dos termos da busca presentes no título (1 = todos).
export function relevance(title, tokens) {
  if (!tokens.length) return 1;
  const t = ' ' + normalize(title) + ' ';
  const hit = tokens.filter(tok => t.includes(' ' + tok + ' ') || (tok.length >= 4 && t.includes(tok))).length;
  return hit / tokens.length;
}

export function cleanResults(items, query, { minRel } = {}) {
  const tokens = queryTokens(query);
  const need = minRel ?? (tokens.length >= 4 ? 0.75 : 1);
  const nq = ' ' + normalize(query) + ' ';
  const banned = ACCESSORY.filter(w => !nq.includes(' ' + w + ' ') && !nq.includes(w));
  const seen = new Set();
  return items
    .filter(r => r.price > 0 && r.price < 1e6)
    .map(r => ({ ...r, url: /^https?:\/\//i.test(r.url ?? '') ? r.url : null, image: /^https:\/\//i.test(r.image ?? '') ? r.image : null }))
    .map(r => ({ ...r, rel: relevance(r.title, tokens) }))
    .filter(r => r.rel >= need)
    .filter(r => { const t = ' ' + normalize(r.title) + ' '; return !banned.some(w => t.includes(' ' + w + ' ')); })
    .filter(r => { const k = (r.url ?? '') + '|' + normalize(r.title) + '|' + r.price; if (seen.has(k)) return false; seen.add(k); return true; });
}

// Marca preços suspeitos comparando com a mediana de todas as lojas.
export function flagOutliers(items) {
  const ps = items.map(r => r.price).sort((a, b) => a - b);
  if (ps.length < 5) return items;
  const med = ps[Math.floor(ps.length / 2)];
  return items
    .filter(r => r.price >= med * 0.25)                     // quase certamente acessório/peça/parcela
    .map(r => ({ ...r, suspeito: r.price < med * 0.55 }));  // pode ser golpe ou produto diferente
}
