// Schema único de oferta. Todos os adaptadores passam por normalizeOffer().
// Dinheiro sempre em CENTAVOS inteiros; formatar só na exibição.
//
// {
//   store, seller: { id, name, url, official, cnpj }, title, url, canonicalUrl, image,
//   price: { pix, card, installments: { n, value, interestFree } | null, currency: 'BRL', taxesIncluded },
//   shipping: { cost, origin: 'BR'|'INTL'|null, freeAbove },
//   available: true|false|null, fetchedAt
// }
//
// Os adaptadores entregam um objeto "cru" em reais (número ou texto "R$ 1.234,56"):
//   pix, card            → preço no Pix/à vista e no crédito (1x)
//   price                → preço sem forma de pagamento definida (vira "card")
//   samePrice: true      → a loja cobra o mesmo valor no Pix e no cartão (ex.: Amazon)
//   installments         → { n, value, interestFree }
//   seller | official, shipping | freeShipping | origin, taxesIncluded, available

// "R$ 1.234,56" → 1234.56 · "2199.90" → 2199.9 · "1.234" → 1234 (milhar, sem centavos)
export function parseBRL(s) {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  if (s == null) return null;
  let t = String(s).replace(/[^\d.,]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

// reais (número ou texto) → centavos inteiros; null se não for um valor positivo
export function toCents(v) {
  const n = typeof v === 'number' ? v : parseBRL(v);
  return Number.isFinite(n) && n > 0 && n < 1e7 ? Math.round(n * 100) : null;
}

export function formatBRL(cents) {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// URL sem parâmetros de rastreamento ou de afiliado: só origem + caminho.
// Os caminhos de produto das lojas do escopo não dependem da query.
export function canonicalUrl(u) {
  try {
    const x = new URL(u);
    return /^https?:$/.test(x.protocol) ? x.origin + x.pathname : null;
  } catch { return null; }
}

const safeHttp = (u, httpsOnly = false) => (typeof u === 'string' && (httpsOnly ? /^https:\/\//i : /^https?:\/\//i).test(u) ? u : null);

function normalizeInstallments(i) {
  if (!i || typeof i !== 'object') return null;
  const n = Number(i.n ?? i.count ?? i.quantity ?? i.times);
  const value = toCents(i.value ?? i.amount);
  if (!Number.isInteger(n) || n < 2 || n > 48 || !value) return null;
  const interestFree = i.interestFree ?? (i.rate != null ? Number(i.rate) === 0 : null);
  return { n, value, interestFree: interestFree == null ? null : !!interestFree };
}

function normalizeSeller(raw) {
  const s = raw.seller;
  const obj = typeof s === 'string' ? { name: s } : (s && typeof s === 'object' ? s : {});
  const official = obj.official ?? raw.official;
  return {
    id: obj.id != null ? String(obj.id) : null,
    name: obj.name ?? null,
    url: safeHttp(obj.url),
    official: official == null ? null : !!official,
    cnpj: obj.cnpj ?? null,
  };
}

function normalizeShipping(raw) {
  const s = raw.shipping && typeof raw.shipping === 'object' ? raw.shipping : {};
  let cost = s.cost === 0 ? 0 : toCents(s.cost);
  if (raw.freeShipping === true || s.free === true) cost = 0;
  const origin = s.origin ?? raw.origin ?? null;
  return { cost: cost ?? null, origin: origin === 'BR' || origin === 'INTL' ? origin : null, freeAbove: toCents(s.freeAbove) };
}

export function normalizeOffer(raw, store, { now = new Date() } = {}) {
  let pix = toCents(raw.pix);
  let card = toCents(raw.card);
  const generic = toCents(raw.price);
  if (generic != null) {
    if (raw.samePrice) { pix ??= generic; card ??= generic; }
    else card ??= generic;
  }
  const installments = normalizeInstallments(raw.installments);
  // Sem preço no crédito, mas com parcelas sem juros: o total das parcelas é o preço no crédito.
  if (card == null && installments?.interestFree) card = installments.n * installments.value;
  // Rótulos trocados pela página (Pix maior que o crédito): o menor é o Pix.
  if (pix != null && card != null && pix > card) [pix, card] = [card, pix];

  const url = safeHttp(raw.url);
  return {
    store,
    seller: normalizeSeller(raw),
    title: raw.title ? String(raw.title).trim() : null,
    url,
    canonicalUrl: url ? canonicalUrl(url) : null,
    image: safeHttp(raw.image, true),
    price: {
      pix,
      card,
      installments,
      currency: 'BRL',
      taxesIncluded: raw.taxesIncluded == null ? null : !!raw.taxesIncluded,
    },
    shipping: normalizeShipping(raw),
    available: raw.available === false ? false : raw.available === true ? true : null,
    // dados públicos do vendedor lidos pelo adaptador (idade, vendas, reputação), para a nota de confiança
    ...(raw.sellerInfo && typeof raw.sellerInfo === 'object' ? { sellerInfo: raw.sellerInfo } : {}),
    ...(raw.catalogId ? { catalogId: String(raw.catalogId) } : {}),
    // link rastreado da rede de afiliados: guardado à parte; "Ver na loja" usa a URL limpa (opção desligada por padrão)
    ...(safeHttp(raw.affiliateUrl) ? { affiliateUrl: safeHttp(raw.affiliateUrl) } : {}),
    fetchedAt: now.toISOString(),
  };
}

// Preço de referência em centavos (ordenação, metas, alertas). Padrão: Pix; sem Pix, usa o crédito.
export function referencePrice(offer, ref = 'pix') {
  const p = offer?.price;
  if (!p) return null;
  const parcelado = p.installments ? p.installments.n * p.installments.value : null;
  return ref === 'card' ? (p.card ?? p.pix ?? parcelado) : (p.pix ?? p.card ?? parcelado);
}

// 'ok' | 'not_found' (a página não mostrou preço legível) | 'unavailable' (sem estoque)
export function priceStatus(offer) {
  if (referencePrice(offer) == null) return 'not_found';
  if (offer.available === false) return 'unavailable';
  return 'ok';
}
