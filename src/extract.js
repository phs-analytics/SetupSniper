// Extrator genérico de produtos ("busca profunda").
// Procura blocos JSON embutidos na página (JSON-LD, __NEXT_DATA__, estados iniciais, application/json)
// e percorre tudo atrás de objetos que se pareçam com um produto: nome + preço (+ link/imagem).
//
// Os preços são CLASSIFICADOS pelo nome do campo (Pix/à vista, crédito, parcela, preço "de"),
// em vez de pegar o menor valor encontrado: o menor costumava ser o valor de uma parcela,
// que depois era descartado pelo filtro de faixa e deixava a loja sem preço.
import { parseBRL } from './offer.js';

const NAME_KEYS = ['name', 'title', 'displayTitle', 'productName', 'displayName', 'item_name', 'nome'];
// Pix / à vista / boleto
const PIX_KEYS = ['priceWithDiscount', 'pixPrice', 'priceWithPix', 'pricePix', 'pix', 'cashPrice', 'avista', 'aVista', 'bestPrice', 'boletoPrice', 'precoAVista', 'preco_avista'];
// crédito / preço "cheio" atual
const CARD_KEYS = ['salePrice', 'finalPrice', 'final_price', 'specialPrice', 'promotionalPrice', 'sellPrice', 'currentPrice', 'price', 'lowPrice', 'minPrice', 'preco', 'valor', 'value', 'amount'];
// preço "de" (riscado) e afins: nunca é o preço a pagar
const IGNORE_KEYS = /^(old|list|original|full|regular|base|from|de|max|high)_?price|^priceFrom$|^precoDe$|^fullPrice$|^listPrice$|^oldPrice$/i;
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

const scalarPrice = (v) => (typeof v === 'number' ? (v > 0 ? v : null) : typeof v === 'string' && /\d/.test(v) && v.length < 30 ? parseBRL(v) : null);

// Parcelamento: { installments: { count|quantity|number|times, value|amount|installmentValue, rate|interestFree } }
function installmentsOf(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (!/installment|parcel/i.test(k) || !v || typeof v !== 'object') continue;
    const i = Array.isArray(v) ? v.at(-1) : v;
    if (!i || typeof i !== 'object') continue;
    const n = Number(i.count ?? i.quantity ?? i.number ?? i.times ?? i.installments ?? i.n);
    const value = scalarPrice(i.value ?? i.amount ?? i.installmentValue ?? i.price);
    if (n >= 2 && value) {
      const interestFree = i.interestFree ?? i.semJuros ?? (i.rate != null ? Number(i.rate) === 0 : null);
      return { n, value, interestFree };
    }
  }
  return null;
}

