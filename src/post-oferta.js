// Leitura de um post de promoção (canal, grupo ou encaminhado) para a aba Ofertas.
// Separa três tipos:
//   produto   um produto com preço ("Monitor Gamer AOC 25" · Valor: R$ 949,99 no Pix")
//   cupom     um código de desconto sem produto específico ("R$ 60 OFF em Monitor selecionado · Código: TOMA60")
//   desconto  uma oferta de desconto sem código ("Clique para resgatar o cupom de 20% OFF", "até 40% OFF em SSDs")
// e lê o nome certo do produto (pulando chamadas como "ESSA É SUCESSO NA FARIA LIMA" e avisos do canal),
// o preço certo (com ou sem "R$", "1.539", "128,18", "Por 98,60 à vista", "10x de R$ 99,90") e a loja
// (pelo link, inclusive encurtadores que guardam a loja no caminho, ou pelo texto: "Novo Cupom KABUM").
// Função pura, sem rede. Dinheiro em centavos inteiros. Testes: tests/post-oferta.test.js (posts reais de canais).
import { parsePromo, storeFromUrl, storeFromText } from './promo-parser.js';

const URL_G = /https?:\/\/[^\s<>"')]+/gi;
const SOCIAL = /^(www\.)?(t\.me|telegram\.me|wa\.me|chat\.whatsapp\.com|instagram\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|facebook\.com|discord\.gg)$/i;
// Linhas do canal que não são o produto: avisos, links de ajuda, instruções de resgate, assinatura do canal.
const RUIDO = /s[oó] aviso|mais grupos|bot de descontos|link (do )?app|link para pc|somente no app|melhor pre[cç]o da hist|dias gr[aá]tis|conferiu manualmente|^_{3,}|ative aqui|v[aá]lido\s*\/\s*ative|chame a|resgate aqui|^\d+\s*[-–.)]?\s*(vai|clique|abra|entre)\b|^(entre|participe) (no|do) (grupo|canal)|^compartilhe/i;
// Linhas que são chamada do canal, não nome de produto.
const CHAMADA = /^(exclusivo|aten[cç][aã]o|ativa hoje|hoje|corre+|urgente|baixou|liberou|novo cupom|cupom\b|cupons\b|promo[cç](?:[aã]o|[oõ]es)|ofertas?\b|achados?\b|imperd[ií]vel|amazon soltou|soltou)/i;
const PREFIXO = /^(oferta|promo(?:[cç][aã]o)?|achado|baixou|imperd[ií]vel|corre|urgente)\s*[:!\-–]\s*(?=\S)/i;
const OFF = /\b(off|desconto|desc\.?|cashback|moedas)\b|%/i;
const NUM = String.raw`(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?`;

const comoRotulo = (s) => s.replace(/💰|💲|💵|➡️|➡|→|->/gu, ' por ');
const semEmoji = (s) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu, ' ');
const limpa = (s) => semEmoji(s).replace(/^[\s•·*>\-–—|:]+/, '').replace(/\s+/g, ' ').trim();
const centavos = (int, dec) => {
  const n = Number(String(int).replace(/\./g, ''));
  if (!Number.isFinite(n)) return null;
  const c = n * 100 + (dec ? Number(String(dec).padEnd(2, '0')) : 0);
  return c > 0 ? c : null;
};

// Proporção de maiúsculas entre as letras (chamada do canal costuma vir toda em maiúsculas)
const maiusculas = (s) => { const l = s.replace(/[^\p{L}]/gu, ''); return l.length ? l.replace(/[^\p{Lu}]/gu, '').length / l.length : 0; };

