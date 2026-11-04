// Parser de posts de promoção (encaminhados ao bot ou lidos de canais públicos com opt-in).
// Extrai produto, preço anunciado, preço "de", cupons ("X OU Y" são alternativas), regras e links.
// Função pura, testada em tests/promo-parser.test.js com posts de exemplo.
import { toCents } from './offer.js';

// Loja pelo domínio do link (inclui encurtadores de afiliado). Fora do escopo → null.
const HOSTS = [
  [/(^|\.)meli\.la$|mercadoli(vre|bre)\.com/i, 'mercadolivre'],
  [/(^|\.)amzn\.to$|(^|\.)a\.co$|amazon\.com\.br$/i, 'amazon'],
  [/(^|\.)shp\.ee$|(^|\.)shopee\.ee$|shopee\.com\.br$/i, 'shopee'],
  [/aliexpress\.(com|us)$|(^|\.)aliexpress\.com\.br$/i, 'aliexpress'],
  [/magazineluiza\.com\.br$|magazinevoce\.com\.br$|magalu\.com(\.br)?$|(^|\.)mglu\.(com|me)$/i, 'magalu'],
  [/kabum\.com\.br$/i, 'kabum'],
  [/pichau\.com\.br$/i, 'pichau'],
  [/terabyteshop\.com\.br$/i, 'terabyte'],
  [/tiktok\.com$/i, 'tiktokshop'],
];
// Encurtadores genéricos de afiliados: a loja só aparece depois de seguir o link (src/link-resolver.js)
const GENERIC_SHORTENERS = /^(tidd\.ly|bit\.ly|tinyurl\.com|cutt\.ly|rebrand\.ly)$/i;
export const isGenericShortener = (u) => { try { return GENERIC_SHORTENERS.test(new URL(u).hostname); } catch { return false; } };
export function storeFromUrl(u) {
  try { const h = new URL(u).hostname; return HOSTS.find(([re]) => re.test(h))?.[1] ?? null; } catch { return null; }
}

const MONEY = String.raw`R\$\s*([\d.]+(?:,\d{1,2})?)`;
const NOT_CODES = new Set(['CUPOM', 'CUPONS', 'CODIGO', 'OFF', 'PIX', 'FRETE', 'GRATIS', 'APP', 'OU', 'E', 'USE', 'NO', 'NA', 'DE', 'POR', 'LINK', 'PRECO',
  'MELI', 'LIMITADO', 'ACIMA', 'PRIMEIRA', 'COMPRA', 'OFERTA', 'PROMO', 'PROMOCAO', 'AQUI', 'COMPRE', 'VALIDO', 'APLICADO', 'AUTOMATICO', 'BRL', 'SEM', 'JUROS',
  'CHOICE', 'MOEDAS', 'ATE', 'COM', 'VALE', 'PARA', 'CARRINHO', 'PEDIDO', 'MINIMO', 'TODO', 'SITE', 'ESTOQUE',
  // nomes de lojas aparecem em títulos como "CUPOM AMAZON" e não são códigos
  'AMAZON', 'SHOPEE', 'KABUM', 'PICHAU', 'TERABYTE', 'ALIEXPRESS', 'MERCADO', 'LIVRE', 'MAGALU', 'MAGAZINE', 'LUIZA', 'TIKTOK', 'SHOP']);

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const clean = (s) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();

function parseRules(text) {
  const rules = [];
  const t = text.replace(/\s+/g, ' ');
  // "R$ 50 OFF acima de R$ 300" / "R$ 50 de desconto em compras acima de R$ 300"
  for (const m of t.matchAll(new RegExp(MONEY + String.raw`\s*(?:off|de desconto|de desc)\b(?:[^R]{0,30}?(?:acima de|a partir de|em compras (?:acima|a partir) de|m[ií]nimo(?: de)?)\s*` + MONEY + ')?', 'gi'))) {
    rules.push({ type: 'fixed', value: toCents(m[1]), minOrder: m[2] ? toCents(m[2]) : null });
  }
  // "10% OFF limitado a R$ 100" / "10% de desconto até R$ 100"
  for (const m of t.matchAll(new RegExp(String.raw`(\d{1,2})\s*%\s*(?:off|de desconto|de desc)?(?:[^%]{0,30}?(?:limitado a|at[eé]|teto de|m[aá]ximo de)\s*` + MONEY + ')?(?:[^%]{0,30}?(?:acima de|a partir de|m[ií]nimo(?: de)?)\s*' + MONEY + ')?', 'gi'))) {
    const ctx = t.slice(Math.max(0, m.index - 15), m.index + m[0].length + 5);
    if (/juros|parcela|cashback|moedas/i.test(ctx)) continue;
    rules.push({ type: 'percent', value: Number(m[1]), maxDiscount: m[2] ? toCents(m[2]) : null, minOrder: m[3] ? toCents(m[3]) : null });
  }
  if (/frete gr[aá]tis/i.test(t)) rules.push({ type: 'shipping' });
  const conditions = [];
  if (/primeira compra|1[ªa] compra|novos? (clientes?|usu[aá]rios?)/i.test(t)) conditions.push('first_purchase');
  if (/meli\s*\+|meli plus|assinantes?|prime\b/i.test(t)) conditions.push('subscriber');
  if (/(s[oó]|somente|apenas|exclusivo)\s*(no|pelo|para o)?\s*app/i.test(t)) conditions.push('app_only');
  const pixOnly = /(s[oó]|somente|apenas|pagando)\s*(no|via|com)\s*pix/i.test(t);
  return { rules, conditions, appliesTo: pixOnly ? ['pix'] : null };
}