// Classifica os preços de um objeto de produto. Retorna { pix, card, installments } em reais.
export function pricesOf(obj) {
  const pix = [], card = [];
  const visit = (o, depth, forced) => {
    if (!o || typeof o !== 'object' || Array.isArray(o) || depth > 3) return;
    for (const [k, v] of Object.entries(o)) {
      if (IGNORE_KEYS.test(k) || /installment|parcel/i.test(k)) continue;
      const kind = forced ?? (PIX_KEYS.includes(k) ? 'pix' : CARD_KEYS.includes(k) ? 'card' : null);
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        // objetos de preço: { price: { value } }, pichau_prices: { avista, final_price }, prices.salePrice
        if (kind || /price|preco|prices/i.test(k)) visit(v, depth + 1, PIX_KEYS.includes(k) ? 'pix' : null);
        continue;
      }
      if (!kind) continue;
      const p = scalarPrice(v);
      if (p) (kind === 'pix' ? pix : card).push(p);
    }
  };
  visit(obj, 0, null);
  if (obj.offers) {
    const o = [].concat(obj.offers)[0];
    const p = scalarPrice(o?.lowPrice ?? o?.price ?? o?.priceSpecification?.price);
    if (p) card.push(p);
  }
  return {
    pix: pix.length ? Math.min(...pix) : null,
    card: card.length ? Math.min(...card) : null,
    installments: installmentsOf(obj) ?? (obj.price && typeof obj.price === 'object' ? installmentsOf(obj.price) : null),
  };
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
export function extractFromJson(blobs, { base, linkOf, imageOf, priceScale = 1, samePrice = false } = {}) {
  const out = [];
  for (const blob of blobs) {
    for (const obj of walk(blob)) {
      const title = firstStr(obj, NAME_KEYS);
      if (!title || title.length < 6 || title.length > 400) continue;
      const pr = pricesOf(obj);
      if (pr.pix == null && pr.card == null && !pr.installments) continue;
      const scale = (v) => (v == null ? null : v / priceScale);
      let url = linkOf?.(obj) ?? firstStr(obj, LINK_KEYS);
      if (url && !/^https?:/.test(url)) { try { url = new URL(url, base).href; } catch { url = null; } }
      let image = imageOf?.(obj) ?? firstStr(obj, IMG_KEYS);
      if (image?.startsWith('//')) image = 'https:' + image;
      if (image && !/^https?:/.test(image)) image = null;
      const available = obj.available ?? obj.availability ?? obj.inStock;
      const item = {
        title: decode(title), url, image,
        available: typeof available === 'string' ? !/OutOfStock|SoldOut/i.test(available) : available !== false,
        installments: pr.installments ? { ...pr.installments, value: scale(pr.installments.value) } : null,
      };
      if (samePrice) item.price = scale(pr.pix ?? pr.card), item.samePrice = true;
      else item.pix = scale(pr.pix), item.card = scale(pr.card);
      out.push(item);
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
    if (!title) continue;
    const pr = pricesFromText(win);
    if (pr.pix == null && pr.card == null && !pr.installments) continue;
    let url; try { url = new URL(m[1], base).href; } catch { continue; }
    const img = win.match(/<img[^>]+(?:data-src|src)=["'](https?:[^"']+)["']/)?.[1] ?? null;
    out.push({ title: decode(title.trim()), url, image: img, available: true, ...pr });
  }
  return out;
}

// Lê preços de um trecho de HTML/texto, classificando pelo contexto:
//   "R$ 1.849,90 à vista" / "no Pix" / "com Pix" → pix · "10x de R$ 199,90 sem juros" → parcelas
//   o primeiro "R$" que não é parcela nem preço "de" → crédito
export function pricesFromText(html) {
  const text = decode(String(html).replace(/<[^>]+>/g, ' '));
  const money = String.raw`R\$\s*([\d.]+(?:,\d{2})?)`;
  let pix = null, card = null, installments = null;
  const inst = text.match(new RegExp(String.raw`(\d{1,2})\s*x\s*(?:de\s*)?` + money + String.raw`(\s*sem juros)?`, 'i'));
  if (inst) installments = { n: Number(inst[1]), value: parseBRL(inst[2]), interestFree: inst[3] ? true : null };
  const pixM = text.match(new RegExp(money + String.raw`\s*(?:à vista|a vista|no pix|com pix|via pix|no boleto)`, 'i'))
    ?? text.match(new RegExp(String.raw`(?:pix|à vista)\D{0,20}` + money, 'i'));
  if (pixM) pix = parseBRL(pixM[1]);
  for (const mm of text.matchAll(new RegExp(String.raw`(de\s*)?` + money, 'gi'))) {
    const before = text.slice(Math.max(0, mm.index - 6), mm.index);
    if (mm[1] || /x\s*$/i.test(before)) continue;            // "de R$" riscado ou valor de parcela
    const v = parseBRL(mm[2]);
    if (v === pix) continue;
    card = v; break;
  }
  return { pix, card, installments };
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
  // 2 letras: palavra exata · 3 letras: início de palavra ("rtx" casa com "rtx4060") · 4+: em qualquer lugar
  const hit = tokens.filter(tok => t.includes(' ' + tok + ' ') || (tok.length === 3 && t.includes(' ' + tok)) || (tok.length >= 4 && t.includes(tok))).length;
  return hit / tokens.length;
}

// Recebe ofertas já normalizadas (src/offer.js). Ofertas sem preço legível NÃO são descartadas:
// elas aparecem como "Preço não encontrado nesta página".
export function cleanResults(items, query, { minRel } = {}) {
  const tokens = queryTokens(query);
  const need = minRel ?? (tokens.length >= 4 ? 0.75 : 1);
  const nq = ' ' + normalize(query) + ' ';
  const banned = ACCESSORY.filter(w => !nq.includes(' ' + w + ' ') && !nq.includes(w));
  const seen = new Set();
  return items
    .filter(r => r.title)
    .map(r => ({ ...r, rel: relevance(r.title, tokens) }))
    .filter(r => r.rel >= need)
    .filter(r => { const t = ' ' + normalize(r.title) + ' '; return !banned.some(w => t.includes(' ' + w + ' ')); })
    .filter(r => {
      const k = (r.canonicalUrl ?? '') + '|' + normalize(r.title) + '|' + (r.price?.pix ?? '') + '|' + (r.price?.card ?? '');
      if (seen.has(k)) return false; seen.add(k); return true;
    });
}

// Marca preços suspeitos comparando com a mediana de todas as lojas (pelo preço de referência).
// Ofertas sem preço não entram na mediana e nunca são descartadas por aqui.
export function flagOutliers(items, ref = (o) => o.price?.pix ?? o.price?.card ?? null) {
  const ps = items.map(ref).filter(v => v != null).sort((a, b) => a - b);
  if (ps.length < 5) return items.map(r => ({ ...r, suspeito: false }));
  const med = ps[Math.floor(ps.length / 2)];
  return items
    .filter(r => ref(r) == null || ref(r) >= med * 0.25)                    // quase certamente acessório/peça
    .map(r => ({ ...r, suspeito: ref(r) != null && ref(r) < med * 0.55 }));  // pode ser golpe ou produto diferente
}