// ---------- preço ----------
const formaDe = (l) => /\bpix\b/i.test(l) ? 'pix' : /[àa]\s*vista|boleto/i.test(l) ? 'avista' : /\d+\s*x\b/i.test(l) ? 'parcelado' : null;
// Valor da linha de preço. Ignora linhas de regra de cupom ("R$ 60 OFF", "acima de R$ 300", "10%").
function precoDaLinha(l) {
  if (OFF.test(l) || /acima de|a partir de|m[ií]nimo|limitad/i.test(l)) return null;
  // "de R$ 199,90 por R$ 89,90"
  const dp = l.match(new RegExp(String.raw`\bde\s*:?\s*(?:R\$\s*)?${NUM}\s*(?:por|→|->|➡)\s*:?\s*(?:R\$\s*)?${NUM}`, 'i'));
  if (dp) return { preco: centavos(dp[3], dp[4]), precoDe: centavos(dp[1], dp[2]), pagamento: formaDe(l) };
  // só "De: R$ 199,90" (o "por" vem em outra linha)
  if (/^\s*(de|era|antes)\s*:?\s*(R\$\s*)?\d/i.test(l)) {
    const m = l.match(new RegExp(String.raw`(?:R\$\s*)?${NUM}`));
    return m ? { precoDe: centavos(m[1], m[2]) } : null;
  }
  // parcelas: "10x de R$ 99,90" → total, se não houver outro preço na linha
  const parc = l.match(new RegExp(String.raw`(\d{1,2})\s*x\s*(?:de\s*)?(?:R\$\s*)${NUM}`, 'i'));
  const semParc = parc ? l.replace(parc[0], ' ') : l;
  // rótulo + valor ("Preço: R$ 394", "Valor: R$584,99 no PIX", "Por 98,60 à vista", "por 1.539 em 12x") ou "R$ 128"
  const m = semParc.match(new RegExp(String.raw`(?:pre[cç]o|valor|por|apenas|s[oó])\s*:?\s*(?:R\$\s*)?${NUM}(?!\s*x)`, 'i'))
    ?? semParc.match(new RegExp(String.raw`R\$\s*${NUM}(?!\s*x)`, 'i'))
    ?? semParc.match(new RegExp(String.raw`${NUM}\s*reais\b`, 'i'));
  const out = {};
  if (m) out.preco = centavos(m[1], m[2]);
  // valor sozinho na linha: "189,90"
  else { const so = semParc.match(new RegExp(String.raw`^\s*(?:por\s*)?${NUM}\s*$`)); if (so && so[2]) out.preco = centavos(so[1], so[2]); }
  // "(de R$ 3.299)"
  const par = l.match(new RegExp(String.raw`\(\s*(?:de|era)\s*:?\s*(?:R\$\s*)?${NUM}\s*\)`, 'i'));
  if (par) out.precoDe = centavos(par[1], par[2]);
  if (parc) {
    const n = Number(parc[1]), valor = centavos(parc[2], parc[3]);
    if (n >= 2 && n <= 48 && valor) {
      out.parcelas = { n, valor, semJuros: /sem juros/i.test(l) ? true : /com juros/i.test(l) ? false : null };
      if (out.preco == null) out.preco = n * valor;
    }
  }
  if (out.preco == null) return null;
  out.pagamento = formaDe(l) ?? (out.parcelas ? 'parcelado' : null);
  if (!out.parcelas) {
    const px = l.match(/(\d{1,2})\s*x\s*sem juros/i);
    if (px) out.parcelas = { n: Number(px[1]), valor: Math.round(out.preco / Number(px[1])), semJuros: true };
  }
  return out;
}

// ---------- cupom ----------
// Códigos que o promo-parser não pega: "🏷 R$ 60 OFF em R$ 150 - CUPOMLUESQUENTABLACK"
function codigosExtras(linhas) {
  const out = [];
  for (const l of linhas) {
    const m = OFF.test(l) && l.match(/[-–:]\s*([A-Z][A-Z0-9]{4,24})\s*$/);
    if (m && !/^(OFF|PIX|FRETE|GRATIS)$/.test(m[1])) out.push(m[1]);
  }
  return out;
}