function parseCoupons(text) {
  const codes = [];
  const lines = text.split(/\n/);
  for (const line of lines) {
    const plain = stripAccents(line);
    // palavra inteira: "Mouse" não é "use"
    const m = plain.match(/(?:^|[^a-z])(?:cupo(?:m|ns)|codigo|cod\.|use o|use|🎟️|🎫)(?![a-z])\s*[:\-–]?\s*(.+)$/iu) ?? (/🎟|🎫/u.test(line) ? [null, plain.replace(/[🎟🎫️]/gu, '')] : null);
    if (!m) continue;
    // Todos os códigos da linha: "VOLTESEMPRE OU SEMPREPROMO", "NV3OFF / TECH10" (alternativas, não somam)
    for (const mm of m[1].matchAll(/(?<![\w$])[A-Z0-9][A-Z0-9_-]{3,24}(?![\w])/g)) {
      const code = mm[0];
      if (!/[A-Z]/.test(code) || NOT_CODES.has(code)) continue;
      if (!codes.includes(code)) codes.push(code);
    }
  }
  return codes;
}

function parsePrices(text) {
  const t = text.replace(/\s+/g, ' ');
  // "de R$ 699 por R$ 547"
  const dePor = t.match(new RegExp(String.raw`de\s*` + MONEY + String.raw`\s*(?:por|→|->|➡️?)\s*(?:apenas\s*|só\s*)?` + MONEY, 'i'));
  if (dePor) return { oldPrice: toCents(dePor[1]), announcedPrice: toCents(dePor[2]) };
  // rótulos: "Preço: R$ 547", "Por: R$ 547", "💰 R$ 547", "🔥 R$ 547"
  const rotulo = text.match(new RegExp(String.raw`(?:pre[cç]o(?: final| com cupom)?|por|valor|💰|🔥|➡️|✅)\s*[:\-–]?\s*(?:apenas\s*|só\s*)?` + MONEY, 'iu'))
    // valor com rótulo e sem "R$": "💰 547,90", "Preço: 547,90"
    ?? text.match(/(?:pre[cç]o(?: final| com cupom)?|por|valor|💰)\s*[:\-–]?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/iu);
  if (rotulo) return { oldPrice: null, announcedPrice: toCents(rotulo[1]) };
  // senão: o menor valor que não está numa regra de cupom nem de parcela
  const vals = [];
  for (const m of t.matchAll(new RegExp(MONEY, 'gi'))) {
    const ctx = t.slice(Math.max(0, m.index - 25), m.index + m[0].length + 12);
    if (/off|desconto|acima de|a partir de|m[ií]nimo|limitado|at[eé] R|cashback|\d+\s*x\s*(de\s*)?R|frete/i.test(ctx)) continue;
    vals.push(toCents(m[1]));
  }
  // valores "soltos" como "547,90" sem R$ numa linha de preço
  if (!vals.length) {
    const solto = t.match(/(?:pre[cç]o|por)\s*[:\-–]?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i);
    if (solto) vals.push(toCents(solto[1]));
  }
  return { oldPrice: null, announcedPrice: vals.length ? Math.min(...vals) : null };
}

function parseProduct(text) {
  for (const raw of text.split(/\n/)) {
    const line = clean(raw);
    if (line.length < 6) continue;
    if (/https?:\/\//i.test(line)) continue;
    if (/^(pre[cç]o|por|de\s*R\$|R\$|cupo(m|ns)|c[oó]digo|use|link|compre|frete|parcel|\d+x|valor|oferta rel[aâ]mpago!?$)/i.test(line)) continue;
    return line.replace(/^(oferta|promo(ção)?|achado|baixou|imperd[ií]vel|corre|urgente)\s*[:!\-–]\s*/i, '').replace(/[:\-–]+$/, '').trim();
  }
  return null;
}

// Filtro de privacidade dos grupos e canais lidos pelo bot: só passa o que parece oferta.
// Oferta = link de loja do escopo (ou encurtador de afiliado a resolver), ou preço junto de um link que não é de rede social.
// Conversa solta, mesmo com um "R$" no meio, é descartada antes de qualquer processamento.
const SOCIAL = /^(www\.)?(t\.me|telegram\.me|youtube\.com|youtu\.be|instagram\.com|twitter\.com|x\.com|facebook\.com|discord\.gg|wa\.me|chat\.whatsapp\.com)$/i;
export function looksLikeOffer(text) {
  const p = parsePromo(text);
  if (p.store || p.needsResolution) return true;
  if (p.announcedPrice == null) return false;
  return p.links.some((u) => { try { return !SOCIAL.test(new URL(u).hostname); } catch { return false; } });
}

export function parsePromo(text) {
  const t = String(text ?? '');
  const links = [...t.matchAll(/https?:\/\/[^\s<>"')]+/gi)].map((m) => m[0].replace(/[.,;!?]+$/, ''));
  const stores = links.map(storeFromUrl).filter(Boolean);
  const { rules, conditions, appliesTo } = parseRules(t);
  return {
    product: parseProduct(t),
    ...parsePrices(t),
    coupons: parseCoupons(t),
    rules,
    conditions,
    appliesTo,
    links,
    store: stores[0] ?? null,
    needsResolution: !stores.length && links.some(isGenericShortener),   // a loja só aparece seguindo o link
  };
}