// ---------- título ----------
function pontuar(l) {
  let p = Math.min(l.length, 90) / 15;
  if (maiusculas(l) < 0.7) p += 3;               // nome de produto tem minúsculas
  if (/\d/.test(l)) p += 2;                        // modelo, capacidade, polegadas
  if (/\b(gb|tb|hz|w|mah|pol|"|ram|ssd|rtx|ryzen|intel|core|monitor|placa|notebook|mouse|teclado|fone|headset|kit|cadeira)\b/i.test(l)) p += 2;
  if (CHAMADA.test(l)) p -= 6;
  if (maiusculas(l) >= 0.8 && !/\d/.test(l)) p -= 4;  // "ESSA É SUCESSO NA FARIA LIMA"
  return p;
}
function tituloDe(linhas, ateIndice) {
  const cand = [];
  for (let i = 0; i < linhas.length && i < ateIndice; i++) {
    let l = limpa(linhas[i].replace(URL_G, ' ')).replace(PREFIXO, '');
    if (l.length < 4 || !/\p{L}{2}/u.test(l)) continue;
    if (/:\s*$/.test(l) && !/\d/.test(l)) continue;   // cabeçalho: "Promoções de periféricos:"
    if (RUIDO.test(l) || OFF.test(l) && !/\d{2,}\s*(gb|tb|hz|w)\b/i.test(l)) continue;
    if (/^(pre[cç]o|valor|por|de|cupo(m|ns)|c[oó]digo|use|link|frete|parcel|\d+\s*x)\b/i.test(l)) continue;
    // corta o preço no fim: "Air Fryer ... 220V - R$128"
    l = l.replace(/\s*[-–—|:]?\s*(?:(?:de|por|apenas)\s+)?(?:R\$\s*[\d.,]+|\d[\d.,]*\s*reais\b).*$/i, '').replace(/[\s:\-–—|]+$/, '').trim();
    if (l.length >= 4) cand.push({ l, p: pontuar(l), i });
  }
  if (!cand.length) return null;
  cand.sort((a, b) => b.p - a.p || a.i - b.i);
  return cand[0].p > 0 ? cand[0].l : null;
}

// Descrição do cupom ou do desconto: a linha com "OFF", "%" ou "desconto"
function descricaoDe(linhas) {
  for (const raw of linhas) {
    const l = limpa(raw.replace(URL_G, ' '));
    if (l.length < 5 || !OFF.test(l) || /moedas|cashback/i.test(l)) continue;
    const d = l.replace(/^\d{1,2}\s*[-–.)]?\s+/, '')
      .replace(/^(resgate|clique (para|e) resgatar|clique e resgate)\s+(o\s+)?/i, '')
      .replace(/\s*[-–:]\s*[A-Z][A-Z0-9]{4,24}\s*$/, '').replace(/[:\s]+$/, '');
    return d.charAt(0).toUpperCase() + d.slice(1);
  }
  return null;
}

// ---------- leitura ----------
// → { tipo, titulo, preco, precoDe, pagamento, parcelas, codes, cupomNoAnuncio, descricao, loja, link } | null
export function lerPost(texto) {
  const t = String(texto ?? '');
  const linhas = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const p = parsePromo(t);
  const links = p.links.filter((u) => { try { return !SOCIAL.test(new URL(u).hostname); } catch { return false; } });
  const comLoja = links.find((u) => storeFromUrl(u));
  const link = comLoja ?? links[0] ?? null;
  const loja = (comLoja && storeFromUrl(comLoja)) ?? storeFromText(t);

  // preço: a primeira linha com preço de produto
  let preco = null, precoDe = null, pagamento = null, parcelas = null, linhaPreco = linhas.length;
  for (const [i, l] of linhas.entries()) {
    const r = precoDaLinha(semEmoji(comoRotulo(l)));
    if (!r) continue;
    if (r.precoDe != null && precoDe == null) precoDe = r.precoDe;
    if (r.preco != null && preco == null) {
      preco = r.preco; pagamento = r.pagamento ?? null; parcelas = r.parcelas ?? null; linhaPreco = i;
      if (!pagamento && linhas[i + 1] && !precoDaLinha(semEmoji(comoRotulo(linhas[i + 1])))) {
        const prox = linhas[i + 1];
        pagamento = /\bpix\b/i.test(prox) ? 'pix' : /[àa]\s*vista/i.test(prox) ? 'avista' : /\d+\s*x\b/i.test(prox) ? 'parcelado' : null;
        const px = prox.match(/(\d{1,2})\s*x\s*sem juros/i);
        if (px && !parcelas) parcelas = { n: Number(px[1]), valor: Math.round(preco / Number(px[1])), semJuros: true };
      }
      if (!parcelas) {
        for (const prox of linhas.slice(i + 1, i + 3)) {
          const pm = semEmoji(prox).match(new RegExp(String.raw`(\d{1,2})\s*x\s*(?:de\s*)?(?:R\$\s*)?${NUM}`, 'i'));
          if (pm) { parcelas = { n: Number(pm[1]), valor: centavos(pm[2], pm[3]), semJuros: /sem juros/i.test(prox) ? true : /com juros/i.test(prox) ? false : null }; break; }
        }
      }
      break;
    }
  }
  if (precoDe != null && (preco == null || precoDe <= preco)) precoDe = null;

  const codes = [...new Set([...p.coupons, ...codigosExtras(linhas)])];
  const cupomNoAnuncio = /cupom (do|no) an[uú]ncio|resgate o cupom|ative o cupom (na|no) (p[aá]gina|an[uú]ncio)/i.test(t);
  const titulo = tituloDe(linhas, linhaPreco === linhas.length ? linhas.length : linhaPreco)
    ?? (linhaPreco < linhas.length ? tituloDe([linhas[linhaPreco]], 1) : null);   // "Air Fryer ... 220V - R$128"
  const descricao = descricaoDe(linhas);

  let tipo = null;
  if (preco != null && titulo) tipo = 'produto';
  else if (codes.length) tipo = 'cupom';
  else if (descricao && /cupom/i.test(t)) tipo = 'cupom';                 // cupom para resgatar, sem código
  else if (descricao) tipo = 'desconto';
  if (!tipo) return null;
  return {
    tipo, titulo: tipo === 'produto' ? titulo : (descricao ?? titulo), preco: tipo === 'produto' ? preco : null,
    precoDe: tipo === 'produto' ? precoDe : null, pagamento: tipo === 'produto' ? pagamento : null, parcelas: tipo === 'produto' ? parcelas : null,
    codes, cupomNoAnuncio, descricao, loja: loja ?? null, link,
  };
}
